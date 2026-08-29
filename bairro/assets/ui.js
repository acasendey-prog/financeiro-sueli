/* ============================================================================
   ui.js — telas do app do bairro
   Duas abas: o mural, onde qualquer vizinho publica, e a associação, onde só
   a diretoria publica e todo mundo lê.
   ========================================================================== */
(function (global) {
  'use strict';

  var D = global.Dados;
  var app = document.getElementById('app');

  var estado = { aba: 'mural', tipo: 'tudo', busca: '' };
  var rascunho = null;      // ficha do mural aberta
  var rascunhoOficial = null;  // ficha da associação aberta

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
      '<header class="topo">' +
        '<div class="marca">' +
          '<img src="icons/icon-192.png" alt="">' +
          '<div><b>Vizinhança</b><span>Bairro Jardim das Acácias</span></div>' +
          '<div class="modo" id="modo"></div>' +
        '</div>' +
        '<nav class="abas" id="abas">' +
          '<button data-aba="mural">Mural</button>' +
          '<button data-aba="associacao">Associação</button>' +
        '</nav>' +
      '</header>' +
      '<main id="conteudo"></main>' +
      '<button class="novo" id="btNovo" hidden></button>';

    document.getElementById('abas').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-aba]');
      if (!b || b.dataset.aba === estado.aba) return;
      estado.aba = b.dataset.aba;
      pintarAbas(); pintarConteudo();
      window.scrollTo({ top: 0 });
    });
    document.getElementById('btNovo').addEventListener('click', function () {
      if (estado.aba === 'associacao') abrirFichaOficial();
      else abrirFicha();
    });
    document.getElementById('conteudo').addEventListener('click', aoClicar);
  }

  function pintarModo() {
    var el = document.getElementById('modo');
    if (!el) return;
    el.textContent = D.modo === 'compartilhado'
      ? 'mural compartilhado'
      : 'modo demonstração — fica só neste aparelho';
  }

  function pintarAbas() {
    var fixados = D.fixados().length;
    var abas = document.getElementById('abas');
    abas.querySelectorAll('button').forEach(function (b) {
      var ligada = b.dataset.aba === estado.aba;
      b.className = ligada ? 'on' : '';
      b.setAttribute('aria-current', ligada ? 'page' : 'false');
    });
    var bt = abas.querySelector('[data-aba="associacao"]');
    bt.innerHTML = 'Associação' + (fixados ? ' <span class="bolinha">' + fixados + '</span>' : '');
  }

  function pintarBotaoNovo() {
    var bt = document.getElementById('btNovo');
    if (estado.aba === 'mural') {
      bt.hidden = false;
      bt.textContent = '+ Publicar aviso';
    } else if (D.naAssociacao()) {
      bt.hidden = false;
      bt.textContent = '+ Publicar da associação';
    } else {
      bt.hidden = true;
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
          '<span class="lupa">🔍</span>' +
          '<input id="busca" type="search" placeholder="Buscar aviso, rua ou pessoa" autocomplete="off">' +
        '</div>' +
        '<nav class="filtros" id="filtros"></nav>' +
      '</div>' +
      '<div class="feed" id="feed"></div>';

    var busca = document.getElementById('busca');
    busca.value = estado.busca;
    busca.addEventListener('input', function (ev) {
      estado.busca = ev.target.value;
      pintarChips(); pintarFeed();
    });
    document.getElementById('filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest('.chip');
      if (!b) return;
      estado.tipo = b.dataset.tipo;
      pintarChips(); pintarFeed();
    });
    pintarChips(); pintarFeed();
  }

  function pintarChips() {
    var conta = D.contarPorTipo(estado.busca);
    var html = '<button class="chip' + (estado.tipo === 'tudo' ? ' on' : '') + '" data-tipo="tudo">Tudo · ' + conta.tudo + '</button>';
    D.ORDEM_TIPOS.forEach(function (t) {
      var info = D.TIPOS[t];
      html += '<button class="chip' + (estado.tipo === t ? ' on' : '') + '" data-tipo="' + t + '">' +
        info.ic + ' ' + esc(info.plural) + ' · ' + conta[t] + '</button>';
    });
    document.getElementById('filtros').innerHTML = html;
  }

  function cartao(a) {
    var info = D.TIPOS[a.tipo] || { nome: a.tipo, cor: 'var(--brand)' };
    var zap = D.linkZap(a);
    var confirmei = D.jaConfirmei(a);

    var meta = [];
    if (a.rua) meta.push('📍 ' + esc(a.rua));
    meta.push('👤 ' + esc(a.autor));
    if (a.confirmacoes) meta.push('👍 ' + a.confirmacoes + (a.confirmacoes === 1 ? ' vizinho confirmou' : ' vizinhos confirmaram'));

    var acoes = '';
    if (zap) acoes += '<a class="bt zap" href="' + esc(zap) + '" target="_blank" rel="noopener">Chamar no WhatsApp</a>';
    if (!a.resolvido) {
      // numa ocorrência confirmar é "acontece comigo também"; no resto é recomendação
      var rotulo = a.tipo === 'ocorrencia' ? 'Também estou vendo isso' : 'Achei útil';
      acoes += '<button class="bt' + (confirmei ? ' on' : '') + '" data-acao="confirmar" data-id="' + a.id + '"' +
        (confirmei ? ' disabled' : '') + '>' + (confirmei ? '✓ Você confirmou' : rotulo) + '</button>';
    }
    if (D.meu(a)) {
      acoes += '<button class="bt" data-acao="resolver" data-id="' + a.id + '">' +
        (a.resolvido ? 'Reabrir' : 'Marcar como resolvido') + '</button>';
      acoes += '<button class="bt perigo" data-acao="remover" data-id="' + a.id + '">Apagar</button>';
    }

    return '<article class="aviso' + (a.resolvido ? ' resolvido' : '') + '" style="--cor:' + info.cor + '">' +
      '<div class="cab">' +
        '<span class="tag">' + info.ic + ' ' + esc(info.nome) + '</span>' +
        (a.resolvido ? '<span class="selo-resolvido">resolvido</span>' : '') +
        '<span class="quando">' + esc(D.quando(a.criadoEm)) + '</span>' +
      '</div>' +
      '<h3>' + esc(a.titulo) + '</h3>' +
      (a.texto ? '<p class="texto">' + esc(a.texto) + '</p>' : '') +
      '<div class="meta">' + meta.join(' <span aria-hidden="true">·</span> ') + '</div>' +
      (acoes ? '<div class="acoes">' + acoes + '</div>' : '') +
    '</article>';
  }

  /** Aviso fixado pela associação, mostrado no topo do mural. */
  function faixaOficial(o) {
    return '<article class="aviso oficial fixado">' +
      '<div class="cab">' +
        '<span class="tag">📢 Associação</span>' +
        '<span class="quando">' + esc(D.quando(o.criadoEm)) + '</span>' +
      '</div>' +
      '<h3>' + esc(o.titulo) + '</h3>' +
      (o.texto ? '<p class="texto">' + esc(o.texto) + '</p>' : '') +
      '<div class="acoes"><button class="bt" data-acao="ver-associacao">Ver tudo da associação</button></div>' +
    '</article>';
  }

  function pintarFeed() {
    var lista = D.listar(estado);
    var arquivados = D.listar({ tipo: estado.tipo, busca: estado.busca, arquivo: true }).length;
    var html = '';

    // só mostra os fixados quando ninguém está filtrando o mural
    if (estado.tipo === 'tudo' && !estado.busca) {
      D.fixados().forEach(function (o) { html += faixaOficial(o); });
    }

    if (!lista.length) {
      html += '<div class="vazio"><span class="icone">🏘️</span>' +
        (estado.busca ? 'Nada encontrado para “' + esc(estado.busca) + '”.'
                      : 'Nenhum aviso por aqui ainda. Seja o primeiro a publicar.') +
        '</div>';
    } else {
      lista.forEach(function (a) { html += cartao(a); });
    }

    if (arquivados) {
      html += '<div class="secao">Avisos vencidos</div>' +
        '<div class="vazio" style="padding:18px">' + arquivados +
        ' aviso(s) passaram do prazo e saíram do mural.</div>';
    }

    document.getElementById('feed').innerHTML = html;
  }

  /* ------------------------------------------------------------- associação */
  function montarAssociacao() {
    var dentro = D.naAssociacao();
    var html = '<div class="feed">' +
      '<section class="painel">' +
        '<h2>Associação de Moradores</h2>' +
        '<p>Espaço oficial da diretoria. Aqui só a associação publica — os avisos, ' +
        'informes e documentos ficam num lugar só, sem se perder no meio do mural.</p>' +
        '<div class="acoes">' +
          (dentro
            ? '<span class="selo-dentro">✓ Você está na área da diretoria</span>' +
              '<button class="bt" data-acao="sair-assoc">Sair</button>'
            : '<button class="bt claro" data-acao="entrar-assoc">Sou da diretoria</button>') +
        '</div>' +
      '</section>';

    D.ORDEM_ESPECIES.forEach(function (e) {
      var info = D.ESPECIES[e];
      var itens = D.listarOficiais(e);
      html += '<div class="secao">' + info.ic + ' ' + esc(info.plural) + '</div>';
      if (!itens.length) {
        html += '<div class="vazio" style="padding:26px 18px">Nada publicado em ' +
          esc(info.plural.toLowerCase()) + ' por enquanto.</div>';
      } else {
        itens.forEach(function (o) {
          html += e === 'documento' ? linhaDocumento(o) : cartaoOficial(o);
        });
      }
    });

    document.getElementById('conteudo').innerHTML = html + '</div>';
  }

  function acoesDiretoria(o) {
    if (!D.naAssociacao()) return '';
    var html = '';
    if (o.especie === 'aviso') {
      html += '<button class="bt' + (o.fixado ? ' on' : '') + '" data-acao="fixar" data-id="' + o.id + '">' +
        (o.fixado ? '📌 Fixado no mural' : 'Fixar no mural') + '</button>';
    }
    html += '<button class="bt perigo" data-acao="remover-oficial" data-id="' + o.id + '">Apagar</button>';
    return html;
  }

  function cartaoOficial(o) {
    var info = D.ESPECIES[o.especie];
    var acoes = acoesDiretoria(o);
    return '<article class="aviso oficial">' +
      '<div class="cab">' +
        '<span class="tag">' + info.ic + ' ' + esc(info.nome) + '</span>' +
        (o.fixado ? '<span class="selo-fixado">📌 no mural</span>' : '') +
        '<span class="quando">' + esc(D.quando(o.criadoEm)) + '</span>' +
      '</div>' +
      '<h3>' + esc(o.titulo) + '</h3>' +
      (o.texto ? '<p class="texto">' + esc(o.texto) + '</p>' : '') +
      '<div class="meta">✍️ ' + esc(o.assinatura) + '</div>' +
      (acoes ? '<div class="acoes">' + acoes + '</div>' : '') +
    '</article>';
  }

  function linhaDocumento(o) {
    var href = linkSeguro(o.link);
    var acoes = acoesDiretoria(o);
    return '<article class="doc">' +
      '<span class="doc-ic" aria-hidden="true">📄</span>' +
      '<div class="doc-corpo">' +
        '<h3>' + esc(o.titulo) + '</h3>' +
        '<div class="meta">' +
          (o.categoria ? '<span class="cat">' + esc(o.categoria) + '</span>' : '') +
          (o.referencia ? ' <span aria-hidden="true">·</span> ' + esc(D.dataCurta(o.referencia)) : '') +
        '</div>' +
        (o.texto ? '<p class="texto">' + esc(o.texto) + '</p>' : '') +
        '<div class="acoes">' +
          (href
            ? '<a class="bt claro" href="' + esc(href) + '" target="_blank" rel="noopener">Abrir documento</a>'
            : '<span class="sem-arquivo">Sem arquivo anexado</span>') +
          acoes +
        '</div>' +
      '</div>' +
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
      D.alternarResolvido(aviso).then(function () { pintarChips(); pintarFeed(); });
    } else if (acao === 'remover') {
      if (!confirm('Apagar este aviso?')) return;
      D.remover(aviso).then(function () { pintarChips(); pintarFeed(); toast('Aviso apagado.'); });
    }
  }

  /* --------------------------------------------------------------- fichas */
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

  /* ------------------------------------------------------ ficha: entrar */
  function abrirLogin() {
    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Área da diretoria</h2>' +
        '<p class="explica">O código é o mesmo para toda a diretoria e fica com quem administra o app. ' +
        'Ele não é guardado neste aparelho.</p>' +
        '<div class="campo"><label for="f-codigo">Código da associação</label>' +
          '<input id="f-codigo" type="password" autocomplete="current-password" autocapitalize="none">' +
          (D.modo === 'compartilhado' ? '' :
            '<div class="dica">No modo demonstração o código é <b>' + esc(D.CODIGO_DEMO) + '</b>.</div>') +
        '</div>' +
        '<div class="erro" id="f-erro" hidden></div>' +
        '<div class="rodape-ficha">' +
          '<button type="button" class="bt" id="f-cancelar">Cancelar</button>' +
          '<button type="submit" class="bt ok">Entrar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', function (ev) {
      ev.preventDefault();
      D.entrarAssociacao(document.getElementById('f-codigo').value).then(function (r) {
        if (!r.ok) { mostrarErro(r.erro); return; }
        fecharFicha();
        pintarConteudo();
        toast('Entrou como diretoria da associação.');
      });
    });
    setTimeout(function () { document.getElementById('f-codigo').focus(); }, 60);
  }

  /* -------------------------------------------------- ficha: aviso do mural */
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
      var i = D.TIPOS[t];
      return '<button type="button" data-tipo="' + t + '" style="--cor:' + i.cor + '"' +
        (rascunho.tipo === t ? ' class="on"' : '') + '><span class="ic">' + i.ic + '</span>' + esc(i.nome) + '</button>';
    }).join('');

    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Publicar aviso</h2>' +
        '<div class="campo"><label>Tipo</label><div class="tipos" id="tipos">' + tipos + '</div></div>' +
        '<div class="campo"><label for="f-titulo">Título</label>' +
          '<input id="f-titulo" maxlength="120" placeholder="Ex.: Sem luz na Rua das Acácias" value="' + esc(rascunho.titulo) + '" required>' +
        '</div>' +
        '<div class="campo"><label for="f-texto">Detalhes</label>' +
          '<textarea id="f-texto" maxlength="1200" placeholder="O que aconteceu, desde quando, o que você já fez…">' + esc(rascunho.texto) + '</textarea>' +
        '</div>' +
        '<div class="campo"><label for="f-rua">Rua ou referência</label>' +
          '<input id="f-rua" maxlength="80" placeholder="Ex.: Rua Ipê Amarelo, altura do 300" value="' + esc(rascunho.rua) + '">' +
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
          '<button type="submit" class="bt ok">Publicar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('tipos').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-tipo]');
      if (!b) return;
      guardarRascunho(rascunho, ['titulo', 'texto', 'rua', 'autor', 'contato']);
      rascunho.tipo = b.dataset.tipo;
      pintarFicha();
    });
    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', enviarFicha);
  }

  function guardarRascunho(alvo, campos) {
    campos.forEach(function (c) {
      var el = document.getElementById('f-' + c);
      if (el) alvo[c] = el.type === 'checkbox' ? el.checked : el.value;
    });
  }

  function enviarFicha(ev) {
    ev.preventDefault();
    guardarRascunho(rascunho, ['titulo', 'texto', 'rua', 'autor', 'contato']);

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
      toast(D.modo === 'compartilhado' ? 'Publicado no mural do bairro.' : 'Publicado (só neste aparelho).');
    });
  }

  /* ------------------------------------------- ficha: publicação da diretoria */
  function abrirFichaOficial() {
    rascunhoOficial = {
      especie: 'aviso', titulo: '', texto: '',
      categoria: D.CATEGORIAS_DOC[0], referencia: new Date().toISOString().slice(0, 10),
      link: '', fixado: false,
      assinatura: D.ler('bairro.assinatura') || 'Diretoria da associação'
    };
    pintarFichaOficial();
  }

  function camposDoRascunhoOficial() {
    return rascunhoOficial.especie === 'documento'
      ? ['titulo', 'texto', 'categoria', 'referencia', 'link', 'assinatura']
      : ['titulo', 'texto', 'fixado', 'assinatura'];
  }

  function pintarFichaOficial() {
    var r = rascunhoOficial;
    var doc = r.especie === 'documento';

    var especies = D.ORDEM_ESPECIES.map(function (e) {
      var i = D.ESPECIES[e];
      return '<button type="button" data-especie="' + e + '" style="--cor:var(--brand)"' +
        (r.especie === e ? ' class="on"' : '') + '><span class="ic">' + i.ic + '</span>' + esc(i.nome) + '</button>';
    }).join('');

    var categorias = D.CATEGORIAS_DOC.map(function (c) {
      return '<option value="' + esc(c) + '"' + (r.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    fundoFicha().innerHTML =
      '<form class="ficha" id="ficha">' +
        '<h2>Publicar pela associação</h2>' +
        '<div class="campo"><label>O que é</label><div class="tipos" id="especies">' + especies + '</div></div>' +
        '<div class="campo"><label for="f-titulo">Título</label>' +
          '<input id="f-titulo" maxlength="140" value="' + esc(r.titulo) + '" required placeholder="' +
          (doc ? 'Ex.: Ata da assembleia de 14/09/2026' : 'Ex.: Assembleia geral — 14/09, 9h') + '">' +
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
              '<textarea id="f-texto" maxlength="4000" style="min-height:150px" placeholder="Escreva como se estivesse falando com o vizinho: o que é, quando, onde, o que ele precisa fazer.">' + esc(r.texto) + '</textarea></div>' +
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
          '<button type="submit" class="bt ok">Publicar</button>' +
        '</div>' +
      '</form>';

    document.getElementById('especies').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-especie]');
      if (!b) return;
      guardarRascunho(r, camposDoRascunhoOficial());
      r.especie = b.dataset.especie;
      pintarFichaOficial();
    });
    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', enviarFichaOficial);
  }

  function enviarFichaOficial(ev) {
    ev.preventDefault();
    var r = rascunhoOficial;
    guardarRascunho(r, camposDoRascunhoOficial());

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
