/* ============================================================================
   dados.js — camada de dados do mural do bairro

   Dois modos, decididos sozinho no arranque:
     • compartilhado — existe /api/mural respondendo; todo mundo vê o mesmo mural
     • local         — sem backend; os avisos ficam só neste aparelho (demonstração)

   O esqueleto já funciona inteiro no modo local, então dá para abrir o arquivo
   e testar sem instalar nada.
   ========================================================================== */
(function (global) {
  'use strict';

  var CHAVE = 'bairro.v1';
  var URL_API = '/api/mural';

  /* Cada tipo de aviso tem cor, ícone e prazo de validade próprios. Aviso de
     falta d'água não interessa depois de uma semana; serviço de manicure sim. */
  var TIPOS = {
    servico:    { nome: 'Serviço',    plural: 'Serviços',       ic: '🔧', cor: 'var(--t-servico)',    dias: 60 },
    ocorrencia: { nome: 'Ocorrência', plural: 'Ocorrências',    ic: '⚠️', cor: 'var(--t-ocorrencia)', dias: 7  },
    evento:     { nome: 'Evento',     plural: 'Eventos',        ic: '📅', cor: 'var(--t-evento)',     dias: 30 },
    perdido:    { nome: 'Perdido',    plural: 'Achados e perdidos', ic: '🐶', cor: 'var(--t-perdido)', dias: 30 },
    doacao:     { nome: 'Doação',     plural: 'Doações e trocas', ic: '🎁', cor: 'var(--t-doacao)',   dias: 30 }
  };
  var ORDEM_TIPOS = ['ocorrencia', 'servico', 'evento', 'perdido', 'doacao'];

  var DIA = 86400000;

  function agora() { return new Date().toISOString(); }

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* identificação do aparelho: serve só para saber o que este celular publicou
     e impedir que a mesma pessoa confirme o mesmo aviso duas vezes. */
  function aparelho() {
    var v = localStorage.getItem('bairro.aparelho');
    if (!v) { v = id(); localStorage.setItem('bairro.aparelho', v); }
    return v;
  }

  function exemplos() {
    var t = Date.now();
    var base = [
      { tipo: 'ocorrencia', titulo: 'Sem água na Rua das Acácias desde as 6h',
        texto: 'Prédio 120 e vizinhos. Já abri chamado na companhia, protocolo 88213-4.',
        rua: 'Rua das Acácias', autor: 'Marcos', contato: '', h: 3, confirmacoes: 7 },
      { tipo: 'servico', titulo: 'Faço unha em casa — gel e fibra',
        texto: 'Atendo de terça a sábado, das 9h às 19h. Agendamento pelo WhatsApp.',
        rua: 'Rua Ipê Amarelo', autor: 'Cleide', contato: '11999990000', h: 26, confirmacoes: 0 },
      { tipo: 'perdido', titulo: 'Gato cinza sumiu perto da praça',
        texto: 'Atende por Fumaça, tem coleira vermelha. Sumiu na noite de ontem.',
        rua: 'Praça Central', autor: 'Dona Vera', contato: '11988887777', h: 30, confirmacoes: 2 },
      { tipo: 'evento', titulo: 'Mutirão de limpeza da praça — sábado 8h',
        texto: 'Levar luva e saco de lixo. A associação entra com as ferramentas.',
        rua: 'Praça Central', autor: 'Associação de Moradores', contato: '', h: 50, confirmacoes: 11 },
      { tipo: 'doacao', titulo: 'Doo berço e carrinho de bebê',
        texto: 'Estão usados mas inteiros. Retirar no local, prefiro quem precisa mesmo.',
        rua: 'Rua Jacarandá', autor: 'Paula', contato: '11977776666', h: 70, confirmacoes: 0 }
    ];
    return base.map(function (e) {
      var criado = new Date(t - e.h * 3600000).toISOString();
      return {
        id: id(), tipo: e.tipo, titulo: e.titulo, texto: e.texto, rua: e.rua,
        autor: e.autor, contato: e.contato, criadoEm: criado, resolvido: false,
        confirmacoes: e.confirmacoes, autorAparelho: 'exemplo'
      };
    });
  }

  var Dados = {
    TIPOS: TIPOS,
    ORDEM_TIPOS: ORDEM_TIPOS,
    modo: 'local',          // local | compartilhado
    avisos: [],
    confirmados: [],        // ids que ESTE aparelho já confirmou

    /* --------------------------------------------------------- persistência */
    carregar: function () {
      var cru = null;
      try { cru = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { cru = null; }
      if (!cru) {
        this.avisos = exemplos();
        this.confirmados = [];
        this.primeiraVez = true;
        this.gravar();
      } else {
        this.avisos = cru.avisos || [];
        this.confirmados = cru.confirmados || [];
      }
      return this;
    },

    gravar: function () {
      try {
        localStorage.setItem(CHAVE, JSON.stringify({ avisos: this.avisos, confirmados: this.confirmados }));
      } catch (e) { /* aba anônima ou disco cheio — segue só em memória */ }
    },

    /* ------------------------------------------------------------ consultas */
    /** Um aviso "venceu" quando passou do prazo do tipo dele. */
    vencido: function (a) {
      var prazo = (TIPOS[a.tipo] || {}).dias || 30;
      return Date.now() - new Date(a.criadoEm).getTime() > prazo * DIA;
    },

    meu: function (a) { return a.autorAparelho === aparelho(); },

    jaConfirmei: function (a) { return this.confirmados.indexOf(a.id) >= 0; },

    /** Lista filtrada e ordenada: mais recente primeiro, resolvidos no fim. */
    listar: function (filtro) {
      var self = this;
      var tipo = (filtro && filtro.tipo) || 'tudo';
      var busca = ((filtro && filtro.busca) || '').trim().toLowerCase();
      var arquivo = !!(filtro && filtro.arquivo);

      return this.avisos.filter(function (a) {
        if (arquivo !== self.vencido(a)) return false;
        if (tipo !== 'tudo' && a.tipo !== tipo) return false;
        if (busca) {
          var alvo = (a.titulo + ' ' + a.texto + ' ' + a.rua + ' ' + a.autor).toLowerCase();
          if (alvo.indexOf(busca) < 0) return false;
        }
        return true;
      }).sort(function (x, y) {
        if (!!x.resolvido !== !!y.resolvido) return x.resolvido ? 1 : -1;
        return new Date(y.criadoEm) - new Date(x.criadoEm);
      });
    },

    contarPorTipo: function (busca) {
      var conta = { tudo: 0 };
      ORDEM_TIPOS.forEach(function (t) { conta[t] = 0; });
      this.listar({ tipo: 'tudo', busca: busca }).forEach(function (a) {
        conta.tudo++; if (conta[a.tipo] !== undefined) conta[a.tipo]++;
      });
      return conta;
    },

    /* -------------------------------------------------------------- escrita */
    publicar: function (dados) {
      var novo = {
        id: id(),
        tipo: dados.tipo,
        titulo: String(dados.titulo || '').trim().slice(0, 120),
        texto: String(dados.texto || '').trim().slice(0, 1200),
        rua: String(dados.rua || '').trim().slice(0, 80),
        autor: String(dados.autor || '').trim().slice(0, 60) || 'Vizinho',
        contato: String(dados.contato || '').replace(/\D/g, '').slice(0, 13),
        criadoEm: agora(),
        resolvido: false,
        confirmacoes: 0,
        autorAparelho: aparelho()
      };
      this.avisos.unshift(novo);
      this.gravar();
      return this._enviar('publicar', novo).then(function () { return novo; });
    },

    confirmar: function (aviso) {
      if (this.jaConfirmei(aviso)) return Promise.resolve(false);
      aviso.confirmacoes = (aviso.confirmacoes || 0) + 1;
      this.confirmados.push(aviso.id);
      this.gravar();
      return this._enviar('confirmar', { id: aviso.id }).then(function () { return true; });
    },

    alternarResolvido: function (aviso) {
      aviso.resolvido = !aviso.resolvido;
      this.gravar();
      return this._enviar('resolver', { id: aviso.id, resolvido: aviso.resolvido });
    },

    remover: function (aviso) {
      this.avisos = this.avisos.filter(function (a) { return a.id !== aviso.id; });
      this.gravar();
      return this._enviar('remover', { id: aviso.id });
    },

    /* ------------------------------------------------- conversa com o servidor
       Enquanto não houver backend, tudo isso vira no-op e o app segue local. */
    sincronizar: function () {
      var self = this;
      return fetch(URL_API, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('sem backend');
          return r.json();
        })
        .then(function (j) {
          self.modo = 'compartilhado';
          if (Array.isArray(j.avisos)) { self.avisos = j.avisos; self.gravar(); }
          return true;
        })
        .catch(function () { self.modo = 'local'; return false; });
    },

    _enviar: function (acao, corpo) {
      if (this.modo !== 'compartilhado') return Promise.resolve(false);
      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: acao, dados: corpo, aparelho: aparelho() })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    },

    /* ------------------------------------------------------------- utilidades */
    /** "há 3 h", "ontem", "12/03" — o suficiente para o feed. */
    quando: function (iso) {
      var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (min < 2) return 'agora';
      if (min < 60) return 'há ' + min + ' min';
      var h = Math.round(min / 60);
      if (h < 24) return 'há ' + h + ' h';
      var d = Math.round(h / 24);
      if (d === 1) return 'ontem';
      if (d < 7) return 'há ' + d + ' dias';
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    },

    linkZap: function (aviso) {
      if (!aviso.contato) return null;
      var num = aviso.contato.length <= 11 ? '55' + aviso.contato : aviso.contato;
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent('Oi! Vi seu aviso no app do bairro: ' + aviso.titulo);
    },

    aparelho: aparelho
  };

  global.Dados = Dados;
})(window);
