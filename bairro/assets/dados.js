/* ============================================================================
   dados.js — camada de dados do app do bairro

   São dois espaços com regras diferentes:
     • mural      — qualquer vizinho publica
     • associação — só quem tem o código da associação publica; todo mundo lê

   Dois modos, decididos sozinho no arranque:
     • compartilhado — existe /api/mural respondendo; todo mundo vê o mesmo
     • local         — sem backend; fica só neste aparelho (demonstração)
   ========================================================================== */
(function (global) {
  'use strict';

  var CHAVE = 'bairro.v1';
  var URL_API = '/api/mural';
  var CODIGO_DEMO = 'associacao';   // só vale no modo demonstração

  /* Cada tipo de aviso do mural tem só nome e prazo de validade. Nada de cor
     própria: a cor não é o que distingue um do outro na tela — o rótulo
     escrito é. Falta d'água não interessa depois de uma semana; manicure sim. */
  var TIPOS = {
    servico:    { nome: 'Serviço',    plural: 'Serviços',           dias: 60 },
    ocorrencia: { nome: 'Ocorrência', plural: 'Ocorrências',        dias: 7  },
    evento:     { nome: 'Evento',     plural: 'Eventos',            dias: 30 },
    perdido:    { nome: 'Perdido',    plural: 'Perdidos',           dias: 30 },
    doacao:     { nome: 'Doação',     plural: 'Doações',            dias: 30 }
  };
  var ORDEM_TIPOS = ['ocorrencia', 'servico', 'evento', 'perdido', 'doacao'];

  /* O verbo de encerrar muda com o tipo. "Resolvido" serve para falta d'água,
     mas ninguém resolve uma manicure, e gato perdido a gente quer é encontrar
     — o rótulo certo é o que faz a pessoa entender o botão sem pensar. */
  var ENCERRAR = {
    ocorrencia: { acao: 'Marcar resolvido', selo: 'resolvido' },
    servico:    { acao: 'Encerrar',         selo: 'encerrado' },
    evento:     { acao: 'Encerrar',         selo: 'encerrado' },
    perdido:    { acao: 'Foi encontrado',   selo: 'encontrado' },
    doacao:     { acao: 'Já foi doado',     selo: 'doado' }
  };

  /* Publicações da associação. Documento não vence: ata de 2019 continua
     valendo como registro. */
  var ESPECIES = {
    aviso:     { nome: 'Aviso',     plural: 'Avisos',     dias: 45 },
    informe:   { nome: 'Informe',   plural: 'Informes',   dias: 180 },
    documento: { nome: 'Documento', plural: 'Documentos', dias: null }
  };
  var ORDEM_ESPECIES = ['aviso', 'informe', 'documento'];

  var CATEGORIAS_DOC = [
    'Ata de assembleia', 'Balancete', 'Prestação de contas', 'Convenção',
    'Regimento interno', 'Edital', 'Ofício', 'Outro'
  ];

  var DIA = 86400000;

  function agora() { return new Date().toISOString(); }

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* localStorage pode simplesmente lançar exceção — aba anônima, cookies
     bloqueados, disco cheio. Nenhuma leitura ou escrita pode derrubar o app. */
  function ler(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  function guardar(chave, valor) {
    try { localStorage.setItem(chave, valor); return true; } catch (e) { return false; }
  }

  function apagarChave(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* nada a fazer */ }
  }

  var aparelhoCache = null;

  /* identificação do aparelho: serve só para saber o que este celular publicou
     e impedir que a mesma pessoa confirme o mesmo aviso duas vezes. */
  function aparelho() {
    if (aparelhoCache) return aparelhoCache;
    var v = ler('bairro.aparelho');
    if (!v) { v = id(); guardar('bairro.aparelho', v); }
    aparelhoCache = v;
    return v;
  }

  /* Escrever o atributo na raiz é o que faz a folha de estilo trocar; a cor
     da barra do navegador acompanha para o app não ficar com a moldura de um
     tema e o conteúdo de outro. */
  function aplicarTema(valor) {
    var raiz = document.documentElement;
    if (valor === 'claro' || valor === 'escuro') raiz.dataset.tema = valor;
    else delete raiz.dataset.tema;

    var escuro = valor === 'escuro' ||
      (valor === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', escuro ? '#131416' : '#f6f6f4');
  }

  function exemplosMural() {
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
        rua: 'Praça Central', autor: 'Associação de Moradores', contato: '', h: 50, confirmacoes: 0,
        inscritos: ['Marcos', 'Cleide', 'Paula', 'Seu Antônio', 'Dona Vera'] },
      { tipo: 'doacao', titulo: 'Doo berço e carrinho de bebê',
        texto: 'Estão usados mas inteiros. Retirar no local, prefiro quem precisa mesmo.',
        rua: 'Rua Jacarandá', autor: 'Paula', contato: '11977776666', h: 70, confirmacoes: 0 }
    ];
    return base.map(function (e) {
      return {
        id: id(), tipo: e.tipo, titulo: e.titulo, texto: e.texto, rua: e.rua,
        autor: e.autor, contato: e.contato,
        criadoEm: new Date(t - e.h * 3600000).toISOString(),
        resolvido: false, resolvidoPor: null, confirmacoes: e.confirmacoes,
        inscritos: (e.inscritos || []).map(function (n, i) { return { ap: 'exemplo' + i, nome: n }; }),
        autorAparelho: 'exemplo'
      };
    });
  }

  function exemplosOficiais() {
    var t = Date.now();
    var base = [
      { especie: 'aviso', titulo: 'Assembleia geral ordinária — 14/09, 9h, salão da igreja',
        texto: 'Pauta: prestação de contas de 2025, eleição da nova diretoria e obra do portão da praça. ' +
               'Quem não puder ir pode mandar procuração assinada por outro morador.',
        fixado: true, h: 20 },
      { especie: 'aviso', titulo: 'Coleta de recicláveis muda para quarta-feira',
        texto: 'A partir de setembro o caminhão passa às quartas, entre 7h e 10h. Deixar na calçada só depois das 6h.',
        fixado: false, h: 96 },
      { especie: 'informe', titulo: 'O que a associação fez no primeiro semestre',
        texto: 'Trocamos 18 lâmpadas de poste com a concessionária, conseguimos a poda das árvores da Rua Ipê ' +
               'e abrimos 3 chamados de tapa-buraco (2 atendidos). O caixa fechou o semestre com R$ 2.480,00.\n\n' +
               'O que está parado: a faixa de pedestre em frente à escola, que depende da prefeitura.',
        fixado: false, h: 240 },
      { especie: 'documento', titulo: 'Ata da assembleia de 10/05/2026', categoria: 'Ata de assembleia',
        referencia: '2026-05-10', link: 'https://exemplo.org/ata-2026-05-10.pdf', h: 300 },
      { especie: 'documento', titulo: 'Balancete — 1º semestre de 2026', categoria: 'Balancete',
        referencia: '2026-06-30', link: 'https://exemplo.org/balancete-2026-1s.pdf', h: 260 },
      { especie: 'documento', titulo: 'Estatuto da associação', categoria: 'Convenção',
        referencia: '2019-03-22', link: 'https://exemplo.org/estatuto.pdf', h: 3000 }
    ];
    return base.map(function (e) {
      return {
        id: id(), especie: e.especie, titulo: e.titulo, texto: e.texto || '',
        categoria: e.categoria || '', referencia: e.referencia || '',
        link: e.link || '', arquivo: null, fixado: !!e.fixado,
        assinatura: 'Diretoria da associação',
        criadoEm: new Date(t - e.h * 3600000).toISOString()
      };
    });
  }

  var Dados = {
    TIPOS: TIPOS,
    ORDEM_TIPOS: ORDEM_TIPOS,
    ESPECIES: ESPECIES,
    ORDEM_ESPECIES: ORDEM_ESPECIES,
    CATEGORIAS_DOC: CATEGORIAS_DOC,
    CODIGO_DEMO: CODIGO_DEMO,

    modo: 'local',          // local | compartilhado
    avisos: [],             // mural dos vizinhos
    oficiais: [],           // publicações da associação
    confirmados: [],        // ids que ESTE aparelho já confirmou
    credencial: null,       // preenchida quando entrou como associação

    /* --------------------------------------------------------- persistência */
    carregar: function () {
      var cru = null;
      try { cru = JSON.parse(ler(CHAVE)); } catch (e) { cru = null; }
      if (!cru) {
        this.avisos = exemplosMural();
        this.oficiais = exemplosOficiais();
        this.confirmados = [];
        this.gravar();
      } else {
        this.avisos = cru.avisos || [];
        this.oficiais = cru.oficiais || [];
        this.confirmados = cru.confirmados || [];
      }
      this.credencial = ler('bairro.credencial');
      return this;
    },

    gravar: function () {
      // se não der para gravar (aba anônima, disco cheio), segue só em memória
      guardar(CHAVE, JSON.stringify({
        avisos: this.avisos, oficiais: this.oficiais, confirmados: this.confirmados
      }));
    },

    /* ------------------------------------------------------ mural: consultas */
    /** Um aviso "venceu" quando passou do prazo do tipo dele. */
    vencido: function (a) {
      var prazo = (TIPOS[a.tipo] || {}).dias || 30;
      return Date.now() - new Date(a.criadoEm).getTime() > prazo * DIA;
    },

    meu: function (a) { return a.autorAparelho === aparelho(); },

    /** Reabrir e apagar são de quem publicou — ou da diretoria, que modera. */
    podeReabrir: function (a) { return this.meu(a) || this.naAssociacao(); },

    encerrar: function (tipo) { return ENCERRAR[tipo] || ENCERRAR.ocorrencia; },

    /** Quem encerrou: 'autor', 'diretoria' ou 'vizinho'. */
    quemEncerrou: function (a) {
      if (a.resolvidoPor === 'vizinho') return 'por um vizinho';
      if (a.resolvidoPor === 'diretoria') return 'pela associação';
      return '';
    },

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

    /* -------------------------------------------------------- mural: escrita */
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
        resolvidoPor: null,
        confirmacoes: 0,
        inscritos: [],
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

    /* Encerrar qualquer vizinho pode: quem viu a água voltar sabe disso antes
       de quem publicou. Reabrir é que fica restrito a quem publicou e à
       diretoria — assim um engano se desfaz, mas não vira disputa. */
    alternarResolvido: function (aviso) {
      var reabrindo = !!aviso.resolvido;
      if (reabrindo && !this.podeReabrir(aviso)) return Promise.resolve(false);

      aviso.resolvido = !reabrindo;
      aviso.resolvidoPor = aviso.resolvido
        ? (this.meu(aviso) ? 'autor' : (this.naAssociacao() ? 'diretoria' : 'vizinho'))
        : null;
      this.gravar();
      return this._enviar('resolver', {
        id: aviso.id, resolvido: aviso.resolvido, resolvidoPor: aviso.resolvidoPor
      });
    },

    /* ------------------------------------------------- presença em evento
       Num mutirão, saber quantos vêm muda o que o organizador leva. */
    inscritos: function (a) { return a.inscritos || []; },

    estouInscrito: function (a) {
      var eu = aparelho();
      return this.inscritos(a).some(function (i) { return i.ap === eu; });
    },

    /** "Marcos, Cleide e mais 3" — nome de quem organiza a lista mentalmente */
    nomesInscritos: function (a) {
      var nomes = this.inscritos(a).map(function (i) { return i.nome; });
      if (!nomes.length) return '';
      if (nomes.length <= 3) return nomes.join(', ');
      return nomes.slice(0, 2).join(', ') + ' e mais ' + (nomes.length - 2);
    },

    alternarInscricao: function (a) {
      var eu = aparelho();
      var dentro = this.estouInscrito(a);
      var nome = String(ler('bairro.nome') || '').trim().slice(0, 60) || 'Vizinho';

      a.inscritos = dentro
        ? this.inscritos(a).filter(function (i) { return i.ap !== eu; })
        : this.inscritos(a).concat([{ ap: eu, nome: nome }]);
      this.gravar();
      return this._enviar('inscrever', { id: a.id, entrando: !dentro, nome: nome })
        .then(function () { return !dentro; });
    },

    remover: function (aviso) {
      this.avisos = this.avisos.filter(function (a) { return a.id !== aviso.id; });
      this.gravar();
      return this._enviar('remover', { id: aviso.id });
    },

    /* --------------------------------------------------- associação: acesso
       O código da associação nunca fica guardado no aparelho. O que fica é a
       credencial devolvida pelo servidor, que ele sabe conferir e pode
       invalidar trocando a variável de ambiente. */
    naAssociacao: function () { return !!this.credencial; },

    entrarAssociacao: function (codigo) {
      var self = this;
      codigo = String(codigo || '').trim();
      if (!codigo) return Promise.resolve({ ok: false, erro: 'Digite o código da associação.' });

      if (this.modo !== 'compartilhado') {
        // sem backend não há o que conferir: vale o código de demonstração
        if (codigo.toLowerCase() !== CODIGO_DEMO) {
          return Promise.resolve({ ok: false, erro: 'Código não confere.' });
        }
        this.credencial = 'demonstracao';
        guardar('bairro.credencial', this.credencial);
        return Promise.resolve({ ok: true });
      }

      return fetch(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'entrar', dados: { codigo: codigo }, aparelho: aparelho() })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j.credencial) {
            return { ok: false, erro: r.status === 401 ? 'Código não confere.' : 'Não deu para entrar agora.' };
          }
          self.credencial = j.credencial;
          guardar('bairro.credencial', self.credencial);
          return { ok: true };
        });
      }).catch(function () {
        return { ok: false, erro: 'Sem conexão com o servidor.' };
      });
    },

    sairAssociacao: function () {
      this.credencial = null;
      apagarChave('bairro.credencial');
    },

    /* ------------------------------------------------ associação: consultas */
    /** Informe velho sai da lista; documento fica para sempre. */
    oficialVencido: function (o) {
      var prazo = (ESPECIES[o.especie] || {}).dias;
      if (!prazo) return false;
      return Date.now() - new Date(o.criadoEm).getTime() > prazo * DIA;
    },

    listarOficiais: function (especie, busca) {
      var self = this;
      busca = (busca || '').trim().toLowerCase();
      return this.oficiais.filter(function (o) {
        if (o.especie !== especie) return false;
        if (self.oficialVencido(o)) return false;
        if (busca) {
          var alvo = (o.titulo + ' ' + o.texto + ' ' + o.categoria).toLowerCase();
          if (alvo.indexOf(busca) < 0) return false;
        }
        return true;
      }).sort(function (x, y) {
        if (!!x.fixado !== !!y.fixado) return x.fixado ? -1 : 1;
        // documento ordena pela data de referência; o resto, pela publicação
        var dx = x.especie === 'documento' && x.referencia ? x.referencia : x.criadoEm;
        var dy = y.especie === 'documento' && y.referencia ? y.referencia : y.criadoEm;
        return new Date(dy) - new Date(dx);
      });
    },

    /** Avisos que a associação fixou — aparecem no topo do mural também. */
    fixados: function () {
      var self = this;
      return this.oficiais.filter(function (o) {
        return o.fixado && o.especie === 'aviso' && !self.oficialVencido(o);
      }).sort(function (x, y) { return new Date(y.criadoEm) - new Date(x.criadoEm); });
    },

    /* -------------------------------------------------- associação: escrita */
    publicarOficial: function (dados) {
      var novo = {
        id: id(),
        especie: dados.especie,
        titulo: String(dados.titulo || '').trim().slice(0, 140),
        texto: String(dados.texto || '').trim().slice(0, 4000),
        categoria: String(dados.categoria || '').trim().slice(0, 40),
        referencia: String(dados.referencia || '').slice(0, 10),
        link: String(dados.link || '').trim().slice(0, 400),
        arquivo: null,
        fixado: !!dados.fixado,
        assinatura: String(dados.assinatura || '').trim().slice(0, 60) || 'Diretoria da associação',
        criadoEm: agora()
      };
      this.oficiais.unshift(novo);
      this.gravar();
      return this._enviar('publicar-oficial', novo).then(function () { return novo; });
    },

    alternarFixado: function (o) {
      o.fixado = !o.fixado;
      this.gravar();
      return this._enviar('fixar-oficial', { id: o.id, fixado: o.fixado });
    },

    removerOficial: function (o) {
      this.oficiais = this.oficiais.filter(function (x) { return x.id !== o.id; });
      this.gravar();
      return this._enviar('remover-oficial', { id: o.id });
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
          if (Array.isArray(j.avisos)) self.avisos = j.avisos;
          if (Array.isArray(j.oficiais)) self.oficiais = j.oficiais;
          self.gravar();
          return true;
        })
        .catch(function () {
          self.modo = 'local';
          // credencial do servidor não vale no modo local, e vice-versa
          if (self.credencial && self.credencial !== 'demonstracao') self.sairAssociacao();
          return false;
        });
    },

    _enviar: function (acao, corpo) {
      if (this.modo !== 'compartilhado') return Promise.resolve(false);
      var cabecalhos = { 'content-type': 'application/json' };
      if (this.credencial) cabecalhos['x-associacao'] = this.credencial;
      return fetch(URL_API, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({ acao: acao, dados: corpo, aparelho: aparelho() })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    },

    /* ------------------------------------------------------------ utilidades */
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

    /** data de referência de documento: "10/05/2026" */
    dataCurta: function (iso) {
      if (!iso) return '';
      var p = String(iso).slice(0, 10).split('-');
      return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
    },

    /* A mensagem já vai escrita. Num serviço quase sempre o que a pessoa quer
       é preço, então o pedido de orçamento vira o texto padrão. */
    linkZap: function (aviso, motivo) {
      if (!aviso.contato) return null;
      var num = aviso.contato.length <= 11 ? '55' + aviso.contato : aviso.contato;
      var texto = motivo === 'orcamento'
        ? 'Oi! Vi seu anúncio no app do bairro — ' + aviso.titulo + '. Pode me passar um orçamento?'
        : 'Oi! Vi seu aviso no app do bairro: ' + aviso.titulo;
      return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
    },

    /* ---------------------------------------------------- fundo claro/escuro
       'auto' segue o aparelho; 'claro' e 'escuro' são escolha da pessoa e
       valem acima do aparelho. Fica no localStorage porque é preferência de
       quem está com o celular na mão, não do bairro. */
    TEMAS: ['auto', 'claro', 'escuro'],

    tema: function () {
      var v = ler('bairro.tema');
      return v === 'claro' || v === 'escuro' ? v : 'auto';
    },

    definirTema: function (valor) {
      if (this.TEMAS.indexOf(valor) < 0) valor = 'auto';
      if (valor === 'auto') apagarChave('bairro.tema');
      else guardar('bairro.tema', valor);
      aplicarTema(valor);
      return valor;
    },

    /** devolve o próximo da roda: auto -> claro -> escuro -> auto */
    proximoTema: function () {
      var t = this.TEMAS;
      return t[(t.indexOf(this.tema()) + 1) % t.length];
    },

    aparelho: aparelho,
    ler: ler,
    guardar: guardar
  };

  global.Dados = Dados;
})(window);
