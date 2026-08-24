/* ============================================================================
   sync.js — sincronização com o servidor
   O navegador cifra a base antes de enviar. O servidor guarda apenas o pacote
   cifrado + um número de revisão, para detectar edição simultânea.
   ========================================================================== */
(function (global) {
  'use strict';

  var URL_API = '/api/dados';

  var Sync = {
    disponivel: false,     // existe backend nesta hospedagem?
    estado: 'inicial',     // inicial | sincronizado | enviando | offline | conflito | sem-servidor
    rev: 0,
    ultimo: null,
    erro: null,
    _t: null,
    _fila: false,

    apelidoDispositivo: function () {
      var ua = navigator.userAgent;
      var so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android'
        : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'navegador';
      return so;
    },

    _mudou: function (estado, erro) {
      this.estado = estado; this.erro = erro || null;
      document.dispatchEvent(new CustomEvent('fin:sync', { detail: { estado: estado, erro: erro } }));
    },

    /** busca a base do servidor. Resolve com {db, rev} | {vazio:true} | null (sem servidor) */
    puxar: function () {
      var self = this;
      if (!global.Store.token || !global.Store.chave) return Promise.resolve(null);
      return fetch(URL_API, { headers: { authorization: 'Bearer ' + global.Store.token }, cache: 'no-store' })
        .then(function (r) {
          if (r.status === 404) { self.disponivel = false; self._mudou('sem-servidor'); return null; }
          if (r.status === 401) { self.disponivel = true; self._mudou('offline', 'Senha não confere com a do servidor.'); return null; }
          if (!r.ok) throw new Error('HTTP ' + r.status);
          self.disponivel = true;
          return r.json();
        })
        .then(function (j) {
          if (!j) return null;
          if (j.vazio) { self.rev = 0; self._mudou('sincronizado'); return { vazio: true }; }
          return global.Cripto.decifrarChave(global.Store.chave, j.pacote).then(function (obj) {
            self.rev = j.rev; self.ultimo = j.atualizadoEm;
            self._mudou('sincronizado');
            return { db: obj, rev: j.rev, atualizadoEm: j.atualizadoEm, dispositivo: j.dispositivo };
          });
        })
        .catch(function (e) {
          if (/Failed to fetch|NetworkError/i.test(e.message)) { self._mudou('offline'); return null; }
          self.disponivel = false; self._mudou('sem-servidor'); return null;
        });
    },

    /** envia a base atual. force=true ignora a revisão (sobrescreve) */
    empurrar: function (db, force) {
      var self = this;
      if (!global.Store.token || !global.Store.chave) return Promise.resolve(false);
      self._mudou('enviando');
      return global.Cripto.cifrarChave(global.Store.chave, db).then(function (pac) {
        return fetch(URL_API, {
          method: 'PUT',
          headers: { authorization: 'Bearer ' + global.Store.token, 'content-type': 'application/json' },
          body: JSON.stringify({ pacote: pac, revEsperada: force ? undefined : self.rev, dispositivo: self.apelidoDispositivo() })
        });
      }).then(function (r) {
        if (r.status === 409) {
          return r.json().then(function (j) {
            self.rev = j.rev;
            self._mudou('conflito', 'Outro aparelho gravou depois. Puxe os dados do servidor antes de continuar.');
            return false;
          });
        }
        if (r.status === 404) { self.disponivel = false; self._mudou('sem-servidor'); return false; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function (j) {
          self.disponivel = true; self.rev = j.rev; self.ultimo = j.atualizadoEm;
          self._mudou('sincronizado');
          return true;
        });
      }).catch(function (e) {
        self._mudou('offline', e.message);
        self._fila = true;
        return false;
      });
    },

    /** agenda envio com atraso — junta várias edições seguidas num só PUT */
    agendar: function (db) {
      var self = this;
      if (!self.disponivel && self.estado === 'sem-servidor') return;
      clearTimeout(self._t);
      self._t = setTimeout(function () { self.empurrar(db); }, 1800);
    },

    /** tenta reenviar o que ficou pendente quando a rede volta */
    reconectar: function (db) {
      if (this._fila || this.estado === 'offline') { this._fila = false; return this.empurrar(db); }
      return Promise.resolve(true);
    }
  };

  global.Sync = Sync;
})(window);
