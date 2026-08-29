/* ============================================================================
   ui.js — telas do app do bairro
   Duas abas: o mural, onde qualquer vizinho publica, e a associação, onde só
   a diretoria publica e todo mundo lê.

   O feed é uma lista, não uma pilha de cartões: itens uniformes separados por
   um fio. O tipo do aviso é dito por escrito no rótulo, e só ocorrência ganha
   cor — é o único caso em que a cor carrega informação de urgência.
   ========================================================================== */
(function (global) {
  'use strict';

  var D = global.Dados;
  var app = document.getElementById('app');

  var estado = { aba: 'mural', tipo: 'tudo', busca: '' };
  var rascunho = null;         // ficha do mural aberta
  var rascunhoOficial = null;  // ficha da associação aberta

  /* Traço de 1,5px, herdando a cor do texto — os únicos ícones do app. */
  var ICONE = {
    busca: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    mais: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Só deixa passar link de verdade — nada de javascript: num href nosso. */
  function linkSeguro(url) {
    var u = String(url || '').trim();
    return /^https?:\/\//i.test(u) ? u : null;
  }

  var SEP = '<span class="sep" aria-hidden="true">/</span>';

  function juntar(partes, sep) {
    return partes.filter(Boolean).join(sep || '<span class="sep" aria-hidden="true">·</span>');
  }

  function toast(msg) {
    var caixa = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    caixa.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ------------------------------------------------------------------ casca */
  function montarShell() {
    app.innerHTML =
      '<header class="topo"><div class="interno">' +
        '<div class="marca">' +
          '<b>Vizinhança</b>' +
          '<span class="lugar">Jardim das Acácias</span>' +
          '<span class="modo" id="modo"></span>' +
        '</div>' +
        '<div class="linha-abas">' +
          '<nav class="abas" id="abas">' +
            '<button data-aba="mural">Mural</button>' +
            '<button data-aba="associacao">Associação</button>' +
          '</nav>' +
          '<button class="publicar" id="btNovo" hidden></button>' +
        '</div>' +
      '</div></header>' +
      '<main id="conteudo"></main>';

    document.getElementById('abas').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-aba]');
      if (!b || b.dataset.aba === estado.aba) return;
      estado.aba = b.dataset.aba;
      pintarAbas(); pintarConteudo();
      window.scrollTo({ top: 0 });
    });
    document.getElementById('btNovo').addEventListener('click', function () {
      if (estado.aba !== 'associacao') { abrirFicha(); return; }
      // segunda tranca: publicar pela associação exige estar na diretoria,
      // independente de o botão ter aparecido por engano
      if (D.naAssociacao()) abrirFichaOficial();
    });
    document.getElementById('conteudo').addEventListener('click', aoClicar);
  }

  function pintarModo() {
    var el = document.getElementById('modo');
    if (el) el.textContent = D.modo === 'compartilhado' ? 'compartilhado' : 'demonstração';
  }

  function pintarAbas() {
    var fixados = D.fixados().length;
    var abas = document.getElementById('abas');
    abas.querySelectorAll('button').forEach(function (b) {
      var ligada = b.dataset.aba === estado.aba;
      b.className = ligada ? 'on' : '';
      b.setAttribute('aria-current', ligada ? 'page' : 'false');
    });
    abas.querySelector('[data-aba="associacao"]').innerHTML =
      'Associação' + (fixados ? '<span class="contagem">' + fixados + '</span>' : '');
  }

  function pintarBotaoNovo() {
    var bt = document.getElementById('btNovo');
    var mostra = estado.aba === 'mural' || D.naAssociacao();
    bt.hidden = !mostra;
    if (mostra) {
      bt.innerHTML = ICONE.mais + 'Publicar';
      bt.setAttribute('aria-label', estado.aba === 'mural' ? 'Publicar aviso no mural' : 'Publicar pela associação');
    }
  }

  function pintarConteudo() {
    pintarBotaoNovo();
    if (estado.aba === 'mural') montarMural();
    else montarAssociacao();
  }

  /* ------------------------------------------------------------------ mural */
  function montarMural() {
    document.getElementById('conteudo').innerHTML =
      '<div class="barra">' +
        '<div class="busca">' +
          '<span class="lupa">' + ICONE.busca + '</span>' +
          '<input id="busca" type="search" placeholder="Buscar aviso, rua ou pessoa" autocomplete="off">' +
        '</div>' +
        '<nav class="filtros" id="filtros"></nav>' +
      '</div>' +
      '<div class="feed" id="feed"></div>';

    var busca = document.getElementById('busca');
    busca.value = estado.busca;
    busca.addEventListener('input', function (ev) {
      estado.busca = ev.target.value;
      pintarFeed();
    });
    document.getElementById('filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-tipo]');
      if (!b) return;
      estado.tipo = b.dataset.tipo;
      pintarFiltros(); pintarFeed();
    });
    pintarFiltros(); pintarFeed();
  }

  function pintarFiltros() {
    var html = '<button' + (estado.tipo === 'tudo' ? ' class="on"' : '') + ' data-tipo="tudo">Tudo</button>';
    D.ORDEM_TIPOS.forEach(function (t) {
      html += '<button' + (estado.tipo === t ? ' class="on"' : '') + ' data-tipo="' + t + '">' +
        esc(D.TIPOS[t].plural) + '</button>';
    });
    document.getElementById('filtros').innerHTML = html;
  }

  function itemMural(a) {
    var info = D.TIPOS[a.tipo] || { nome: a.tipo };
    var urgente = a.tipo === 'ocorrencia' && !a.resolvido;
    var zap = D.linkZap(a);
    var confirmei = D.jaConfirmei(a);

    var rotulo = '<div class="rotulo' + (urgente ? ' alerta' : '') + '">' +
      (urgente ? '<span class="ponto"></span>' : '') +
      esc(info.nome) +
      (a.resolvido ? '<span class="selo">resolvido</span>' : '') +
      '<time>' + esc(D.quando(a.criadoEm)) + '</time>' +
    '</div>';

    var meta = juntar([
      a.rua ? esc(a.rua) : '',
      esc(a.autor),
      a.confirmacoes ? a.confirmacoes + (a.confirmacoes === 1 ? ' confirmou' : ' confirmaram') : ''
    ]);

    var acoes = '';
    if (zap) acoes += '<a class="bt forte" href="' + esc(zap) + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (!a.resolvido) {
      // numa ocorrência confirmar é "acontece comigo também"; no resto é recomendação
      var rot = a.tipo === 'ocorrencia' ? 'Também estou vendo' : 'Achei útil';
      acoes += '<button class="bt' + (confirmei ? ' feito' : '') + '" data-acao="confirmar" data-id="' + a.id + '"' +
        (confirmei ? ' disabled' : '') + '>' + (confirmei ? 'Você confirmou' : rot) + '</button>';
    }
    if (D.meu(a)) {
      acoes += '<button class="bt" data-acao="resolver" data-id="' + a.id + '">' +
        (a.resolvido ? 'Reabrir' : 'Resolvido') + '</button>' +
        '<button class="bt perigo" data-acao="remover" data-id="' + a.id + '">Apagar</button>';
    }

    return '<article class="item' + (a.resolvido ? ' resolvido' : '') + '">' +
      rotulo +
      '<h3>' + esc(a.titulo) + '</h3>' +
      (a.texto ? '<p class="texto">' + esc(a.texto) + '</p>' : '') +
      '<div class="meta">' + meta + '</div>' +
      (acoes ? '<div class="acoes">' + acoes + '</div>' : '') +
    '</article>';
  }

  function pintarFeed() {
    var lista = D.listar(estado);
    var arquivados = D.listar({ tipo: estado.tipo, busca: estado.busca, arquivo: true }).length;
    var html = '';

    // fixados da associação só aparecem quando ninguém está filtrando o mural
    if (estado.tipo === 'tudo' && !estado.busca) {
      D.fixados().forEach(function (o) { html += itemOficial(o, true); });
    }

    if (!lista.length) {
      html += '<div class="vazio">' +
        (estado.busca ? 'Nada encontrado para “' + esc(estado.busca) + '”.'
                      : 'Nenhum aviso por aqui ainda. Seja o primeiro a publicar.') +
        '</div>';
    } else {
      lista.forEach(function (a) { html += itemMural(a); });
    }

    if (arquivados) {
      html += '<div class="nota">' + arquivados + ' aviso(s) passaram do prazo e saíram do mural.</div>';
    }

    document.getElementById('feed').innerHTML = html;
  }

  /* ------------------------------------------------------------- associação */
  function montarAssociacao() {
    var dentro = D.naAssociacao();
    var html = '<div class="feed">' +
      '<section class="cabecalho">' +
        '<h2>Associação de Moradores</h2>' +
        '<p>Espaço oficial da diretoria. Aqui só a associação publica — avisos, ' +
        'informes e documentos ficam num lugar só, sem se perder no mural.</p>' +
        '<div class="acoes">' +
          (dentro
            ? '<span class="dentro">Área da diretoria</span>' +
              '<button class="bt" data-acao="sair-assoc">Sair</button>'
            : '<button class="bt" data-acao="entrar-assoc">Sou da diretoria</button>') +
        '</div>' +
      '</section>';

    D.ORDEM_ESPECIES.forEach(function (e) {
      var info = D.ESPECIES[e];
      var itens = D.listarOficiais(e);
      html += '<div class="secao">' + esc(info.plural) + '</div>';
      if (!itens.length) {
        html += '<div class="vazio">Nada em ' + esc(info.plural.toLowerCase()) + ' por enquanto.</div>';
      } else {
        itens.forEach(function (o) {
          html += e === 'documento' ? itemDocumento(o) : itemOficial(o, false);
        });
      }
    });

    document.getElementById('conteudo').innerHTML = html + '</div>';
  }

  function acoesDiretoria(o) {
    if (!D.naAssociacao()) return '';
    var html = '';
    if (o.especie === 'aviso') {
      html += '<button class="bt' + (o.fixado ? ' feito' : '') + '" data-acao="fixar" data-id="' + o.id + '">' +
        (o.fixado ? 'Fixado no mural' : 'Fixar no mural') + '</button>';
    }
    return html + '<button class="bt perigo" data-acao="remover-oficial" data-id="' + o.id + '">Apagar</button>';
  }

  /** noMural=true quando o item está aparecendo dentro do feed dos vizinhos. */
  function itemOficial(o, noMural) {
    var info = D.ESPECIES[o.especie];
    var acoes = noMural
      ? '<button class="bt" data-acao="ver-associacao">Ver tudo da associação</button>'
      : acoesDiretoria(o);

    // dentro da aba da associação o prefixo "Associação" seria redundante
    return '<article class="item oficial">' +
      '<div class="rotulo assoc">' +
        '<span class="ponto"></span>' +
        (noMural ? 'Associação' + SEP + esc(info.nome) : esc(info.nome)) +
        (o.fixado && !noMural ? '<span class="selo">no mural</span>' : '') +
        '<time>' + esc(D.quando(o.criadoEm)) + '</time>' +
      '</div>' +
      '<h3>' + esc(o.titulo) + '</h3>' +
      (o.texto ? '<p class="texto">' + esc(o.texto) + '</p>' : '') +
      '<div class="meta">' + esc(o.assinatura) + '</div>' +
      (acoes ? '<div class="acoes">' + acoes + '</div>' : '') +
    '</article>';
  }

  function itemDocumento(o) {
    var href = linkSeguro(o.link);
    var acoes = (href
      ? '<a class="bt" href="' + esc(href) + '" target="_blank" rel="noopener">Abrir documento</a>'
      : '<span class="selo">sem arquivo</span>') + acoesDiretoria(o);

    return '<article class="item doc">' +
      '<div class="doc-topo">' +
        '<h3>' + esc(o.titulo) + '</h3>' +
        (o.referencia ? '<span class="doc-data">' + esc(D.dataCurta(o.referencia)) + '</span>' : '') +
      '</div>' +
      (o.categoria ? '<div class="rotulo">' + esc(o.categoria) + '</div>' : '') +
      (o.texto ? '<p class="texto">' + esc(o.texto) + '</p>' : '') +
      '<div class="acoes">' + acoes + '</div>' +
    '</article>';
  }

  /* ------------------------------------------------------------- interações */
  function aoClicar(ev) {
    var b = ev.target.closest('button[data-acao]');
    if (!b) return;
    var acao = b.dataset.acao;

    if (acao === 'ver-associacao') {
      estado.aba = 'associacao';
      pintarAbas(); pintarConteudo(); window.scrollTo({ top: 0 });
      return;
    }
    if (acao === 'entrar-assoc') { abrirLogin(); return; }
    if (acao === 'sair-assoc') {
      D.sairAssociacao();
      pintarConteudo();
      toast('Você saiu da área da diretoria.');
      return;
    }

    var oficial = D.oficiais.filter(function (o) { return o.id === b.dataset.id; })[0];
    if (acao === 'fixar' && oficial) {
      D.alternarFixado(oficial).then(function () { pintarAbas(); pintarConteudo(); });
      return;
    }
    if (acao === 'remover-oficial' && oficial) {
      if (!confirm('Apagar esta publicação da associação?')) return;
      D.removerOficial(oficial).then(function () {
        pintarAbas(); pintarConteudo(); toast('Publicação apagada.');
      });
      return;
    }

    var aviso = D.avisos.filter(function (a) { return a.id === b.dataset.id; })[0];
    if (!aviso) return;
    if (acao === 'confirmar') {
      D.confirmar(aviso).then(function () { pintarFeed(); toast('Confirmação registrada.'); });
    } else if (acao === 'resolver') {
      D.alternarResolvido(aviso).then(function () { pintarFeed(); });
    } else if (acao === 'remover') {
      if (!confirm('Apagar este aviso?')) return;
      D.remover(aviso).then(function () { pintarFeed(); toast('Aviso apagado.'); });
    }
  }

  /* ----------------------------------------------------------------- fichas */
  function fundoFicha() {
    var f = document.getElementById('fundo');
    if (!f) {
      f = document.createElement('div');
      f.id = 'fundo'; f.className = 'fundo';
      document.body.appendChild(f);
      f.addEventListener('click', function (ev) { if (ev.target === f) fecharFicha(); });
    }
    return f;
  }

  function fecharFicha() {
    rascunho = null; rascunhoOficial = null;
    var f = document.getElementById('fundo');
    if (f) f.remove();
  }

  function mostrarErro(msg) {
    var el = document.getElementById('f-erro');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function guardarRascunho(alvo, campos) {
    campos.forEach(function (c) {
      var el = document.getElementById('f-' + c);
      if (el) alvo[c] = el.type === 'checkbox' ? el.checked : el.value;
    });
  }

  /* --------------------------------------------------------- ficha: entrar */
  function abrirLogin() {
    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Área da diretoria</h2>' +
        '<p class="explica">O código é o mesmo para toda a diretoria e fica com quem administra o app. ' +
        'Ele não é guardado neste aparelho.</p>' +
        '<div class="campo"><label for="f-codigo">Código da associação</label>' +
          '<input id="f-codigo" type="password" autocomplete="current-password" autocapitalize="none">' +
          (D.modo === 'compartilhado' ? '' :
            '<div class="dica">Na demonstração o código é <b>' + esc(D.CODIGO_DEMO) + '</b>.</div>') +
        '</div>' +
        '<div class="erro" id="f-erro" hidden></div>' +
        '<div class="rodape-ficha">' +
          '<button type="button" class="bt" id="f-cancelar">Cancelar</button>' +
          '<button type="submit" class="bt forte">Entrar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', function (ev) {
      ev.preventDefault();
      D.entrarAssociacao(document.getElementById('f-codigo').value).then(function (r) {
        if (!r.ok) { mostrarErro(r.erro); return; }
        fecharFicha();
        pintarConteudo();
        toast('Entrou como diretoria.');
      });
    });
    // a ficha pode ter fechado antes do foco chegar; então confere se ainda existe
    setTimeout(function () {
      var campo = document.getElementById('f-codigo');
      if (campo) campo.focus();
    }, 60);
  }

  /* -------------------------------------------------- ficha: aviso do mural */
  var CAMPOS_MURAL = ['titulo', 'texto', 'rua', 'autor', 'contato'];

  function abrirFicha() {
    rascunho = {
      tipo: estado.tipo === 'tudo' ? 'ocorrencia' : estado.tipo,
      titulo: '', texto: '', rua: '',
      autor: D.ler('bairro.nome') || '',
      contato: D.ler('bairro.zap') || ''
    };
    pintarFicha();
  }

  function pintarFicha() {
    var tipos = D.ORDEM_TIPOS.map(function (t) {
      return '<button type="button" data-tipo="' + t + '"' +
        (rascunho.tipo === t ? ' class="on"' : '') + '>' + esc(D.TIPOS[t].nome) + '</button>';
    }).join('');

    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Publicar aviso</h2>' +
        '<div class="campo"><label>Tipo</label><div class="opcoes" id="tipos">' + tipos + '</div></div>' +
        '<div class="campo"><label for="f-titulo">Título</label>' +
          '<input id="f-titulo" maxlength="120" placeholder="Sem luz na Rua das Acácias" value="' + esc(rascunho.titulo) + '" required>' +
        '</div>' +
        '<div class="campo"><label for="f-texto">Detalhes</label>' +
          '<textarea id="f-texto" maxlength="1200" placeholder="O que aconteceu, desde quando, o que você já fez…">' + esc(rascunho.texto) + '</textarea>' +
        '</div>' +
        '<div class="campo"><label for="f-rua">Rua ou referência</label>' +
          '<input id="f-rua" maxlength="80" placeholder="Rua Ipê Amarelo, altura do 300" value="' + esc(rascunho.rua) + '">' +
        '</div>' +
        '<div class="campo"><label for="f-autor">Seu nome</label>' +
          '<input id="f-autor" maxlength="60" placeholder="Como os vizinhos te conhecem" value="' + esc(rascunho.autor) + '">' +
        '</div>' +
        '<div class="campo"><label for="f-contato">WhatsApp (opcional)</label>' +
          '<input id="f-contato" inputmode="numeric" maxlength="15" placeholder="11999998888" value="' + esc(rascunho.contato) + '">' +
          '<div class="dica">Só com DDD e números. Fica visível para quem abrir o aviso.</div>' +
        '</div>' +
        '<div class="erro" id="f-erro" hidden></div>' +
        '<div class="rodape-ficha">' +
          '<button type="button" class="bt" id="f-cancelar">Cancelar</button>' +
          '<button type="submit" class="bt forte">Publicar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('tipos').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-tipo]');
      if (!b) return;
      guardarRascunho(rascunho, CAMPOS_MURAL);
      rascunho.tipo = b.dataset.tipo;
      pintarFicha();
    });
    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', enviarFicha);
  }

  function enviarFicha(ev) {
    ev.preventDefault();
    guardarRascunho(rascunho, CAMPOS_MURAL);

    if (!rascunho.titulo.trim()) { mostrarErro('Escreva um título para o aviso.'); return; }
    if (rascunho.contato && rascunho.contato.replace(/\D/g, '').length < 10) {
      mostrarErro('O WhatsApp precisa do DDD — ex.: 11999998888.');
      return;
    }

    // guarda o nome e o zap para não digitar de novo no próximo aviso
    D.guardar('bairro.nome', rascunho.autor);
    D.guardar('bairro.zap', rascunho.contato);

    D.publicar(rascunho).then(function () {
      fecharFicha();
      estado.tipo = 'tudo'; estado.busca = '';
      pintarConteudo();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(D.modo === 'compartilhado' ? 'Publicado no mural.' : 'Publicado (só neste aparelho).');
    });
  }

  /* ------------------------------------------ ficha: publicação da diretoria */
  function abrirFichaOficial() {
    rascunhoOficial = {
      especie: 'aviso', titulo: '', texto: '',
      categoria: D.CATEGORIAS_DOC[0], referencia: new Date().toISOString().slice(0, 10),
      link: '', fixado: false,
      assinatura: D.ler('bairro.assinatura') || 'Diretoria da associação'
    };
    pintarFichaOficial();
  }

  function camposOficiais() {
    return rascunhoOficial.especie === 'documento'
      ? ['titulo', 'texto', 'categoria', 'referencia', 'link', 'assinatura']
      : ['titulo', 'texto', 'fixado', 'assinatura'];
  }

  function pintarFichaOficial() {
    var r = rascunhoOficial;
    var doc = r.especie === 'documento';

    var especies = D.ORDEM_ESPECIES.map(function (e) {
      return '<button type="button" data-especie="' + e + '"' +
        (r.especie === e ? ' class="on"' : '') + '>' + esc(D.ESPECIES[e].nome) + '</button>';
    }).join('');

    var categorias = D.CATEGORIAS_DOC.map(function (c) {
      return '<option value="' + esc(c) + '"' + (r.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Publicar pela associação</h2>' +
        '<div class="campo"><label>O que é</label><div class="opcoes" id="especies">' + especies + '</div></div>' +
        '<div class="campo"><label for="f-titulo">Título</label>' +
          '<input id="f-titulo" maxlength="140" value="' + esc(r.titulo) + '" required placeholder="' +
          (doc ? 'Ata da assembleia de 14/09/2026' : 'Assembleia geral — 14/09, 9h') + '">' +
        '</div>' +

        (doc
          ? '<div class="campo"><label for="f-categoria">Categoria</label>' +
              '<select id="f-categoria">' + categorias + '</select></div>' +
            '<div class="campo"><label for="f-referencia">Data do documento</label>' +
              '<input id="f-referencia" type="date" value="' + esc(r.referencia) + '">' +
              '<div class="dica">A data do documento em si, não a de hoje. É por ela que a lista ordena.</div></div>' +
            '<div class="campo"><label for="f-link">Link do arquivo</label>' +
              '<input id="f-link" type="url" inputmode="url" placeholder="https://…" value="' + esc(r.link) + '">' +
              '<div class="dica">Cole o link do PDF no Google Drive, Dropbox ou onde o arquivo já estiver. ' +
              'Anexar o arquivo direto ainda não existe — está na lista.</div></div>' +
            '<div class="campo"><label for="f-texto">Resumo (opcional)</label>' +
              '<textarea id="f-texto" maxlength="600" placeholder="Uma linha dizendo o que tem dentro.">' + esc(r.texto) + '</textarea></div>'

          : '<div class="campo"><label for="f-texto">Texto</label>' +
              '<textarea id="f-texto" maxlength="4000" style="min-height:160px" placeholder="Escreva como se estivesse falando com o vizinho: o que é, quando, onde, o que ele precisa fazer.">' + esc(r.texto) + '</textarea></div>' +
            (r.especie === 'aviso'
              ? '<label class="caixinha"><input type="checkbox" id="f-fixado"' + (r.fixado ? ' checked' : '') + '>' +
                '<span>Fixar no topo do mural<small>Aparece também para quem só abre o mural. Use no que todo mundo precisa ver.</small></span></label>'
              : '')
        ) +

        '<div class="campo"><label for="f-assinatura">Assinatura</label>' +
          '<input id="f-assinatura" maxlength="60" value="' + esc(r.assinatura) + '" placeholder="Diretoria da associação">' +
        '</div>' +
        '<div class="erro" id="f-erro" hidden></div>' +
        '<div class="rodape-ficha">' +
          '<button type="button" class="bt" id="f-cancelar">Cancelar</button>' +
          '<button type="submit" class="bt forte">Publicar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('especies').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-especie]');
      if (!b) return;
      guardarRascunho(r, camposOficiais());
      r.especie = b.dataset.especie;
      pintarFichaOficial();
    });
    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', enviarFichaOficial);
  }

  function enviarFichaOficial(ev) {
    ev.preventDefault();
    var r = rascunhoOficial;
    guardarRascunho(r, camposOficiais());

    if (!r.titulo.trim()) { mostrarErro('Escreva um título.'); return; }
    if (r.especie !== 'documento' && !r.texto.trim()) {
      mostrarErro('Escreva o texto da publicação.');
      return;
    }
    if (r.especie === 'documento' && r.link.trim() && !linkSeguro(r.link)) {
      mostrarErro('O link precisa começar com https:// — copie da barra de endereço.');
      return;
    }

    D.guardar('bairro.assinatura', r.assinatura);

    D.publicarOficial(r).then(function () {
      fecharFicha();
      pintarAbas(); pintarConteudo();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(D.modo === 'compartilhado' ? 'Publicado pela associação.' : 'Publicado (só neste aparelho).');
    });
  }

  /* --------------------------------------------------------------- arranque */
  function iniciar() {
    D.carregar();
    montarShell();
    pintarModo(); pintarAbas(); pintarConteudo();
    D.sincronizar().then(function () {
      pintarModo(); pintarAbas(); pintarConteudo();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  global.UI = { toast: toast };
})(window);
