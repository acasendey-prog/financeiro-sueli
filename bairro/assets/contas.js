/* ============================================================================
   contas.js — cadastro e entrada dos moradores

   Dois modos, como o resto do app:
     • servidor — /api/conta responde; senha cifrada com scrypt no servidor,
                  confirmação por e-mail de verdade, sessão assinada
     • local    — sem backend; a conta fica só neste aparelho e o e-mail NÃO é
                  enviado. Serve para ver o app funcionando, não para valer.

   O modo local não é segurança: é uma maquete de segurança. Está escrito na
   tela para ninguém confundir os dois.
   ========================================================================== */
(function (global) {
  'use strict';

  var URL_API = '/api/conta';
  var CHAVE_SESSAO = 'bairro.sessao';
  var CHAVE_PERFIL = 'bairro.perfil';
  var CHAVE_CONTAS = 'bairro.contas.demo';

  function ler(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, valor); return true; } catch (e) { return false; }
  }
  function apagar(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* nada a fazer */ }
  }

  /* Digest só para o modo local não guardar senha em texto puro no aparelho.
     Onde houver crypto.subtle usa SHA-256; onde não houver (arquivo aberto
     direto do disco), cai num embaralhamento simples — que, de novo, é
     maquete: a segurança de verdade mora no servidor. */
  function digerir(texto) {
    if (global.crypto && global.crypto.subtle) {
      var bytes = new TextEncoder().encode('bairro:' + texto);
      return global.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    var h = 5381;
    for (var i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
    return Promise.resolve('fraco-' + h.toString(16));
  }

  var so = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };
  var digitos = function (v, max) { return String(v == null ? '' : v).replace(/\D/g, '').slice(0, max); };

  /* As mesmas regras valem nos dois modos; o servidor confere de novo, porque
     validação de navegador é conveniência, não defesa. */
  function criticar(d) {
    if (so(d.nome, 60).length < 2) return 'Escreva seu nome completo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(so(d.email, 120))) return 'Confira o e-mail — falta algo nele.';
    if (digitos(d.celular, 11).length < 10) return 'O celular precisa do DDD — ex.: 11999998888.';
    if (!so(d.rua, 100)) return 'Escreva o nome da sua rua.';
    if (!so(d.numero, 12)) return 'Falta o número da casa.';
    if (String(d.senha || '').length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
    if (String(d.senha) !== String(d.senha2)) return 'As duas senhas não são iguais.';
    if (!d.consentimento) return 'Marque a autorização para a associação guardar seus dados.';
    return null;
  }

  var ERROS = {
    credencial_invalida: 'E-mail ou senha não conferem.',
    nao_confirmado: 'Falta confirmar o e-mail. Procure a mensagem que enviamos.',
    nao_aprovado: 'Sua conta ainda não foi liberada pela diretoria da associação.',
    email_invalido: 'Confira o e-mail — falta algo nele.',
    celular_invalido: 'O celular precisa do DDD.',
    endereco_incompleto: 'Falta a rua ou o número.',
    senha_curta: 'A senha precisa de pelo menos 8 caracteres.',
    sem_consentimento: 'Marque a autorização para a associação guardar seus dados.',
    servidor_sem_segredo: 'O servidor ainda não está configurado. Avise quem administra o app.'
  };

  var Contas = {
    modo: 'local',     // local | servidor
    perfil: null,
    sessao: null,
    erroServidor: null,

    /* ------------------------------------------------------------ arranque */
    carregar: function () {
      this.sessao = ler(CHAVE_SESSAO);
      try { this.perfil = JSON.parse(ler(CHAVE_PERFIL)); } catch (e) { this.perfil = null; }
      if (!this.sessao) this.perfil = null;
      return this;
    },

    autenticado: function () { return !!(this.sessao && this.perfil); },

    primeiroNome: function () {
      return this.perfil ? String(this.perfil.nome).split(' ')[0] : '';
    },

    inicial: function () {
      return this.perfil ? String(this.perfil.nome).trim().charAt(0).toUpperCase() : '?';
    },

    /** Confere a sessão com o servidor; decide o modo. Nunca rejeita.

       Só conta como backend a resposta que a nossa função sabe dar: 200, ou
       401/403 recusando a sessão. Qualquer outro código — 404 de rota
       inexistente, 501 de servidor estático, 503 do backend desligado — é
       ausência de backend. Reconhecer pelo que responde certo, e não pela
       lista de erros conhecidos, evita cair no modo errado com um servidor
       que ninguém previu. */
    verificar: function () {
      var self = this;
      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sessao': self.sessao || '' },
        body: JSON.stringify({ acao: 'eu', dados: {} })
      }).then(function (r) {
        if (r.status === 500) {
          // backend existe, mas está mal configurado. Silenciar isso viraria
          // "modo demonstração" sem avisar, e as pessoas se cadastrariam no
          // vazio achando que estavam se cadastrando de verdade.
          return r.json().catch(function () { return {}; }).then(function (j) {
            self.modo = 'servidor';
            self.erroServidor = ERROS[j.erro] || 'O servidor está com problema.';
            return false;
          });
        }
        if (!r.ok && r.status !== 401 && r.status !== 403) throw new Error('sem backend');

        self.modo = 'servidor';
        if (r.ok) {
          return r.json().then(function (j) {
            self.perfil = j.perfil;
            guardar(CHAVE_PERFIL, JSON.stringify(j.perfil));
            return true;
          });
        }
        // sessão vencida ou conta revogada: a pessoa entra de novo
        self.sair();
        return false;
      }).catch(function () {
        self.modo = 'local';
        return self.autenticado();
      });
    },

    /* ----------------------------------------------------------- cadastrar */
    cadastrar: function (d) {
      var self = this;
      var erro = criticar(d);
      if (erro) return Promise.resolve({ ok: false, erro: erro });

      if (this.modo !== 'servidor') return this._cadastrarLocal(d);

      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'cadastrar', dados: d })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) return { ok: false, erro: ERROS[j.erro] || 'Não deu para cadastrar agora.' };
          return { ok: true, precisaConfirmar: true, emailEnviado: j.emailEnviado !== false };
        });
      }).catch(function () {
        return { ok: false, erro: 'Sem conexão com o servidor. Tente de novo.' };
      });
    },

    _cadastrarLocal: function (d) {
      var self = this;
      var email = so(d.email, 120).toLowerCase();
      var contas = self._contasLocais();
      if (contas.some(function (c) { return c.email === email; })) {
        return Promise.resolve({ ok: false, erro: 'Já existe uma conta com este e-mail neste aparelho.' });
      }
      return digerir(d.senha).then(function (hash) {
        contas.push({
          id: 'demo-' + Date.now().toString(36),
          nome: so(d.nome, 60), email: email, celular: digitos(d.celular, 11),
          endereco: { rua: so(d.rua, 100), numero: so(d.numero, 12), complemento: so(d.complemento, 60) },
          hash: hash, papel: 'morador'
        });
        guardar(CHAVE_CONTAS, JSON.stringify(contas));
        // sem servidor não há e-mail para enviar, então a conta já nasce válida
        return { ok: true, precisaConfirmar: false, demo: true };
      });
    },

    /* --------------------------------------------------------------- entrar */
    entrar: function (email, senha) {
      var self = this;
      email = so(email, 120).toLowerCase();
      if (!email || !senha) return Promise.resolve({ ok: false, erro: 'Preencha e-mail e senha.' });

      if (this.modo !== 'servidor') return this._entrarLocal(email, senha);

      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'entrar', dados: { email: email, senha: senha } })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) return { ok: false, erro: ERROS[j.erro] || 'Não deu para entrar agora.' };
          self._guardarSessao(j.sessao, j.perfil);
          return { ok: true };
        });
      }).catch(function () {
        return { ok: false, erro: 'Sem conexão com o servidor. Tente de novo.' };
      });
    },

    _entrarLocal: function (email, senha) {
      var self = this;
      var conta = self._contasLocais().filter(function (c) { return c.email === email; })[0];
      return digerir(senha).then(function (hash) {
        if (!conta || conta.hash !== hash) return { ok: false, erro: ERROS.credencial_invalida };
        self._guardarSessao('demo-' + conta.id, {
          id: conta.id, nome: conta.nome, email: conta.email, celular: conta.celular,
          endereco: conta.endereco, papel: conta.papel, confirmado: true, aprovado: true
        });
        return { ok: true };
      });
    },

    /* ------------------------------------------- diretoria: liberar acesso
       Só existe com backend: no modo local não há fila de aprovação porque
       não há ninguém do outro lado para aprovar. */
    pendentes: function (credencial) {
      if (this.modo !== 'servidor' || !credencial) return Promise.resolve([]);
      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-associacao': credencial },
        body: JSON.stringify({ acao: 'pendentes', dados: {} })
      }).then(function (r) { return r.ok ? r.json() : { contas: [] }; })
        .then(function (j) { return j.contas || []; })
        .catch(function () { return []; });
    },

    aprovar: function (credencial, id, sim) {
      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-associacao': credencial },
        body: JSON.stringify({ acao: 'aprovar', dados: { id: id, aprovado: !!sim } })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    },

    sair: function () {
      this.sessao = null; this.perfil = null;
      apagar(CHAVE_SESSAO); apagar(CHAVE_PERFIL);
    },

    /* ---------------------------------------------------------------- resto */
    _guardarSessao: function (sessao, perfil) {
      this.sessao = sessao; this.perfil = perfil;
      guardar(CHAVE_SESSAO, sessao);
      guardar(CHAVE_PERFIL, JSON.stringify(perfil));
    },

    _contasLocais: function () {
      try { return JSON.parse(ler(CHAVE_CONTAS)) || []; } catch (e) { return []; }
    }
  };

  global.Contas = Contas;
})(window);
