/* ============================================================================
   store.js — camada de persistência
   IndexedDB (principal) + localStorage (espelho/fallback) + export/import JSON.
   Grava sozinho a cada alteração, com histórico das últimas operações.
   ========================================================================== */
(function (global) {
  'use strict';

  var IDB_NAME = 'financeiro-sueli';
  var IDB_STORE = 'kv';
  var IDB_KEY = 'db';
  var LS_KEY = 'fin.db.v1';
  var LS_LOG = 'fin.log.v1';
  var SCHEMA = 3;

  /* ------------------------------------------------------------- IndexedDB */
  function openIDB() {
    return new Promise(function (res, rej) {
      if (!global.indexedDB) return rej(new Error('sem indexedDB'));
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbGet(k) {
    return openIDB().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(k);
        t.onsuccess = function () { res(t.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbPut(k, v) {
    return openIDB().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(v, k);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  /* ------------------------------------------------------------ migrações */
  function migrate(db) {
    if (!db || typeof db !== 'object') return null;
    db.versao = db.versao || 1;
    db.meta = db.meta || {};
    db.categorias = db.categorias || { receita: [], despesa: [] };
    db.lancamentos = db.lancamentos || [];
    db.parcelamentos = db.parcelamentos || [];
    db.metas = db.metas || [];
    db.emprestimos = db.emprestimos || [];
    db.recorrentes = db.recorrentes || [];
    if (db.versao < 2) { db.recorrentes = db.recorrentes || []; db.versao = 2; }
    if (db.versao < 3) {
      db.lancamentos.forEach(function (l) { if (!l.conta) l.conta = 'Banco'; });
      db.versao = 3;
    }
    db.esquema = SCHEMA;
    return db;
  }

  /* --------------------------------------------------------------- objeto */
  var Store = {
    db: null,
    dirty: false,
    lastSave: null,
    listeners: [],
    _t: null,

    chave: null,         // CryptoKey não exportável, para cifrar o que vai ao servidor
    token: null,         // credencial de acesso ao servidor
    persistente: null,   // o navegador prometeu não descartar os dados?

    /** guarda chave e token para as próximas aberturas deste aparelho */
    guardarCredenciais: function (chave, token) {
      this.chave = chave; this.token = token;
      return Promise.all([idbPut('chave', chave), idbPut('token', token)]).catch(function () { });
    },
    lerCredenciais: function () {
      var self = this;
      return Promise.all([idbGet('chave').catch(function () { }), idbGet('token').catch(function () { })])
        .then(function (r) { self.chave = r[0] || null; self.token = r[1] || null; return !!(self.chave && self.token); });
    },
    limparCredenciais: function () {
      this.chave = null; this.token = null;
      return Promise.all([idbPut('chave', undefined), idbPut('token', undefined)]).catch(function () { });
    },

    /** pede ao navegador para marcar o armazenamento como persistente */
    pedirPersistencia: function () {
      var self = this;
      if (!navigator.storage || !navigator.storage.persist) { self.persistente = 'indisponível'; return Promise.resolve(); }
      return navigator.storage.persisted().then(function (ja) {
        if (ja) { self.persistente = true; return; }
        return navigator.storage.persist().then(function (ok) { self.persistente = !!ok; });
      }).catch(function () { self.persistente = 'indisponível'; });
    },

    /** espaço usado e disponível, quando o navegador informa */
    quota: function () {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().catch(function () { return null; });
    },

    /** carrega: IndexedDB > localStorage > semente */
    init: function () {
      var self = this;
      this.pedirPersistencia();
      return this.lerCredenciais().then(function () { return idbGet(IDB_KEY); })
        .catch(function () { return null; })
        .then(function (v) {
          if (v) return v;
          try {
            var raw = localStorage.getItem(LS_KEY);
            if (raw) return JSON.parse(raw);
          } catch (e) { /* ignora */ }
          return null;
        })
        .then(function (v) {
          if (v) { self.db = migrate(v); self.origem = 'gravado'; return self.db; }
          if (global.__SEED__) {                       // base aberta (uso local)
            self.db = migrate(JSON.parse(JSON.stringify(global.__SEED__)));
            self.origem = 'semente'; self.persist(true);
            return self.db;
          }
          self.db = null;                              // precisa destravar com senha
          self.origem = 'bloqueado';
          return null;
        });
    },

    /** adota uma base recém-destravada ou importada */
    adotar: function (obj, origem) {
      this.db = migrate(obj);
      this.origem = origem || 'semente';
      this.persist(true);
      this.log('Base carregada (' + this.origem + ')');
      return this.db;
    },

    on: function (fn) { this.listeners.push(fn); },
    emit: function () { var d = this.db; this.listeners.forEach(function (f) { try { f(d); } catch (e) { console.error(e); } }); },

    /** marca alteração: grava local (debounce), envia ao servidor e re-renderiza */
    touch: function (descricao) {
      this.dirty = true;
      if (this.db && this.db.meta) this.db.meta.modificadoEm = new Date().toISOString();
      if (descricao) this.log(descricao);
      this.persist(false);
      if (global.Sync) Sync.agendar(this.db);
      this.emit();
    },

    persist: function (imediato) {
      var self = this;
      clearTimeout(this._t);
      var doIt = function () {
        var payload = self.db;
        var ok = false;
        try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); ok = true; } catch (e) { console.warn('localStorage cheio', e); }
        idbPut(IDB_KEY, payload).then(function () {
          self.dirty = false; self.lastSave = new Date();
          document.dispatchEvent(new CustomEvent('fin:saved'));
        }).catch(function (e) {
          if (ok) { self.dirty = false; self.lastSave = new Date(); document.dispatchEvent(new CustomEvent('fin:saved')); }
          else document.dispatchEvent(new CustomEvent('fin:saveerror', { detail: e }));
        });
      };
      if (imediato) doIt(); else this._t = setTimeout(doIt, 350);
    },

    log: function (txt) {
      try {
        var l = JSON.parse(localStorage.getItem(LS_LOG) || '[]');
        l.unshift({ t: new Date().toISOString(), d: txt });
        localStorage.setItem(LS_LOG, JSON.stringify(l.slice(0, 300)));
      } catch (e) { /* ignora */ }
    },
    historico: function () {
      try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]'); } catch (e) { return []; }
    },

    /* ------------------------------------------------------- backup/reset */
    exportar: function () {
      return JSON.stringify({
        _app: 'financeiro-sueli',
        _exportadoEm: new Date().toISOString(),
        _esquema: SCHEMA,
        db: this.db
      }, null, 2);
    },
    importar: function (txt) {
      var o = JSON.parse(txt);
      var d = o && o.db ? o.db : o;
      if (!d || !Array.isArray(d.lancamentos)) throw new Error('Arquivo não reconhecido.');
      this.db = migrate(d);
      this.persist(true);
      this.log('Backup importado (' + d.lancamentos.length + ' lançamentos)');
      this.emit();
    },
    temSementeAberta: function () { return !!global.__SEED__; },
    restaurarSemente: function () {
      if (!global.__SEED__) throw new Error('A base original está protegida por senha. Use “Restaurar backup”.');
      this.db = migrate(JSON.parse(JSON.stringify(global.__SEED__)));
      this.persist(true);
      this.log('Base restaurada para a planilha original');
      this.emit();
    },
    apagarTudo: function () {
      try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_LOG); } catch (e) {}
      var self = this;
      return idbPut(IDB_KEY, undefined).catch(function () {})
        .then(function () { return self.limparCredenciais(); });
    },

    novoId: function (pref) {
      return (pref || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
  };

  global.Store = Store;
})(window);
