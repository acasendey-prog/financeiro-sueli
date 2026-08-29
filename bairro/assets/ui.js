/* ============================================================================
   ui.js — telas do mural
   Uma tela só: topo com busca e filtros, feed de avisos e a ficha de publicação.
   ========================================================================== */
(function (global) {
  'use strict';

  var D = global.Dados;
  var app = document.getElementById('app');

  var estado = { tipo: 'tudo', busca: '', arquivo: false };
  var rascunho = null;   // ficha aberta: { tipo, titulo, texto, rua, autor, contato }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    var caixa = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    caixa.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ------------------------------------------------------------------ topo */
  function montarShell() {
    app.innerHTML =
      '<header class="topo">' +
        '<div class="marca">' +
          '<img src="icons/icon-192.png" alt="">' +
          '<div><b>Vizinhança</b><span>Mural do bairro</span></div>' +
          '<div class="modo" id="modo"></div>' +
        '</div>' +
        '<div class="busca">' +
          '<span class="lupa">🔍</span>' +
          '<input id="busca" type="search" placeholder="Buscar aviso, rua ou pessoa" autocomplete="off">' +
        '</div>' +
        '<nav class="filtros" id="filtros"></nav>' +
      '</header>' +
      '<main class="feed" id="feed"></main>' +
      '<button class="novo" id="btNovo">+ Publicar aviso</button>';

    document.getElementById('busca').addEventListener('input', function (ev) {
      estado.busca = ev.target.value;
      pintarChips(); pintarFeed();
    });
    document.getElementById('btNovo').addEventListener('click', function () { abrirFicha(); });
    document.getElementById('filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest('.chip');
      if (!b) return;
      estado.tipo = b.dataset.tipo;
      pintarChips(); pintarFeed();
    });
    document.getElementById('feed').addEventListener('click', aoClicarNoFeed);
  }

  function pintarModo() {
    var el = document.getElementById('modo');
    if (!el) return;
    el.textContent = D.modo === 'compartilhado'
      ? 'mural compartilhado'
      : 'modo demonstração — os avisos ficam só neste aparelho';
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

  /* ------------------------------------------------------------------ feed */
  function cartao(a) {
    var info = D.TIPOS[a.tipo] || { nome: a.tipo, cor: 'var(--brand)' };
    var zap = D.linkZap(a);
    var confirmei = D.jaConfirmei(a);

    var meta = [];
    if (a.rua) meta.push('📍 ' + esc(a.rua));
    meta.push('👤 ' + esc(a.autor));
    if (a.confirmacoes) meta.push('👍 ' + a.confirmacoes + (a.confirmacoes === 1 ? ' vizinho confirmou' : ' vizinhos confirmaram'));
    meta = meta.join(' <span aria-hidden="true">·</span> ');

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
      '<div class="meta">' + meta + '</div>' +
      (acoes ? '<div class="acoes">' + acoes + '</div>' : '') +
    '</article>';
  }

  function pintarFeed() {
    var lista = D.listar(estado);
    var arquivados = D.listar({ tipo: estado.tipo, busca: estado.busca, arquivo: true }).length;
    var html = '';

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

  function aoClicarNoFeed(ev) {
    var b = ev.target.closest('button[data-acao]');
    if (!b) return;
    var aviso = D.avisos.filter(function (a) { return a.id === b.dataset.id; })[0];
    if (!aviso) return;

    if (b.dataset.acao === 'confirmar') {
      D.confirmar(aviso).then(function () { pintarFeed(); toast('Confirmação registrada.'); });
    } else if (b.dataset.acao === 'resolver') {
      D.alternarResolvido(aviso).then(function () { pintarChips(); pintarFeed(); });
    } else if (b.dataset.acao === 'remover') {
      if (!confirm('Apagar este aviso?')) return;
      D.remover(aviso).then(function () { pintarChips(); pintarFeed(); toast('Aviso apagado.'); });
    }
  }

  /* ----------------------------------------------------------------- ficha */
  function abrirFicha() {
    rascunho = {
      tipo: estado.tipo === 'tudo' ? 'ocorrencia' : estado.tipo,
      titulo: '', texto: '', rua: '',
      autor: localStorage.getItem('bairro.nome') || '',
      contato: localStorage.getItem('bairro.zap') || ''
    };
    pintarFicha();
  }

  function fecharFicha() {
    rascunho = null;
    var f = document.getElementById('fundo');
    if (f) f.remove();
  }

  function pintarFicha() {
    var f = document.getElementById('fundo');
    if (!f) {
      f = document.createElement('div');
      f.id = 'fundo'; f.className = 'fundo';
      document.body.appendChild(f);
      f.addEventListener('click', function (ev) { if (ev.target === f) fecharFicha(); });
    }

    var tipos = D.ORDEM_TIPOS.map(function (t) {
      var i = D.TIPOS[t];
      return '<button type="button" data-tipo="' + t + '" style="--cor:' + i.cor + '"' +
        (rascunho.tipo === t ? ' class="on"' : '') + '><span class="ic">' + i.ic + '</span>' + esc(i.nome) + '</button>';
    }).join('');

    f.innerHTML =
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
      guardarRascunho();
      rascunho.tipo = b.dataset.tipo;
      pintarFicha();
    });
    document.getElementById('f-cancelar').addEventListener('click', fecharFicha);
    document.getElementById('ficha').addEventListener('submit', enviarFicha);
  }

  function guardarRascunho() {
    ['titulo', 'texto', 'rua', 'autor', 'contato'].forEach(function (c) {
      var el = document.getElementById('f-' + c);
      if (el) rascunho[c] = el.value;
    });
  }

  function enviarFicha(ev) {
    ev.preventDefault();
    guardarRascunho();

    var erro = document.getElementById('f-erro');
    if (!rascunho.titulo.trim()) {
      erro.textContent = 'Escreva um título para o aviso.';
      erro.hidden = false;
      return;
    }
    if (rascunho.contato && rascunho.contato.replace(/\D/g, '').length < 10) {
      erro.textContent = 'O WhatsApp precisa do DDD — ex.: 11999998888.';
      erro.hidden = false;
      return;
    }

    // guarda o nome e o zap para não digitar de novo no próximo aviso
    localStorage.setItem('bairro.nome', rascunho.autor);
    localStorage.setItem('bairro.zap', rascunho.contato);

    D.publicar(rascunho).then(function () {
      fecharFicha();
      estado.tipo = 'tudo'; estado.busca = ''; estado.arquivo = false;
      document.getElementById('busca').value = '';
      pintarChips(); pintarFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(D.modo === 'compartilhado' ? 'Publicado no mural do bairro.' : 'Publicado (só neste aparelho).');
    });
  }

  /* --------------------------------------------------------------- arranque */
  function iniciar() {
    D.carregar();
    montarShell();
    pintarModo(); pintarChips(); pintarFeed();
    D.sincronizar().then(function () { pintarModo(); pintarChips(); pintarFeed(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  global.UI = { toast: toast };
})(window);
