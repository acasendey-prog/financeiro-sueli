/* ============================================================================
   ui.js — interface, roteamento e telas
   ========================================================================== */
(function (global) {
  'use strict';
  var E = global.Engine, C = global.Charts, S = global.Store;
  var db;                       // atalho para Store.db
  var st = { mes: null, ano: null, busca: '', filtroCat: '', filtroTipo: '', relClasse: 'despesa' };

  /* ------------------------------------------------------------- utilitários */
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ------------------------------------------------------------------ marca */
  /** logotipo do sistema — tile em gradiente com curva de crescimento */
  function logoSVG(tam) {
    var s = tam || 40, uid = 'lg' + Math.random().toString(36).slice(2, 7);
    return '<svg viewBox="0 0 48 48" width="' + s + '" height="' + s + '" role="img" aria-label="Controle Financeiro">' +
      '<defs>' +
      '<linearGradient id="' + uid + 'a" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#a97ff7"/><stop offset="52%" stop-color="#7d5bd4"/><stop offset="100%" stop-color="#42277d"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + uid + 'b" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/><stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<rect x="1" y="1" width="46" height="46" rx="12" fill="url(#' + uid + 'a)"/>' +
      '<rect x="1.75" y="1.75" width="44.5" height="44.5" rx="11.3" fill="none" stroke="#ffffff" stroke-opacity=".22"/>' +
      '<rect x="11" y="27" width="5.4" height="11" rx="2.2" fill="#ffffff" fill-opacity=".42"/>' +
      '<rect x="21.3" y="21" width="5.4" height="17" rx="2.2" fill="#ffffff" fill-opacity=".62"/>' +
      '<rect x="31.6" y="14" width="5.4" height="24" rx="2.2" fill="#ffffff" fill-opacity=".86"/>' +
      '<path d="M11.6 22.4 L20 15.6 L26.2 19.4 L36.6 9.6" fill="none" stroke="url(#' + uid + 'b)" ' +
      'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="36.6" cy="9.6" r="3.1" fill="#ffffff"/>' +
      '</svg>';
  }

  function toast(msg, tipo) {
    var box = $('#toasts'), t = document.createElement('div');
    t.className = 'toast ' + (tipo || 'ok'); t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; t.style.transition = '.25s'; }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function modal(titulo, corpo, onOk, textoOk) {
    var ovl = document.createElement('div'); ovl.className = 'ovl';
    ovl.innerHTML = '<div class="modal"><h2>' + h(titulo) + '</h2><div class="mbody">' + corpo +
      '</div><div class="acts"><button class="btn" data-x>Cancelar</button>' +
      (onOk ? '<button class="btn pri" data-ok>' + h(textoOk || 'Salvar') + '</button>' : '') + '</div></div>';
    document.body.appendChild(ovl);
    var fechar = function () { ovl.remove(); };
    ovl.addEventListener('click', function (e) { if (e.target === ovl) fechar(); });
    $('[data-x]', ovl).onclick = fechar;
    var ok = $('[data-ok]', ovl);
    if (ok) ok.onclick = function () { if (onOk(ovl) !== false) fechar(); };
    ovl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fechar();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && ok) ok.click();
    });
    var f = ovl.querySelector('input,select,textarea'); if (f) setTimeout(function () { f.focus(); f.select && f.select(); }, 40);
    return ovl;
  }
  function confirmar(txt, fn) {
    modal('Confirmar', '<p style="font-size:14px;line-height:1.6">' + h(txt) + '</p>', function () { fn(); }, 'Confirmar');
  }

  function opts(lista, sel) {
    return lista.map(function (o) {
      var v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
      return '<option value="' + h(v) + '"' + (v === sel ? ' selected' : '') + '>' + h(l) + '</option>';
    }).join('');
  }
  function selMeses(sel) { return opts(E.meses(db).map(function (m) { return { v: m, l: E.mesLabel(m) }; }), sel); }
  function selCats(sel, classe) {
    var g = '';
    if (!classe || classe === 'receita') g += '<optgroup label="Receitas">' + opts(db.categorias.receita, sel) + '</optgroup>';
    if (!classe || classe === 'despesa') g += '<optgroup label="Despesas">' + opts(db.categorias.despesa, sel) + '</optgroup>';
    return g;
  }
  function num(v) { return '<span class="num ' + (v < 0 ? 'neg' : v > 0 ? 'pos' : 'mut') + '">' + E.brl(v) + '</span>'; }
  function numRaw(v) { return '<span class="num">' + E.brl(v) + '</span>'; }
  function tagStatus(s) {
    return s === 'realizado' ? '<span class="tag real">✅ Realizado</span>'
      : s === 'base' ? '<span class="tag">🔎 Base</span>'
        : '<span class="tag proj">📆 Projeção</span>';
  }
  function parseVal(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').trim().replace(/[R$\s]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  }

  /* ------------------------------------------------------------------ rotas */
  var ROTAS = [
    { g: 'Operação' },
    { id: 'painel', t: 'Painel', ic: '◆', f: viewPainel },
    { id: 'lancamentos', t: 'Lançamentos', ic: '≡', f: viewLancamentos },
    { id: 'recorrentes', t: 'Fixos & Recorrentes', ic: '↻', f: viewRecorrentes },
    { g: 'Crédito' },
    { id: 'cartoes', t: 'Cartões', ic: '▤', f: viewCartoes },
    { id: 'parcelamentos', t: 'Parcelamentos', ic: '▥', f: viewParcelamentos },
    { id: 'metas', t: 'Metas & Dívidas', ic: '◎', f: viewMetas },
    { g: 'Análise' },
    { id: 'fluxo', t: 'Fluxo de Caixa', ic: '∿', f: viewFluxo },
    { id: 'relatorios', t: 'Relatórios', ic: '▦', f: viewRelatorios },
    { id: 'auditoria', t: 'Auditoria', ic: '⚑', f: viewAuditoria },
    { g: 'Sistema' },
    { id: 'categorias', t: 'Categorias', ic: '☰', f: viewCategorias },
    { id: 'dados', t: 'Dados & Backup', ic: '⛁', f: viewDados }
  ];

  function rotaAtual() {
    var id = (location.hash || '#painel').slice(1).split('?')[0];
    for (var i = 0; i < ROTAS.length; i++) if (ROTAS[i].id === id) return ROTAS[i];
    return ROTAS[1];
  }

  function sidebar() {
    var atual = rotaAtual().id;
    return '<aside class="side" id="side">' +
      '<div class="brand"><div class="mark">' + logoSVG(40) + '</div>' +
      '<div><b>Controle Financeiro</b><span>Sueli</span></div></div>' +
      '<nav class="nav">' + ROTAS.map(function (r) {
        if (r.g) return '<div class="grp">' + h(r.g) + '</div>';
        return '<a href="#' + r.id + '" class="' + (r.id === atual ? 'on' : '') + '"><span class="ic">' + r.ic + '</span>' + h(r.t) + '</a>';
      }).join('') + '</nav>' +
      '<div class="side-foot"><span class="dot" id="savedot"></span><span id="savetxt">salvo</span><br>' +
      '<span id="syncline" style="display:block;margin-top:5px"></span>' +
      '<span style="opacity:.7;display:block;margin-top:5px">Mês de referência: <b>' + E.mesLabel(db.meta.mesRef) + '</b></span></div>' +
      '</aside>';
  }

  function topo(titulo, sub, acoes) {
    return '<header class="topbar">' +
      '<button class="btn burger" id="burger">☰</button>' +
      '<div><h1>' + h(titulo) + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' +
      '<div class="spacer"></div>' + (acoes || '') + '</header>';
  }

  function render() {
    db = S.db;
    if (!st.mes || E.meses(db).indexOf(st.mes) < 0) st.mes = db.meta.mesRef;
    if (!st.ano) st.ano = db.meta.mesRef.slice(0, 4);
    var r = rotaAtual();
    var app = $('#app');
    app.innerHTML = '<div class="shell">' + sidebar() + '<main class="main" id="main"></main></div>';
    r.f($('#main'));
    atualizaSyncLine();
    var b = $('#burger'); if (b) b.onclick = function () { $('#side').classList.toggle('open'); };
    $$('.nav a').forEach(function (a) { a.onclick = function () { $('#side').classList.remove('open'); }; });
    atualizaSaveDot();
  }
  function atualizaSaveDot() {
    var d = $('#savedot'), t = $('#savetxt');
    if (!d) return;
    if (S.dirty) { d.classList.add('busy'); t.textContent = 'gravando…'; }
    else { d.classList.remove('busy'); t.textContent = S.lastSave ? 'salvo ' + S.lastSave.toLocaleTimeString('pt-BR').slice(0, 5) : 'salvo'; }
  }
  function rotuloSync() {
    var s = Sync.estado;
    if (s === 'sem-servidor') return '<span style="opacity:.65">☁︎ sem nuvem — só neste aparelho</span>';
    if (s === 'enviando') return '<span style="color:#f3ca6d">☁︎ enviando…</span>';
    if (s === 'offline') return '<span style="color:#f0b3b3">☁︎ offline — grava ao voltar</span>';
    if (s === 'conflito') return '<span style="color:#f0b3b3">☁︎ conflito — abra Dados</span>';
    if (s === 'sincronizado') return '<span style="color:#79d479">☁︎ na nuvem' + (Sync.rev ? ' · v' + Sync.rev : '') + '</span>';
    return '<span style="opacity:.65">☁︎ conectando…</span>';
  }
  function atualizaSyncLine() {
    var el = $('#syncline'); if (el) el.innerHTML = rotuloSync();
    var p = $('#sync-painel'); if (p) { p.innerHTML = blocoSync(); ligarBotoesSync(); }
  }
  document.addEventListener('fin:sync', atualizaSyncLine);
  window.addEventListener('online', function () { if (S.db) Sync.reconectar(S.db); });
  document.addEventListener('fin:saved', atualizaSaveDot);
  document.addEventListener('fin:saveerror', function () { toast('Falha ao gravar. Faça um backup!', 'err'); });

  /* ======================================================== TELA · PAINEL === */
  function viewPainel(root) {
    var casc = E.cascata(db);
    var ano = st.ano;
    var doAno = casc.filter(function (c) { return c.mes.slice(0, 4) === ano; });
    var rec = doAno.reduce(function (a, c) { return a + c.entradas; }, 0);
    var des = doAno.reduce(function (a, c) { return a + c.saidas; }, 0);
    var fim = doAno.length ? doAno[doAno.length - 1].saldoFinal : 0;
    var atualIdx = casc.findIndex(function (c) { return c.mes === db.meta.mesRef; });
    var atual = casc[atualIdx] || casc[0];
    var anos = Array.from(new Set(E.meses(db).map(function (m) { return m.slice(0, 4); })));
    var av = E.diagnostico(db);
    var crit = av.filter(function (a) { return a.n === 'crit'; }).length;

    var listaCarts = E.cartoes(db);
    var porCartao = listaCarts.map(function (c) {
      return { nome: c, total: doAno.reduce(function (a, x) { return a + E.faturaPaga(db, x.mes, c); }, 0) };
    });
    var cartTotal = porCartao.reduce(function (a, c) { return a + c.total; }, 0);
    var cartSub = porCartao.map(function (c) { return c.nome + ' ' + E.brlCurto(c.total); }).join(' · ');

    root.innerHTML = topo('Painel ' + ano,
      'Posição consolidada · mês de referência <b>' + E.mesLabel(db.meta.mesRef) + '</b>',
      '<div class="seg" id="segano">' + anos.map(function (a) { return '<button data-a="' + a + '" class="' + (a === ano ? 'on' : '') + '">' + a + '</button>'; }).join('') + '</div>' +
      '<button class="btn pri" id="novo">+ Lançamento</button>') +

      avisoBackup() +
      (crit ? '<div class="alert crit" style="margin-bottom:14px"><span class="ic">⚑</span><div><b>' + crit + ' ponto(s) crítico(s)</b> detectado(s) pela auditoria automática. <a href="#auditoria">Ver detalhes →</a></div></div>' : '') +

      '<div class="grid g-kpi" style="margin-bottom:14px">' +
      kpi('Receita do ano', E.brl(rec), 'Entradas de ' + ano, 'acc-in') +
      kpi('Despesa do ano', E.brl(des), 'Saídas de ' + ano, 'acc-out') +
      kpi('Resultado', E.brl(rec - des), (rec - des >= 0 ? 'superávit' : 'déficit') + ' no período', rec - des >= 0 ? 'acc-in' : 'acc-out') +
      kpi('Saldo em 31/12/' + ano, E.brl(fim), 'Posição projetada', 'acc-br') +
      kpi('Saldo hoje', E.brl(atual ? atual.saldoFinal : 0), 'Fim de ' + E.mesLabel(db.meta.mesRef), 'acc-br') +
      kpi('Faturas de cartão', E.brl(cartTotal), cartSub || 'nenhum cartão cadastrado', 'acc-am') +
      '</div>' +

      '<div class="grid g-2" style="margin-bottom:14px">' +
      '<div class="card"><h3>Fluxo mensal ' + ano + '</h3>' +
      C.legenda([{ nome: 'Entradas', cor: 'var(--entrada)' }, { nome: 'Saídas', cor: 'var(--saida)' }]) +
      '<div id="ch-fluxo"></div></div>' +
      '<div class="card"><h3>Evolução do saldo</h3>' +
      '<div class="hint" style="margin:0 0 8px">Saldo final acumulado em todos os meses cadastrados.</div>' +
      '<div id="ch-saldo"></div></div>' +
      '</div>' +

      '<div class="grid g-2">' +
      '<div class="card"><h3>Maiores despesas de ' + ano + '</h3><div id="ch-desp"></div></div>' +
      '<div class="card"><h3>Receitas de ' + ano + ' por categoria</h3><div id="ch-rec"></div></div>' +
      '</div>';

    $('#novo').onclick = function () { formLancamento(null); };
    $$('#segano button').forEach(function (b) { b.onclick = function () { st.ano = b.dataset.a; render(); }; });
    ligarBotaoBackup();

    C.barras($('#ch-fluxo'), {
      labels: doAno.map(function (c) { return E.mesLabel(c.mes); }),
      titulos: doAno.map(function (c) { return E.mesLabelLongo(c.mes); }),
      series: [
        { nome: 'Entradas', cor: 'var(--entrada)', dados: doAno.map(function (c) { return c.entradas; }) },
        { nome: 'Saídas', cor: 'var(--saida)', dados: doAno.map(function (c) { return c.saidas; }) }
      ], altura: 250
    });
    C.linha($('#ch-saldo'), {
      labels: casc.map(function (c) { return E.mesLabel(c.mes); }),
      titulos: casc.map(function (c) { return E.mesLabelLongo(c.mes); }),
      series: [{ nome: 'Saldo final', cor: 'var(--brand-hi)', dados: casc.map(function (c) { return c.saldoFinal; }) }],
      area: true, altura: 250
    });
    var de = ano + '-01', ate = ano + '-12';
    var dd = E.porCategoriaPeriodo(db, 'despesa', de, ate);
    C.ranking($('#ch-desp'), { itens: dd, cor: 'var(--saida)', nome: 'Despesa', total: des, max: 10 });
    var rr = E.porCategoriaPeriodo(db, 'receita', de, ate);
    C.ranking($('#ch-rec'), { itens: rr, cor: 'var(--entrada)', nome: 'Receita', total: rec, max: 10 });
  }
  /* ---------------------------------------------- lembrete de backup */
  function diasDesdeBackup() {
    if (!db.meta.ultimoBackup) return null;
    return Math.floor((Date.now() - new Date(db.meta.ultimoBackup).getTime()) / 86400000);
  }
  function avisoBackup() {
    var d = diasDesdeBackup();
    if (d !== null && d < 7) return '';
    var txt = d === null
      ? '<b>Você ainda não baixou nenhum backup.</b> Os dados vivem neste navegador — limpar o histórico ou trocar de aparelho apaga tudo. Baixe o backup e guarde em local seguro.'
      : '<b>Último backup há ' + d + ' dias.</b> Baixe uma cópia nova para não perder os lançamentos recentes.';
    return '<div class="alert" style="margin-bottom:14px"><span class="ic">⛁</span><div style="flex:1">' + txt +
      '</div><button class="btn sm" id="bk-agora" style="align-self:center">↓ Baixar agora</button></div>';
  }
  function ligarBotaoBackup() {
    var b = $('#bk-agora');
    if (b) b.onclick = function () { fazerBackup(); };
  }
  function fazerBackup() {
    baixar(S.exportar(), 'backup-financeiro-' + E.hoje() + '.json', 'application/json');
    db.meta.ultimoBackup = new Date().toISOString();
    S.touch('Backup baixado');
    toast('Backup gerado — guarde o arquivo fora do computador');
  }

  function kpi(lb, vl, ft, cls) {
    return '<div class="card kpi ' + cls + '"><div class="lb">' + h(lb) + '</div><div class="vl">' + h(vl) + '</div><div class="ft">' + h(ft) + '</div></div>';
  }

  /* =================================================== TELA · LANÇAMENTOS === */
  function viewLancamentos(root) {
    var m = st.mes;
    var casc = E.cascata(db);
    var info = casc.filter(function (c) { return c.mes === m; })[0] || {};
    var lst = E.doMes(db, m);

    if (st.busca) lst = lst.filter(function (l) { return (l.desc + ' ' + l.cat).toLowerCase().indexOf(st.busca.toLowerCase()) >= 0; });
    if (st.filtroCat) lst = lst.filter(function (l) { return l.cat === st.filtroCat; });
    if (st.filtroTipo) lst = lst.filter(function (l) { return st.filtroTipo === 'E' ? l.valor > 0 : l.valor < 0; });

    var saldo = info.saldoInicial || 0;
    var linhas = lst.map(function (l) {
      saldo = E.r2(saldo + l.valor);
      return '<tr data-id="' + l.id + '">' +
        '<td class="c num" style="width:52px">' + h(E.dataLabel(l.data)) + '</td>' +
        '<td>' + h(l.desc) + (l.rec ? ' <span class="tag" title="gerado por lançamento recorrente">↻</span>' : '') + '</td>' +
        '<td><span class="tag">' + h(l.cat || '—') + '</span></td>' +
        '<td class="r">' + (l.valor > 0 ? '<span class="num pos">' + E.brl(l.valor) + '</span>' : '') + '</td>' +
        '<td class="r">' + (l.valor < 0 ? '<span class="num neg">' + E.brl(-l.valor) + '</span>' : '') + '</td>' +
        '<td class="r num" style="color:var(--ink-2)">' + E.brl(saldo) + '</td>' +
        '<td class="c actions" style="width:74px"><button class="iconbtn" data-ed>✎</button><button class="iconbtn del" data-dl>✕</button></td></tr>';
    }).join('');

    root.innerHTML = topo('Lançamentos · ' + E.mesLabelLongo(m),
      tagStatus(E.statusMes(db, m)) + ' &nbsp; ' + lst.length + ' lançamento(s)',
      '<div class="monthbar"><button class="btn sm" id="prev">‹</button>' +
      '<select id="selmes">' + selMeses(m) + '</select>' +
      '<button class="btn sm" id="next">›</button></div>' +
      '<button class="btn pri" id="novo">+ Lançamento</button>') +

      '<div class="grid g-kpi" style="margin-bottom:14px">' +
      kpi('Saldo inicial', E.brl(info.saldoInicial), 'Vem do mês anterior', 'acc-br') +
      kpi('Entradas', E.brl(info.entradas), 'No mês', 'acc-in') +
      kpi('Saídas', E.brl(info.saidas), 'No mês', 'acc-out') +
      kpi('Resultado', E.brl(info.resultado), info.resultado >= 0 ? 'superávit' : 'déficit', info.resultado >= 0 ? 'acc-in' : 'acc-out') +
      kpi('Saldo final', E.brl(info.saldoFinal), 'Entra no próximo mês', 'acc-br') +
      '</div>' +

      '<div class="card">' +
      '<div class="inline" style="margin-bottom:12px">' +
      '<div class="fld" style="flex:2;min-width:180px"><label>Buscar</label><input id="busca" placeholder="descrição ou categoria" value="' + h(st.busca) + '"></div>' +
      '<div class="fld" style="min-width:170px"><label>Categoria</label><select id="fcat"><option value="">todas</option>' + selCats(st.filtroCat) + '</select></div>' +
      '<div class="fld" style="min-width:120px"><label>Tipo</label><select id="ftipo">' + opts([{ v: '', l: 'todos' }, { v: 'E', l: 'entradas' }, { v: 'S', l: 'saídas' }], st.filtroTipo) + '</select></div>' +
      '<button class="btn" id="limpar">Limpar</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn" id="csv">↓ CSV do mês</button>' +
      '</div>' +
      '<div class="tw"><table><thead><tr><th class="c">Dia</th><th>Descrição</th><th>Categoria</th>' +
      '<th class="r">Entrada</th><th class="r">Saída</th><th class="r">Saldo</th><th></th></tr></thead>' +
      '<tbody>' + (linhas || '<tr><td colspan="7" class="empty">Nenhum lançamento neste mês. Clique em <b>+ Lançamento</b>.</td></tr>') + '</tbody>' +
      '<tfoot><tr><td colspan="3">Total do mês</td>' +
      '<td class="r"><span class="num pos">' + E.brl(info.entradas) + '</span></td>' +
      '<td class="r"><span class="num neg">' + E.brl(info.saidas) + '</span></td>' +
      '<td class="r num">' + E.brl(info.saldoFinal) + '</td><td></td></tr></tfoot></table></div>' +
      '</div>';

    $('#selmes').onchange = function () { st.mes = this.value; render(); };
    $('#prev').onclick = function () { var i = E.meses(db).indexOf(st.mes); if (i > 0) { st.mes = E.meses(db)[i - 1]; render(); } };
    $('#next').onclick = function () { var ms = E.meses(db), i = ms.indexOf(st.mes); if (i < ms.length - 1) { st.mes = ms[i + 1]; render(); } };
    $('#novo').onclick = function () { formLancamento(null); };
    $('#busca').oninput = function () { st.busca = this.value; var v = this.value; render(); var b = $('#busca'); b.focus(); b.setSelectionRange(v.length, v.length); };
    $('#fcat').onchange = function () { st.filtroCat = this.value; render(); };
    $('#ftipo').onchange = function () { st.filtroTipo = this.value; render(); };
    $('#limpar').onclick = function () { st.busca = ''; st.filtroCat = ''; st.filtroTipo = ''; render(); };
    $('#csv').onclick = function () { exportarCSV(lst, 'lancamentos-' + m + '.csv'); };

    $$('[data-ed]').forEach(function (b) {
      b.onclick = function () { formLancamento(b.closest('tr').dataset.id); };
    });
    $$('[data-dl]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').dataset.id;
        var l = db.lancamentos.filter(function (x) { return x.id === id; })[0];
        confirmar('Excluir "' + l.desc + '" (' + E.brl(l.valor) + ')?', function () {
          db.lancamentos = db.lancamentos.filter(function (x) { return x.id !== id; });
          S.touch('Excluiu lançamento: ' + l.desc);
          toast('Lançamento excluído');
        });
      };
    });
  }

  function formLancamento(id) {
    var l = id ? db.lancamentos.filter(function (x) { return x.id === id; })[0] : null;
    var hoje = l ? l.data : (st.mes === E.mesDeHoje() ? E.hoje() : st.mes + '-01');
    var tipo = l ? (l.valor > 0 ? 'E' : 'S') : 'S';
    var corpo =
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld"><label>Data</label><input type="date" id="f-data" value="' + h(hoje) + '"></div>' +
      '<div class="fld"><label>Tipo</label><select id="f-tipo">' + opts([{ v: 'S', l: 'Saída (−)' }, { v: 'E', l: 'Entrada (+)' }], tipo) + '</select></div>' +
      '<div class="fld" style="grid-column:1/-1"><label>Descrição</label><input id="f-desc" value="' + h(l ? l.desc : '') + '" placeholder="ex.: Supermercado, Salário, Aluguel"></div>' +
      '<div class="fld"><label>Categoria</label><select id="f-cat">' + selCats(l ? l.cat : '') + '</select></div>' +
      '<div class="fld"><label>Valor (R$)</label><input id="f-val" inputmode="decimal" value="' + (l ? Math.abs(l.valor).toFixed(2).replace('.', ',') : '') + '" placeholder="0,00"></div>' +
      '<div class="fld" style="grid-column:1/-1"><label>Conta / origem</label><input id="f-conta" value="' + h(l ? l.conta || 'Banco' : 'Banco') + '"></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:12px">A categoria define em qual relatório o valor entra. Pagamentos de fatura devem usar ' +
      E.cadastroCartoes(db).map(function (c) { return '<b>' + h(c.cat) + '</b>'; }).join(' ou ') + '.</div>';

    var ovl = modal(id ? 'Editar lançamento' : 'Novo lançamento', corpo, function (o) {
      var data = $('#f-data', o).value, desc = $('#f-desc', o).value.trim();
      var cat = $('#f-cat', o).value, v = parseVal($('#f-val', o).value);
      var t = $('#f-tipo', o).value;
      if (!data || !desc || !v) { toast('Preencha data, descrição e valor.', 'err'); return false; }
      var valor = t === 'E' ? Math.abs(v) : -Math.abs(v);
      if (l) {
        l.data = data; l.desc = desc; l.cat = cat; l.valor = E.r2(valor); l.conta = $('#f-conta', o).value;
        S.touch('Editou lançamento: ' + desc);
        toast('Lançamento atualizado');
      } else {
        db.lancamentos.push({ id: S.novoId('l'), data: data, desc: desc, cat: cat, valor: E.r2(valor), conta: $('#f-conta', o).value });
        S.touch('Novo lançamento: ' + desc + ' ' + E.brl(valor));
        toast('Lançamento registrado');
        st.mes = data.slice(0, 7);
      }
    }, id ? 'Salvar' : 'Lançar');

    /* alterna o grupo de categorias conforme o tipo */
    var sync = function () {
      var t = $('#f-tipo', ovl).value, sel = $('#f-cat', ovl);
      var cur = sel.value;
      sel.innerHTML = selCats(cur, t === 'E' ? 'receita' : 'despesa');
      if (!sel.value) sel.selectedIndex = 0;
    };
    $('#f-tipo', ovl).onchange = sync;
    if (!l) sync();
  }

  /* ==================================================== TELA · RECORRENTES == */
  function viewRecorrentes(root) {
    var rs = db.recorrentes || [];
    root.innerHTML = topo('Fixos & Recorrentes',
      'Cadastre uma vez; o sistema replica o lançamento em todos os meses futuros automaticamente.',
      '<button class="btn" id="aplicar">↻ Gerar agora</button><button class="btn pri" id="novo">+ Recorrente</button>') +
      '<div class="alert info" style="margin-bottom:14px"><span class="ic">ⓘ</span><div>Os recorrentes só criam lançamentos <b>depois</b> do mês de referência (' + E.mesLabel(db.meta.mesRef) + '), para nunca sobrescrever o que já foi realizado. Ao mudar o mês de referência, os meses seguintes são repovoados sozinhos.</div></div>' +
      '<div class="card"><div class="tw"><table><thead><tr><th>Descrição</th><th>Categoria</th><th class="r">Valor</th>' +
      '<th class="c">Dia</th><th class="c">Início</th><th class="c">Fim</th><th class="c">Ativo</th><th></th></tr></thead><tbody>' +
      (rs.length ? rs.map(function (r) {
        return '<tr data-id="' + r.id + '"><td>' + h(r.desc) + '</td><td><span class="tag">' + h(r.cat) + '</span></td>' +
          '<td class="r">' + num(r.valor) + '</td><td class="c num">' + r.dia + '</td>' +
          '<td class="c num">' + E.mesLabel(r.inicio) + '</td><td class="c num">' + (r.fim ? E.mesLabel(r.fim) : '∞') + '</td>' +
          '<td class="c">' + (r.ativo ? '<span class="tag ok">ativo</span>' : '<span class="tag">pausado</span>') + '</td>' +
          '<td class="c actions" style="width:74px"><button class="iconbtn" data-ed>✎</button><button class="iconbtn del" data-dl>✕</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">Nenhum recorrente. Cadastre aluguel, plano de saúde, internet, pensão…</td></tr>') +
      '</tbody></table></div></div>';

    $('#novo').onclick = function () { formRecorrente(null); };
    $('#aplicar').onclick = function () {
      var n = E.aplicarRecorrentes(db);
      S.touch('Gerou ' + n + ' lançamento(s) recorrente(s)');
      toast(n ? n + ' lançamento(s) gerado(s)' : 'Nada a gerar — já está tudo em dia');
    };
    $$('[data-ed]').forEach(function (b) { b.onclick = function () { formRecorrente(b.closest('tr').dataset.id); }; });
    $$('[data-dl]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').dataset.id;
        confirmar('Excluir este recorrente? Os lançamentos futuros que ele gerou também serão removidos.', function () {
          db.recorrentes = db.recorrentes.filter(function (x) { return x.id !== id; });
          db.lancamentos = db.lancamentos.filter(function (l) { return !(l.rec === id && l.data.slice(0, 7) > db.meta.mesRef); });
          S.touch('Excluiu recorrente');
          toast('Recorrente removido');
        });
      };
    });
  }
  function formRecorrente(id) {
    var r = id ? db.recorrentes.filter(function (x) { return x.id === id; })[0] : null;
    var corpo = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld" style="grid-column:1/-1"><label>Descrição</label><input id="r-desc" value="' + h(r ? r.desc : '') + '" placeholder="ex.: Aluguel"></div>' +
      '<div class="fld"><label>Tipo</label><select id="r-tipo">' + opts([{ v: 'S', l: 'Saída (−)' }, { v: 'E', l: 'Entrada (+)' }], r && r.valor > 0 ? 'E' : 'S') + '</select></div>' +
      '<div class="fld"><label>Valor (R$)</label><input id="r-val" inputmode="decimal" value="' + (r ? Math.abs(r.valor).toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div class="fld"><label>Categoria</label><select id="r-cat">' + selCats(r ? r.cat : '') + '</select></div>' +
      '<div class="fld"><label>Dia do mês</label><input type="number" id="r-dia" min="1" max="31" value="' + (r ? r.dia : 10) + '"></div>' +
      '<div class="fld"><label>Início</label><select id="r-ini">' + selMeses(r ? r.inicio : E.addMes(db.meta.mesRef, 1)) + '</select></div>' +
      '<div class="fld"><label>Fim (opcional)</label><select id="r-fim"><option value="">sem fim</option>' + selMeses(r ? r.fim : '') + '</select></div>' +
      '<div class="fld" style="grid-column:1/-1"><label><input type="checkbox" id="r-ativo" style="width:auto;margin-right:8px"' + (!r || r.ativo ? ' checked' : '') + '> Ativo</label></div>' +
      '</div>';
    modal(id ? 'Editar recorrente' : 'Novo recorrente', corpo, function (o) {
      var desc = $('#r-desc', o).value.trim(), v = parseVal($('#r-val', o).value);
      if (!desc || !v) { toast('Preencha descrição e valor.', 'err'); return false; }
      var obj = {
        id: r ? r.id : S.novoId('rc'), desc: desc, cat: $('#r-cat', o).value,
        valor: E.r2($('#r-tipo', o).value === 'E' ? Math.abs(v) : -Math.abs(v)),
        dia: +$('#r-dia', o).value || 1, inicio: $('#r-ini', o).value, fim: $('#r-fim', o).value || null,
        ativo: $('#r-ativo', o).checked
      };
      if (r) { Object.keys(obj).forEach(function (k) { r[k] = obj[k]; }); }
      else db.recorrentes.push(obj);
      var n = E.aplicarRecorrentes(db);
      S.touch('Recorrente salvo: ' + desc);
      toast('Recorrente salvo · ' + n + ' lançamento(s) gerado(s)');
    });
  }

  /* ======================================================= TELA · CARTÕES === */
  function viewCartoes(root) {
    var ms = E.meses(db), carts = E.cartoes(db);
    var PAL = ['var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s1)', 'var(--s5)'];
    var cores = {}; carts.forEach(function (c, i) { cores[c] = PAL[i % PAL.length]; });
    var rows = ms.map(function (m) {
      var cells = carts.map(function (c) {
        var x = E.cartaoMes(db, m, c);
        return '<td class="r num">' + (x.parcelado ? E.brl(x.parcelado) : '—') + '</td>' +
          '<td class="r num ' + (x.aVista < 0 ? 'neg' : '') + '">' + (x.fatura ? E.brl(x.aVista) : '—') + '</td>' +
          '<td class="r num"><b>' + (x.fatura ? E.brl(x.fatura) : '—') + '</b></td>';
      }).join('');
      var tot = carts.reduce(function (a, c) { return a + E.faturaPaga(db, m, c); }, 0);
      return '<tr><td class="num">' + E.mesLabel(m) + '</td>' + cells + '<td class="r num"><b>' + (tot ? E.brl(tot) : '—') + '</b></td></tr>';
    }).join('');

    var totLinha = carts.map(function (c) {
      var p = 0, v = 0, f = 0;
      ms.forEach(function (m) { var x = E.cartaoMes(db, m, c); p += x.parcelado; v += x.aVista; f += x.fatura; });
      return '<td class="r num">' + E.brl(p) + '</td><td class="r num">' + E.brl(v) + '</td><td class="r num">' + E.brl(f) + '</td>';
    }).join('');
    var totGeral = ms.reduce(function (a, m) { return a + carts.reduce(function (b, c) { return b + E.faturaPaga(db, m, c); }, 0); }, 0);

    root.innerHTML = topo('Cartões de crédito',
      'Fatura paga = lançamentos na categoria do cartão · Parcelado = cadastro de parcelamentos · <b>À vista = fatura − parcelado</b>',
      '<div class="monthbar"><select id="selmes">' + selMeses(st.mes) + '</select></div>' +
      '<button class="btn pri" id="novafatura">+ Lançar Fatura</button>') +

      '<div class="grid g-2" style="margin-bottom:14px">' +
      carts.map(function (c, i) {
        var x = E.cartaoMes(db, st.mes, c);
        var cat = E.catDoCartao(db, c);
        var abertos = db.parcelamentos.filter(function (p) { return p.cartao === c && E.statusParcelamento(db, p).status !== 'quitado'; });
        var falta = abertos.reduce(function (a, p) { return a + E.statusParcelamento(db, p).falta; }, 0);
        var alerta = x.fatura === 0 && x.parcelado > 0
          ? '<div class="alert" style="margin-top:12px"><span class="ic">⚠</span><div>Há <b>' + E.brl(x.parcelado) + '</b> em parcelas neste mês, mas nenhuma fatura lançada na categoria <b>' + h(cat) + '</b>. Use <b>+ Lançar Fatura</b>.</div></div>'
          : (x.aVista < -0.005
            ? '<div class="alert" style="margin-top:12px"><span class="ic">⚠</span><div>A fatura lançada é <b>menor</b> que o parcelado do mês — confira o valor da fatura ou o cadastro das parcelas.</div></div>'
            : '');
        return '<div class="card"><h3>' + h(c) + ' · ' + E.mesLabel(st.mes) + '</h3>' +
          '<div style="display:flex;gap:22px;flex-wrap:wrap">' +
          '<div><div class="lb" style="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.07em">Fatura paga</div><div class="num" style="font-size:22px;font-weight:600">' + E.brl(x.fatura) + '</div></div>' +
          '<div><div class="lb" style="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.07em">Parcelado</div><div class="num" style="font-size:18px;color:' + cores[c] + '">' + E.brl(x.parcelado) + '</div></div>' +
          '<div><div class="lb" style="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.07em">À vista + encargos</div><div class="num ' + (x.aVista < 0 ? 'neg' : '') + '" style="font-size:18px">' + E.brl(x.aVista) + '</div></div>' +
          '</div>' +
          '<div class="hint">Categoria da fatura: <b>' + h(cat) + '</b> · ' + abertos.length + ' compromisso(s) parcelado(s) em aberto · falta pagar <b>' + E.brl(falta) + '</b></div>' +
          alerta +
          '</div>';
      }).join('') + '</div>' +

      '<div class="card" style="margin-bottom:14px"><h3>Composição da fatura mês a mês</h3>' +
      C.legenda(carts.map(function (c) { return { nome: c, cor: cores[c] || 'var(--s1)' }; })) +
      '<div id="ch-cart"></div></div>' +

      '<div class="card"><h3>Evolução detalhada</h3><div class="tw"><table><thead><tr><th rowspan="2" style="vertical-align:bottom">Mês</th>' +
      carts.map(function (c) { return '<th colspan="3" class="c">' + h(c) + '</th>'; }).join('') +
      '<th rowspan="2" class="r" style="vertical-align:bottom">Total</th></tr><tr>' +
      carts.map(function () { return '<th class="r">Parcelado</th><th class="r">À vista</th><th class="r">Fatura</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td>TOTAL</td>' + totLinha + '<td class="r num">' + E.brl(totGeral) + '</td></tr></tfoot></table></div></div>';

    C.empilhado($('#ch-cart'), {
      labels: ms.map(function (m) { return E.mesLabel(m); }),
      titulos: ms.map(function (m) { return E.mesLabelLongo(m); }),
      series: carts.map(function (c) {
        return { nome: c, cor: cores[c] || 'var(--s1)', dados: ms.map(function (m) { return E.faturaPaga(db, m, c); }) };
      }), altura: 240
    });

    $('#novafatura').onclick = function () { formFatura(); };
    $('#selmes').onchange = function () { st.mes = this.value; render(); };
  }

  /* ================================================ TELA · PARCELAMENTOS === */
  function viewParcelamentos(root) {
    var ms = E.meses(db);
    var lst = db.parcelamentos.map(function (p) {
      var s = E.statusParcelamento(db, p);
      return { p: p, s: s };
    }).sort(function (a, b) {
      var o = { 'andamento': 0, 'a-iniciar': 1, 'quitado': 2 };
      return o[a.s.status] - o[b.s.status] || (a.p.mes1 < b.p.mes1 ? -1 : 1);
    });
    var falta = lst.reduce(function (a, x) { return a + x.s.falta; }, 0);
    var emAberto = lst.filter(function (x) { return x.s.status !== 'quitado'; }).length;
    var noMes = E.totalParcelado(db, st.mes);

    root.innerHTML = topo('Parcelamentos',
      'Cadastre a compra uma vez — as parcelas aparecem sozinhas em todos os meses, numeradas.',
      '<div class="monthbar"><select id="selmes">' + selMeses(st.mes) + '</select></div>' +
      '<button class="btn pri" id="novo">+ Parcelamento</button>') +

      '<div class="grid g-kpi" style="margin-bottom:14px">' +
      kpi('Compromissos em aberto', String(emAberto), 'de ' + lst.length + ' cadastrados', 'acc-am') +
      kpi('Falta pagar', E.brl(falta), 'Somando todas as parcelas futuras', 'acc-out') +
      kpi('Parcelas em ' + E.mesLabel(st.mes), E.brl(noMes), E.parcelasDoMes(db, st.mes).length + ' parcela(s)', 'acc-br') +
      '</div>' +

      '<div class="card" style="margin-bottom:14px"><h3>Carga de parcelas por mês</h3><div id="ch-par"></div></div>' +

      '<div class="card"><h3>Compromissos</h3><div class="tw"><table><thead><tr>' +
      '<th>Cartão</th><th>Fornecedor</th><th class="c">1ª parcela</th><th class="c">Parcelas</th>' +
      '<th class="r">Valor</th><th class="r">Total</th><th class="c">Pagas</th><th class="r">Falta</th><th class="c">Situação</th><th></th></tr></thead><tbody>' +
      lst.map(function (x) {
        var p = x.p, s = x.s;
        return '<tr data-id="' + p.id + '">' +
          '<td><span class="tag itau">' + h(p.cartao) + '</span></td>' +
          '<td>' + h(p.fornecedor) + '</td>' +
          '<td class="c num">' + E.mesLabel(p.mes1) + '</td>' +
          '<td class="c num">' + p.n + 'x</td>' +
          '<td class="r num">' + E.brl(p.valor) + '</td>' +
          '<td class="r num">' + E.brl(s.total) + '</td>' +
          '<td class="c num">' + s.pagas + '/' + p.n + '</td>' +
          '<td class="r num">' + (s.falta ? E.brl(s.falta) : '—') + '</td>' +
          '<td class="c">' + (s.status === 'quitado' ? '<span class="tag ok">✅ Quitado</span>' :
            s.status === 'a-iniciar' ? '<span class="tag soon">📆 A iniciar</span>' : '<span class="tag run">● Em andamento</span>') + '</td>' +
          '<td class="c actions" style="width:74px"><button class="iconbtn" data-ed>✎</button><button class="iconbtn del" data-dl>✕</button></td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card" style="margin-top:14px"><h3>Parcelas de ' + E.mesLabelLongo(st.mes) + '</h3>' +
      '<div class="tw"><table><thead><tr><th>Cartão</th><th>Fornecedor</th><th class="c">Parcela</th><th class="r">Valor</th></tr></thead><tbody>' +
      (E.parcelasDoMes(db, st.mes).map(function (x) {
        return '<tr><td><span class="tag itau">' + h(x.cartao) + '</span></td><td>' + h(x.fornecedor) + '</td>' +
          '<td class="c num">' + x.parcela + ' de ' + x.de + '</td><td class="r num">' + E.brl(x.valor) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="empty">Nenhuma parcela neste mês.</td></tr>') +
      '</tbody><tfoot><tr><td colspan="3">Total</td><td class="r num">' + E.brl(noMes) + '</td></tr></tfoot></table></div></div>';

    $('#selmes').onchange = function () { st.mes = this.value; render(); };
    $('#novo').onclick = function () { formParcelamento(null); };
    $$('[data-ed]').forEach(function (b) { b.onclick = function () { formParcelamento(b.closest('tr').dataset.id); }; });
    $$('[data-dl]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').dataset.id;
        var p = db.parcelamentos.filter(function (x) { return x.id === id; })[0];
        confirmar('Excluir o parcelamento "' + p.fornecedor + '"? As parcelas somem de todos os meses.', function () {
          db.parcelamentos = db.parcelamentos.filter(function (x) { return x.id !== id; });
          S.touch('Excluiu parcelamento: ' + p.fornecedor);
          toast('Parcelamento excluído');
        });
      };
    });

    C.barras($('#ch-par'), {
      labels: ms.map(function (m) { return E.mesLabel(m); }),
      titulos: ms.map(function (m) { return E.mesLabelLongo(m); }),
      series: E.cartoes(db).map(function (c, i) {
        return { nome: c, cor: c === 'Itaú' ? 'var(--s2)' : 'var(--s3)', dados: ms.map(function (m) { return E.totalParcelado(db, m, c); }) };
      }), altura: 220
    });
  }
  function formParcelamento(id) {
    var p = id ? db.parcelamentos.filter(function (x) { return x.id === id; })[0] : null;
    var corpo = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld"><label>Cartão</label><select id="p-cart">' + opts(E.cartoes(db), p ? p.cartao : 'Itaú') + '</select></div>' +
      '<div class="fld"><label>Mês da 1ª parcela</label><select id="p-mes">' + selMeses(p ? p.mes1 : st.mes) + '</select></div>' +
      '<div class="fld" style="grid-column:1/-1"><label>Fornecedor / descrição</label><input id="p-forn" value="' + h(p ? p.fornecedor : '') + '"></div>' +
      '<div class="fld"><label>Nº de parcelas</label><input type="number" id="p-n" min="1" max="120" value="' + (p ? p.n : 12) + '"></div>' +
      '<div class="fld"><label>Valor da parcela (R$)</label><input id="p-val" inputmode="decimal" value="' + (p ? p.valor.toFixed(2).replace('.', ',') : '') + '"></div>' +
      '</div><div class="hint" id="p-prev" style="margin-top:12px"></div>';
    var ovl = modal(id ? 'Editar parcelamento' : 'Novo parcelamento', corpo, function (o) {
      var forn = $('#p-forn', o).value.trim(), n = +$('#p-n', o).value, v = parseVal($('#p-val', o).value);
      if (!forn || !n || !v) { toast('Preencha fornecedor, parcelas e valor.', 'err'); return false; }
      var obj = { id: p ? p.id : S.novoId('p'), cartao: $('#p-cart', o).value, fornecedor: forn, mes1: $('#p-mes', o).value, n: n, valor: E.r2(v) };
      if (p) Object.keys(obj).forEach(function (k) { p[k] = obj[k]; });
      else db.parcelamentos.push(obj);
      S.touch('Parcelamento salvo: ' + forn);
      toast('Parcelamento salvo');
    });
    var prev = function () {
      var n = +$('#p-n', ovl).value || 0, v = parseVal($('#p-val', ovl).value), m1 = $('#p-mes', ovl).value;
      $('#p-prev', ovl).innerHTML = n && v ? 'Total do compromisso: <b>' + E.brl(n * v) + '</b> · última parcela em <b>' + E.mesLabel(E.addMes(m1, n - 1)) + '</b>' : '';
    };
    ['#p-n', '#p-val', '#p-mes'].forEach(function (s) { $(s, ovl).oninput = prev; $(s, ovl).onchange = prev; });
    prev();
  }

  function formFatura() {
    var corpo = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld"><label>Cartão</label><select id="f-cart">' + opts(E.cartoes(db), E.cartoes(db)[0]) + '</select></div>' +
      '<div class="fld"><label>Mês de fechamento</label><select id="f-mes">' + selMeses(st.mes) + '</select></div>' +
      '<div class="fld"><label>Dia do pagamento</label><input type="number" id="f-dia" min="1" max="31" value="' + E.diasNoMes(st.mes) + '"></div>' +
      '<div class="fld"><label>Valor da fatura (R$)</label><input id="f-val" inputmode="decimal" placeholder="0,00"></div>' +
      '<div class="hint" style="grid-column:1/-1" id="f-prev"></div></div>';
    var ovl = modal('Lançar fatura de cartão', corpo, function (o) {
      var cart = $('#f-cart', o).value, mes = $('#f-mes', o).value, val = parseVal($('#f-val', o).value);
      if (!val || val <= 0) { toast('Informe um valor maior que zero.', 'err'); return false; }
      var cat = E.catDoCartao(db, cart);
      if (db.categorias.despesa.indexOf(cat) < 0) db.categorias.despesa.push(cat);
      var dia = Math.min(Math.max(1, +$('#f-dia', o).value || E.diasNoMes(mes)), E.diasNoMes(mes));
      var data = mes + '-' + String(dia).padStart(2, '0');
      var desc = 'Fatura ' + cart + ' — ' + E.mesLabel(mes);
      db.lancamentos.push({ id: S.novoId('l'), data: data, desc: desc, valor: -val, cat: cat, conta: 'Banco', rec: false });
      S.touch('Lançamento fatura: ' + desc);
      toast('Fatura lançada'); render();
    });
    var prev = function () {
      var cart = $('#f-cart', ovl).value, mes = $('#f-mes', ovl).value, val = parseVal($('#f-val', ovl).value);
      var par = E.totalParcelado(db, mes, cart), jaPago = E.faturaPaga(db, mes, cart);
      var txt = 'Categoria: <b>' + h(E.catDoCartao(db, cart)) + '</b> · parcelas cadastradas em ' + E.mesLabel(mes) + ': <b>' + E.brl(par) + '</b>';
      if (jaPago) txt += '<br><span style="color:#f3ca6d">Já existe ' + E.brl(jaPago) + ' lançado neste mês — este valor será somado.</span>';
      if (val > 0) txt += '<br>À vista + encargos resultante: <b>' + E.brl(E.r2(jaPago + val - par)) + '</b>';
      $('#f-prev', ovl).innerHTML = txt;
      $('#f-dia', ovl).max = E.diasNoMes(mes);
    };
    ['#f-cart', '#f-mes', '#f-val'].forEach(function (s) { $(s, ovl).oninput = prev; $(s, ovl).onchange = prev; });
    prev();
  }

  /* ========================================================= TELA · FLUXO === */
  function viewFluxo(root) {
    var casc = E.cascata(db);
    var de = st.fluxoDe || db.meta.primeiroMes, ate = st.fluxoAte || db.meta.ultimoMes;
    var jan = casc.filter(function (c) { return c.mes >= de && c.mes <= ate; });

    root.innerHTML = topo('Fluxo de caixa',
      'O saldo final de um mês é o saldo inicial do seguinte — recalculado a cada lançamento.',
      '<div class="inline">' +
      '<div class="fld"><label>De</label><select id="f-de">' + selMeses(de) + '</select></div>' +
      '<div class="fld"><label>Até</label><select id="f-ate">' + selMeses(ate) + '</select></div>' +
      '</div><button class="btn" id="csv">↓ CSV</button>') +

      '<div class="card" style="margin-bottom:14px"><h3>Entradas, saídas e saldo — ' + E.mesLabel(de) + ' a ' + E.mesLabel(ate) + '</h3>' +
      C.legenda([{ nome: 'Entradas', cor: 'var(--entrada)' }, { nome: 'Saídas', cor: 'var(--saida)' }]) +
      '<div id="ch-b"></div>' +
      '<div style="height:14px"></div>' +
      C.legenda([{ nome: 'Saldo final', cor: 'var(--brand-hi)' }]) +
      '<div id="ch-l"></div></div>' +

      '<div class="card"><h3>Tabela mensal</h3><div class="tw"><table><thead><tr>' +
      '<th>Mês</th><th class="c">Status</th><th class="r">Saldo inicial</th><th class="r">Entradas</th>' +
      '<th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Saldo final</th></tr></thead><tbody>' +
      jan.map(function (c) {
        return '<tr><td class="num">' + E.mesLabel(c.mes) + '</td><td class="c">' + tagStatus(c.status) + '</td>' +
          '<td class="r num">' + E.brl(c.saldoInicial) + '</td>' +
          '<td class="r"><span class="num pos">' + (c.entradas ? E.brl(c.entradas) : '—') + '</span></td>' +
          '<td class="r"><span class="num neg">' + (c.saidas ? E.brl(c.saidas) : '—') + '</span></td>' +
          '<td class="r">' + num(c.resultado) + '</td>' +
          '<td class="r num" style="font-weight:600' + (c.saldoFinal < 0 ? ';color:var(--saida)' : '') + '">' + E.brl(c.saldoFinal) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="3">TOTAL</td>' +
      '<td class="r num">' + E.brl(jan.reduce(function (a, c) { return a + c.entradas; }, 0)) + '</td>' +
      '<td class="r num">' + E.brl(jan.reduce(function (a, c) { return a + c.saidas; }, 0)) + '</td>' +
      '<td class="r num">' + E.brl(jan.reduce(function (a, c) { return a + c.resultado; }, 0)) + '</td>' +
      '<td class="r num">' + E.brl(jan.length ? jan[jan.length - 1].saldoFinal : 0) + '</td></tr></tfoot></table></div></div>';

    $('#f-de').onchange = function () { st.fluxoDe = this.value; render(); };
    $('#f-ate').onchange = function () { st.fluxoAte = this.value; render(); };
    $('#csv').onclick = function () {
      var linhas = [['Mes', 'Status', 'SaldoInicial', 'Entradas', 'Saidas', 'Resultado', 'SaldoFinal']];
      jan.forEach(function (c) { linhas.push([c.mes, c.status, c.saldoInicial, c.entradas, c.saidas, c.resultado, c.saldoFinal]); });
      baixarCSV(linhas, 'fluxo-de-caixa.csv');
    };

    C.barras($('#ch-b'), {
      labels: jan.map(function (c) { return E.mesLabel(c.mes); }),
      titulos: jan.map(function (c) { return E.mesLabelLongo(c.mes); }),
      series: [
        { nome: 'Entradas', cor: 'var(--entrada)', dados: jan.map(function (c) { return c.entradas; }) },
        { nome: 'Saídas', cor: 'var(--saida)', dados: jan.map(function (c) { return c.saidas; }) }
      ], altura: 230
    });
    C.linha($('#ch-l'), {
      labels: jan.map(function (c) { return E.mesLabel(c.mes); }),
      titulos: jan.map(function (c) { return E.mesLabelLongo(c.mes); }),
      series: [{ nome: 'Saldo final', cor: 'var(--brand-hi)', dados: jan.map(function (c) { return c.saldoFinal; }) }],
      area: true, altura: 200
    });
  }

  /* ==================================================== TELA · RELATÓRIOS === */
  function viewRelatorios(root) {
    var de = st.relDe || (db.meta.mesRef.slice(0, 4) + '-01');
    var ate = st.relAte || (db.meta.mesRef.slice(0, 4) + '-12');
    var meses = E.meses(db).filter(function (m) { return m >= de && m <= ate; });
    var classe = st.relClasse;
    var linhas = E.consolidado(db, classe, meses).filter(function (l) { return l.total > 0; });
    var total = linhas.reduce(function (a, l) { return a + l.total; }, 0);
    var cor = classe === 'receita' ? 'var(--entrada)' : 'var(--saida)';

    root.innerHTML = topo('Relatórios por categoria',
      'Soma automática de todos os lançamentos do período — nada é digitado aqui.',
      '<div class="seg" id="segcl"><button data-c="despesa" class="' + (classe === 'despesa' ? 'on' : '') + '">Despesas</button>' +
      '<button data-c="receita" class="' + (classe === 'receita' ? 'on' : '') + '">Receitas</button></div>' +
      '<div class="inline"><div class="fld"><label>De</label><select id="r-de">' + selMeses(de) + '</select></div>' +
      '<div class="fld"><label>Até</label><select id="r-ate">' + selMeses(ate) + '</select></div></div>' +
      '<button class="btn" id="csv">↓ CSV</button>') +

      '<div class="grid g-2" style="margin-bottom:14px">' +
      '<div class="card"><h3>Ranking do período</h3><div id="ch-rk"></div></div>' +
      '<div class="card"><h3>Total mês a mês</h3>' + C.legenda([{ nome: classe === 'receita' ? 'Receitas' : 'Despesas', cor: cor }]) + '<div id="ch-mm"></div></div>' +
      '</div>' +

      '<div class="card"><h3>' + (classe === 'receita' ? 'Receitas' : 'Despesas') + ' · ' + E.mesLabel(de) + ' a ' + E.mesLabel(ate) + '</h3>' +
      '<div class="tw"><table><thead><tr><th style="min-width:180px">Categoria</th>' +
      meses.map(function (m) { return '<th class="r">' + E.mesLabel(m) + '</th>'; }).join('') +
      '<th class="r">Total</th><th class="r">Média</th><th class="r">%</th></tr></thead><tbody>' +
      (linhas.length ? linhas.map(function (l) {
        return '<tr><td>' + (l.orfa ? '<span class="tag run">⚑ ' + h(l.cat) + '</span>' : h(l.cat)) + '</td>' +
          l.valores.map(function (v) { return '<td class="r num" style="' + (v ? '' : 'color:var(--ink-3)') + '">' + (v ? E.brl(v) : '—') + '</td>'; }).join('') +
          '<td class="r num"><b>' + E.brl(l.total) + '</b></td>' +
          '<td class="r num" style="color:var(--ink-2)">' + E.brl(l.total / meses.length) + '</td>' +
          '<td class="r num" style="color:var(--ink-2)">' + (total ? (l.total / total * 100).toFixed(1).replace('.', ',') : '0') + '%</td></tr>';
      }).join('') : '<tr><td colspan="' + (meses.length + 4) + '" class="empty">Sem dados no período.</td></tr>') +
      '</tbody><tfoot><tr><td>TOTAL</td>' +
      meses.map(function (m, i) {
        var s = linhas.reduce(function (a, l) { return a + l.valores[i]; }, 0);
        return '<td class="r num">' + (s ? E.brl(s) : '—') + '</td>';
      }).join('') +
      '<td class="r num">' + E.brl(total) + '</td><td class="r num">' + E.brl(total / meses.length) + '</td><td class="r">100%</td></tr></tfoot></table></div></div>';

    $$('#segcl button').forEach(function (b) { b.onclick = function () { st.relClasse = b.dataset.c; render(); }; });
    $('#r-de').onchange = function () { st.relDe = this.value; render(); };
    $('#r-ate').onchange = function () { st.relAte = this.value; render(); };
    $('#csv').onclick = function () {
      var out = [['Categoria'].concat(meses).concat(['Total'])];
      linhas.forEach(function (l) { out.push([l.cat].concat(l.valores).concat([l.total])); });
      baixarCSV(out, 'relatorio-' + classe + '.csv');
    };

    C.ranking($('#ch-rk'), { itens: linhas.map(function (l) { return { cat: l.cat, valor: l.total }; }), cor: cor, total: total, max: 12 });
    C.barras($('#ch-mm'), {
      labels: meses.map(function (m) { return E.mesLabel(m); }),
      titulos: meses.map(function (m) { return E.mesLabelLongo(m); }),
      series: [{
        nome: classe === 'receita' ? 'Receitas' : 'Despesas', cor: cor,
        dados: meses.map(function (m, i) { return E.r2(linhas.reduce(function (a, l) { return a + l.valores[i]; }, 0)); })
      }], altura: 240
    });
  }

  /* ========================================================= TELA · METAS === */
  function viewMetas(root) {
    var serieEp = E.saldoDevedorPorEmprestimo(db);
    var totQuitar = db.emprestimos.reduce(function (a, ep) { return a + E.emprestimo(db, ep).quitarHoje; }, 0);
    var totNominal = db.emprestimos.reduce(function (a, ep) { return a + E.emprestimo(db, ep).nominalRestante; }, 0);
    var totAmort = db.emprestimos.reduce(function (a, ep) { return a + E.emprestimo(db, ep).amortizado; }, 0);
    var nAmort = db.emprestimos.reduce(function (a, ep) { return a + (ep.amortizacoes || []).length; }, 0);
    var totParcAbat = db.emprestimos.reduce(function (a, ep) {
      return a + (ep.amortizacoes || []).reduce(function (b, z) { return b + (z.parcelas || []).length; }, 0);
    }, 0);
    var PALEP = ['var(--s1)', 'var(--s4)', 'var(--s3)', 'var(--s7)', 'var(--s6)'];
    var legenda = serieEp.linhas.map(function (l, i) { return { nome: l.cod, cor: PALEP[i % PALEP.length] }; })
      .concat([{ nome: 'Total', cor: 'var(--s5)' }]);

    root.innerHTML = topo('Metas & dívidas',
      'Taxa real deduzida das parcelas; o valor justo de quitação é o valor presente do que falta.',
      '<button class="btn" id="nmeta">+ Meta</button><button class="btn pri" id="nemp">+ Empréstimo</button>') +

      '<div class="card" style="margin-bottom:14px"><h3>Metas de poupança</h3>' +
      (db.metas.length ? '<div class="grid g-3">' + db.metas.map(function (mt, i) {
        var x = E.meta(db, mt);
        return '<div style="padding:14px;border:1px solid var(--stroke);border-radius:12px;background:rgba(0,0,0,.16)" data-i="' + i + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">' +
          '<b style="font-size:14.5px">' + h(mt.nome) + '</b>' +
          '<span><button class="iconbtn" data-emed>✎</button><button class="iconbtn del" data-emdl>✕</button></span></div>' +
          '<div class="num" style="font-size:20px;margin:8px 0 2px">' + E.brl(mt.guardado) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-3);margin-bottom:9px">de ' + E.brl(mt.alvo) + ' até ' + E.mesLabel(mt.prazo) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + (x.pct * 100).toFixed(1) + '%"></div></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;color:var(--ink-2)">' +
          '<span>' + E.pct(x.pct) + ' concluído</span>' +
          '<span>' + (x.semAlvo ? '<span class="tag am">defina o valor alvo</span>' : x.concluida ? '<span class="tag ok">meta atingida</span>' : x.vencida ? '<span class="tag run">prazo vencido</span>' : x.mesesRestantes + ' meses · ' + E.brl(x.aporte) + '/mês') + '</span></div>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty">Nenhuma meta cadastrada.</div>') + '</div>' +

      '<div class="grid g-kpi" style="margin-bottom:14px">' +
      kpi('Saldo devedor hoje', E.brl(totQuitar), 'Valor presente em ' + E.mesLabel(db.meta.mesRef), 'acc-out') +
      kpi('A pagar nominal', E.brl(totNominal), 'Soma das parcelas restantes', 'acc-am') +
      kpi('Economia se quitar', E.brl(totNominal - totQuitar), 'Juros que deixam de correr', 'acc-in') +
      kpi('Amortizado até hoje', E.brl(totAmort), nAmort + ' amortização(ões) · ' + totParcAbat + ' parcela(s) abatida(s)', 'acc-in') +
      '</div>' +

      '<div class="card" style="margin-bottom:14px"><h3>Demonstrativo de créditos consignados</h3><div class="tw"><table class="tight"><thead><tr>' +
      '<th>Cód.</th><th>Descrição</th><th class="r">Original</th><th class="c">Parc.</th><th class="r">Parcela</th>' +
      '<th class="r">Total</th><th class="r">Taxa<br>a.m. · a.a.</th><th class="c">Pagas</th>' +
      '<th class="r">Nominal</th><th class="r">Quitar hoje</th><th class="r">Economia</th>' +
      '<th class="r">Saldo devedor</th><th></th></tr></thead><tbody>' +
      (db.emprestimos.length ? db.emprestimos.map(function (ep, i) {
        var x = E.emprestimo(db, ep);
        var pt = h(ep.desc).split('—');
        return '<tr data-i="' + i + '"><td class="num">' + h(ep.cod) + '</td>' +
          '<td><b>' + pt[0].trim() + '</b>' + (pt[1] ? '<br><span style="color:var(--ink-3);font-size:11px">' + pt.slice(1).join('—').trim() + '</span>' : '') + '</td>' +
          '<td class="r num">' + E.brl(ep.principal) + '</td><td class="c num">' + ep.n + '</td>' +
          '<td class="r num">' + E.brl(ep.parcela) + '</td><td class="r num">' + E.brl(x.totalContrato) + '</td>' +
          '<td class="r num">' + (x.taxaMes * 100).toFixed(3).replace('.', ',') + '%<br>' +
          '<span style="color:var(--ink-3)">' + (x.taxaAno * 100).toFixed(2).replace('.', ',') + '%</span></td>' +
          '<td class="c num">' + x.pagas + '/' + ep.n + (x.antecipadas ? '<br><span class="tag am" title="parcelas antecipadas por amortização">' + x.antecipadas + ' ant.</span>' : '') + '</td>' +
          '<td class="r num">' + E.brl(x.nominalRestante) + '</td>' +
          '<td class="r num"><b>' + E.brl(x.quitarHoje) + '</b></td>' +
          '<td class="r"><span class="num pos">' + E.brl(x.economia) + '</span></td>' +
          '<td class="r num"><b>' + E.brl(x.saldoDevedor) + '</b></td>' +
          '<td class="c actions" style="width:66px"><button class="iconbtn" data-eped>✎</button><button class="iconbtn del" data-epdl>✕</button></td></tr>';
      }).join('') +
        '<tr style="border-top:2px solid var(--stroke-hard)"><td colspan="8"><b>TOTAL</b></td>' +
        '<td class="r num"><b>' + E.brl(totNominal) + '</b></td>' +
        '<td class="r num"><b>' + E.brl(totQuitar) + '</b></td>' +
        '<td class="r num pos"><b>' + E.brl(totNominal - totQuitar) + '</b></td>' +
        '<td class="r num"><b>' + E.brl(totQuitar) + '</b></td><td></td></tr>'
        : '<tr><td colspan="13" class="empty">Nenhum empréstimo cadastrado.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="alert info" style="margin-top:12px"><span class="ic">ⓘ</span><div>' +
      '<b>Como ler o quadro.</b> <b>Nominal</b> é a soma bruta das parcelas que ainda faltam ' +
      '(valor da parcela × parcelas em aberto). Inclui os juros de todos os meses futuros, que <i>ainda não correram</i> — ' +
      'é o quanto sai do bolso se o contrato seguir até o fim, e nunca o valor de quitação. ' +
      '<b>Quitar hoje</b> é o valor presente dessas mesmas parcelas: cada uma descontada pela taxa do contrato até a data em ' +
      'que venceria. <b>Saldo devedor</b> é esse mesmo número visto pelo lado da dívida — em contrato de parcela fixa, ' +
      'o saldo devedor de hoje <i>é</i> o valor presente do que falta; por isso as duas colunas coincidem. ' +
      '<b>Economia</b> é a diferença entre nominal e quitação: os juros que deixam de correr se você liquidar agora. ' +
      'A taxa é deduzida das próprias parcelas (TIR), então pode diferir em alguns reais do extrato do banco — ' +
      'confirme o número oficial antes de fechar qualquer quitação.</div></div>' +
      '</div>' +

      /* ---------- resumo por empréstimo ---------- */
      (db.emprestimos.length ? '<div class="card" style="margin-bottom:14px"><h3>Resumo e evolução de cada contrato</h3>' +
        '<div class="grid g-3">' + db.emprestimos.map(function (ep, i) {
          var x = E.emprestimo(db, ep);
          var amorts = (ep.amortizacoes || []).slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
          var nParc = amorts.reduce(function (a, z) { return a + (z.parcelas || []).length; }, 0);
          var proximaQuit = x.quitado ? '—' : (x.ultimaAberta ? E.mesLabel(E.addMes(ep.mes1, x.ultimaAberta - 1)) : '—');
          return '<div style="padding:14px;border:1px solid var(--stroke);border-radius:12px;background:rgba(0,0,0,.16)">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:start">' +
            '<b style="font-size:14px">' + h(ep.cod) + '</b>' +
            (x.quitado ? '<span class="tag ok">quitado</span>' : '<span class="tag run">em curso</span>') + '</div>' +
            '<div style="font-size:11.5px;color:var(--ink-3);margin:2px 0 10px">' + h(ep.desc) + '</div>' +
            '<div class="num" style="font-size:20px">' + E.brl(x.saldoDevedor) + '</div>' +
            '<div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">saldo devedor em ' + E.mesLabel(db.meta.mesRef) + '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + (x.pctPago * 100).toFixed(1) + '%"></div></div>' +
            '<div style="font-size:11.5px;color:var(--ink-2);margin-top:7px">' + E.pct(x.pctPago) + ' do contrato liquidado</div>' +
            '<table style="margin-top:10px;font-size:12px"><tbody>' +
            '<tr><td style="color:var(--ink-3)">Parcelas pelo calendário</td><td class="r num">' + x.pagasCalendario + '</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Parcelas antecipadas</td><td class="r num">' + x.antecipadas + '</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Parcelas em aberto</td><td class="r num">' + x.restantes +
            (x.restantes ? ' <span style="color:var(--ink-3)">(' + x.primeiraAberta + '–' + x.ultimaAberta + ')</span>' : '') + '</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Amortizado (desembolso)</td><td class="r num">' + E.brl(x.amortizado) + '</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Amortizações</td><td class="r num">' + amorts.length + ' · ' + nParc + ' parc.</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Última parcela em aberto</td><td class="r num">' + proximaQuit + '</td></tr>' +
            '<tr><td style="color:var(--ink-3)">Fim original do contrato</td><td class="r num">' + E.mesLabel(x.ultima) + '</td></tr>' +
            '</tbody></table></div>';
        }).join('') + '</div></div>' : '') +

      '<div class="card" style="margin-bottom:14px"><h3>Amortizações registradas <span class="tag">' + nAmort + '</span></h3>' +
      '<div class="inline" style="margin-bottom:12px"><button class="btn pri" id="nova-amort">+ Registrar amortização</button>' +
      '<div class="spacer"></div><div class="hint" style="margin:0">A amortização paga sempre as <b>últimas</b> parcelas do contrato, de trás para a frente.</div></div>' +
      '<div id="lista-amort"></div></div>' +

      '<div class="card"><h3>Evolução do saldo devedor</h3>' +
      '<div class="hint" style="margin:0 0 8px">Uma linha por contrato e a linha grossa do total. Os rótulos mostram o saldo em pontos selecionados.</div>' +
      C.legenda(legenda) + '<div id="ch-dv"></div></div>';

    $('#nmeta').onclick = function () { formMeta(-1); };
    $('#nemp').onclick = function () { formEmprestimo(-1); };
    $$('[data-emed]').forEach(function (b) { b.onclick = function () { formMeta(+b.closest('[data-i]').dataset.i); }; });
    $$('[data-emdl]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.closest('[data-i]').dataset.i;
        confirmar('Excluir a meta "' + db.metas[i].nome + '"?', function () { db.metas.splice(i, 1); S.touch('Excluiu meta'); toast('Meta excluída'); });
      };
    });
    $$('[data-eped]').forEach(function (b) { b.onclick = function () { formEmprestimo(+b.closest('tr').dataset.i); }; });
    $$('[data-epdl]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.closest('tr').dataset.i;
        confirmar('Excluir o empréstimo "' + db.emprestimos[i].desc + '"?', function () { db.emprestimos.splice(i, 1); S.touch('Excluiu empréstimo'); toast('Empréstimo excluído'); });
      };
    });

    /* ---------- lista completa de amortizações ---------- */
    var amortListaEl = $('#lista-amort');
    var linhasAmort = [];
    db.emprestimos.forEach(function (ep, i) {
      (ep.amortizacoes || []).forEach(function (a, ai) {
        linhasAmort.push({ ep: ep, ei: i, ai: ai, a: a });
      });
    });
    linhasAmort.sort(function (x, y) { return x.a.data < y.a.data ? 1 : x.a.data > y.a.data ? -1 : 0; });
    if (linhasAmort.length) {
      amortListaEl.innerHTML = '<div class="tw"><table><thead><tr>' +
        '<th class="c">Data</th><th>Contrato</th><th class="r">Valor pago</th>' +
        '<th class="c">Qtd.</th><th>Parcelas abatidas</th><th>Observação</th><th></th></tr></thead><tbody>' +
        linhasAmort.map(function (r) {
          var ps = (r.a.parcelas || []).slice().sort(function (p, q) { return p - q; });
          return '<tr data-i="' + r.ei + '" data-ai="' + r.ai + '">' +
            '<td class="c num">' + E.dataLabel(r.a.data) + '/' + r.a.data.slice(2, 4) + '</td>' +
            '<td><b>' + h(r.ep.cod) + '</b> <span style="color:var(--ink-3)">' + h(r.ep.desc) + '</span></td>' +
            '<td class="r num">' + E.brl(r.a.valor) + '</td>' +
            '<td class="c num">' + ps.length + '</td>' +
            '<td class="num" style="font-size:12px">' + (ps.length ? faixaParcelas(ps) : '<span style="color:var(--ink-3)">—</span>') + '</td>' +
            '<td style="color:var(--ink-2);font-size:12.5px">' + h(r.a.descricao || '—') + '</td>' +
            '<td class="c actions" style="width:74px"><button class="iconbtn" data-aed>✎</button><button class="iconbtn del" data-adl>✕</button></td></tr>';
        }).join('') +
        '<tr style="border-top:2px solid var(--stroke-hard)"><td colspan="2"><b>TOTAL</b></td>' +
        '<td class="r num"><b>' + E.brl(totAmort) + '</b></td>' +
        '<td class="c num"><b>' + totParcAbat + '</b></td><td colspan="3"></td></tr>' +
        '</tbody></table></div>';
      $$('[data-aed]', amortListaEl).forEach(function (b) { b.onclick = function () { var tr = b.closest('tr'); formAmortizacao(+tr.dataset.i, +tr.dataset.ai); }; });
      $$('[data-adl]', amortListaEl).forEach(function (b) {
        b.onclick = function () {
          var tr = b.closest('tr'), ei = +tr.dataset.i, ai = +tr.dataset.ai, a = db.emprestimos[ei].amortizacoes[ai];
          confirmar('Remover a amortização de ' + E.brl(a.valor) + ' em ' + E.dataLabel(a.data) + '? O lançamento correspondente também sai do fluxo de caixa.', function () {
            if (a.lancId) db.lancamentos = db.lancamentos.filter(function (l) { return l.id !== a.lancId; });
            db.emprestimos[ei].amortizacoes.splice(ai, 1);
            S.touch('Removeu amortização'); toast('Amortização removida'); render();
          });
        };
      });
    } else {
      amortListaEl.innerHTML = '<div class="empty">Nenhuma amortização registrada.</div>';
    }
    $('#nova-amort').onclick = function () { formAmortizacao(-1, -1); };

    /* ---------- gráfico: uma linha por contrato + total ---------- */
    C.linha($('#ch-dv'), {
      labels: serieEp.meses.map(function (m) { return E.mesLabel(m); }),
      titulos: serieEp.meses.map(function (m) { return E.mesLabelLongo(m); }),
      series: serieEp.linhas.map(function (l, i) {
        return { nome: l.cod, cor: PALEP[i % PALEP.length], dados: l.dados, espessura: 1.7, rotular: false };
      }).concat([{ nome: 'Total', cor: 'var(--s5)', dados: serieEp.total, espessura: 3, rotular: true }]),
      rotulos: true, altura: 300
    });
  }
  /** "14–21, 30, 40–72" a partir de uma lista de números */
  function faixaParcelas(ps) {
    var out = [], ini = ps[0], ant = ps[0];
    for (var i = 1; i <= ps.length; i++) {
      if (i < ps.length && ps[i] === ant + 1) { ant = ps[i]; continue; }
      out.push(ini === ant ? String(ini) : ini + '–' + ant);
      ini = ant = ps[i];
    }
    return out.join(', ');
  }
  function formMeta(i) {
    var m = i >= 0 ? db.metas[i] : null;
    var corpo = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld" style="grid-column:1/-1"><label>Nome da meta</label><input id="m-n" value="' + h(m ? m.nome : '') + '" placeholder="ex.: Reserva de emergência"></div>' +
      '<div class="fld"><label>Valor alvo (R$)</label><input id="m-a" inputmode="decimal" value="' + (m ? m.alvo.toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div class="fld"><label>Já guardado (R$)</label><input id="m-g" inputmode="decimal" value="' + (m ? m.guardado.toFixed(2).replace('.', ',') : '0,00') + '"></div>' +
      '<div class="fld" style="grid-column:1/-1"><label>Prazo</label><select id="m-p">' + selMeses(m ? m.prazo : E.addMes(db.meta.mesRef, 12)) + '</select></div></div>';
    modal(i >= 0 ? 'Editar meta' : 'Nova meta', corpo, function (o) {
      var n = $('#m-n', o).value.trim(); if (!n) { toast('Informe o nome.', 'err'); return false; }
      var obj = { nome: n, alvo: parseVal($('#m-a', o).value), guardado: parseVal($('#m-g', o).value), prazo: $('#m-p', o).value };
      if (m) Object.keys(obj).forEach(function (k) { m[k] = obj[k]; }); else db.metas.push(obj);
      S.touch('Meta salva: ' + n); toast('Meta salva');
    });
  }
  function formEmprestimo(i) {
    var e = i >= 0 ? db.emprestimos[i] : null;
    var corpo = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld"><label>Código</label><input id="e-c" value="' + h(e ? e.cod : 'EP ' + (db.emprestimos.length + 1)) + '"></div>' +
      '<div class="fld"><label>Mês da 1ª parcela</label><select id="e-m">' + selMeses(e ? e.mes1 : db.meta.mesRef) + '</select></div>' +
      '<div class="fld" style="grid-column:1/-1"><label>Descrição</label><input id="e-d" value="' + h(e ? e.desc : '') + '"></div>' +
      '<div class="fld"><label>Valor recebido (R$)</label><input id="e-p" inputmode="decimal" value="' + (e ? e.principal.toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div class="fld"><label>Nº de parcelas</label><input type="number" id="e-n" min="1" max="480" value="' + (e ? e.n : 36) + '"></div>' +
      '<div class="fld"><label>Valor da parcela (R$)</label><input id="e-v" inputmode="decimal" value="' + (e ? e.parcela.toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div class="fld"><label>Parcelas já antecipadas</label><input type="number" id="e-a" min="0" max="480" value="' + (e ? (e.antecipadas || 0) : 0) + '"></div>' +
      '<div class="hint" style="grid-column:1/-1">Parcelas do fim do contrato que já foram quitadas por amortização extra. Some aqui as parcelas que você antecipou — as regulares o sistema conta sozinho pelo calendário.</div>' +
      '</div><div class="hint" id="e-prev" style="margin-top:12px"></div>';
    var ovl = modal(i >= 0 ? 'Editar empréstimo' : 'Novo empréstimo', corpo, function (o) {
      var d = $('#e-d', o).value.trim(); if (!d) { toast('Informe a descrição.', 'err'); return false; }
      var obj = {
        cod: $('#e-c', o).value, desc: d, principal: parseVal($('#e-p', o).value),
        n: +$('#e-n', o).value, parcela: parseVal($('#e-v', o).value), mes1: $('#e-m', o).value,
        antecipadas: Math.max(0, +$('#e-a', o).value || 0)
      };
      if (e) Object.keys(obj).forEach(function (k) { e[k] = obj[k]; }); else db.emprestimos.push(obj);
      S.touch('Empréstimo salvo: ' + d); toast('Empréstimo salvo');
    });
    var prev = function () {
      var pv = parseVal($('#e-p', ovl).value), pmt = parseVal($('#e-v', ovl).value), n = +$('#e-n', ovl).value;
      if (pv && pmt && n) {
        var i2 = E.taxaImplicita(pv, pmt, n);
        $('#e-prev', ovl).innerHTML = 'Taxa implícita: <b>' + (i2 * 100).toFixed(3).replace('.', ',') + '% a.m.</b> (' +
          ((Math.pow(1 + i2, 12) - 1) * 100).toFixed(2).replace('.', ',') + '% a.a.) · total pago <b>' + E.brl(pmt * n) + '</b>';
      } else $('#e-prev', ovl).innerHTML = '';
    };
    ['#e-p', '#e-v', '#e-n'].forEach(function (s) { $(s, ovl).oninput = prev; });
    prev();
  }
  function formAmortizacao(ei, ai) {
    if (!db.emprestimos.length) { toast('Cadastre um empréstimo primeiro.', 'err'); return; }
    var epIni = ei >= 0 ? ei : 0;
    var a = (ei >= 0 && ai >= 0) ? db.emprestimos[ei].amortizacoes[ai] : null;
    var sel = {};                                  // parcelas marcadas nesta amortização
    if (a) (a.parcelas || []).forEach(function (p) { sel[p] = 1; });

    var corpo =
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld" style="grid-column:1/-1"><label>Contrato</label><select id="a-ep"' + (a ? ' disabled' : '') + '>' +
      opts(db.emprestimos.map(function (e, i) { return { v: String(i), l: e.cod + ' — ' + e.desc }; }), String(epIni)) +
      '</select></div>' +
      '<div class="fld"><label>Data do pagamento</label><input type="date" id="a-d" value="' + (a ? a.data : E.hoje()) + '"></div>' +
      '<div class="fld"><label>Quantas parcelas abater</label><input type="number" id="a-q" min="0" step="1" value="' + (a ? (a.parcelas || []).length : 0) + '"></div>' +
      '</div>' +
      '<div class="hint" style="margin:12px 0 6px">A amortização quita as <b>últimas</b> parcelas do contrato, de trás para a frente. ' +
      'Escolha a quantidade acima ou clique numa parcela abaixo — tudo dela até o fim do contrato entra no abatimento.</div>' +
      '<div id="a-grade" class="parc-grid"></div>' +
      '<div id="a-resumo" class="hint" style="margin-top:10px"></div>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">' +
      '<div class="fld"><label>Valor efetivamente pago (R$)</label><input id="a-v" inputmode="decimal" value="' + (a ? a.valor.toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div class="fld"><label>Observação</label><input id="a-desc" value="' + h(a ? (a.descricao || '') : 'Amortização extra') + '"></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:8px">O valor sugerido é o valor presente das parcelas escolhidas. ' +
      'Se o banco cobrou outro número, digite o valor do comprovante — ele é o que entra no fluxo de caixa.</div>';

    var ovl = modal(a ? 'Editar amortização' : 'Registrar amortização', corpo, function (o) {
      var eix = +$('#a-ep', o).value;
      var ep2 = db.emprestimos[eix];
      var data = $('#a-d', o).value, val = parseVal($('#a-v', o).value), desc = $('#a-desc', o).value.trim();
      var parcelas = Object.keys(sel).map(Number).sort(function (x, y) { return x - y; });
      if (!data) { toast('Informe a data do pagamento.', 'err'); return false; }
      if (!val || val <= 0) { toast('Informe o valor pago.', 'err'); return false; }
      if (!parcelas.length) { toast('Selecione quantas parcelas foram abatidas.', 'err'); return false; }

      if (!ep2.amortizacoes) ep2.amortizacoes = [];
      // o campo legado deixa de valer assim que existe amortização detalhada
      if (ep2.antecipadas) ep2.antecipadas = 0;

      var cat = 'Amortização ' + ep2.cod;
      if (db.categorias.despesa.indexOf(cat) < 0) db.categorias.despesa.push(cat);
      var rotulo = 'Amortização ' + ep2.cod + (parcelas.length ? ' (parcelas ' + faixaParcelas(parcelas) + ')' : '');

      if (a) {
        a.data = data; a.valor = E.r2(val); a.descricao = desc; a.parcelas = parcelas;
        var lan = db.lancamentos.filter(function (l) { return l.id === a.lancId; })[0];
        if (lan) { lan.data = data; lan.valor = -E.r2(val); lan.desc = rotulo; lan.cat = cat; }
        else {
          var nid = S.novoId('l');
          db.lancamentos.push({ id: nid, data: data, desc: rotulo, valor: -E.r2(val), cat: cat, conta: 'Banco', rec: false });
          a.lancId = nid;
        }
      } else {
        var id2 = S.novoId('l');
        db.lancamentos.push({ id: id2, data: data, desc: rotulo, valor: -E.r2(val), cat: cat, conta: 'Banco', rec: false });
        ep2.amortizacoes.push({ data: data, valor: E.r2(val), descricao: desc, parcelas: parcelas, lancId: id2 });
      }
      S.touch('Amortização ' + ep2.cod); toast('Amortização registrada no fluxo de caixa'); render();
    }, 'Salvar');

    /* ---- estado e redesenho da grade de parcelas ---- */
    function epAtual() { return db.emprestimos[+$('#a-ep', ovl).value]; }
    function mesRefAmort() {
      var d = $('#a-d', ovl).value;
      return d ? d.slice(0, 7) : db.meta.mesRef;
    }
    /** parcelas disponíveis para abater: em aberto no mês da amortização (as desta edição voltam a contar) */
    function disponiveis() {
      var ep2 = epAtual(), m = mesRefAmort();
      var k = E.parcelasCalendario(ep2, m);
      var outras = {};
      (ep2.amortizacoes || []).forEach(function (z) {
        if (a && z === a) return;
        if (z.data.slice(0, 7) > m) return;
        (z.parcelas || []).forEach(function (p) { outras[p] = 1; });
      });
      var out = [];
      for (var j = ep2.n; j >= 1; j--) {
        out.push({ n: j, mes: E.addMes(ep2.mes1, j - 1), estado: j <= k ? 'calendario' : (outras[j] ? 'outra' : 'livre') });
      }
      return out;
    }
    function aplicarQtd(q) {
      var livres = disponiveis().filter(function (p) { return p.estado === 'livre'; }); // já em ordem decrescente
      sel = {};
      livres.slice(0, Math.max(0, q)).forEach(function (p) { sel[p.n] = 1; });
      desenhar();
    }
    function desenhar() {
      var ep2 = epAtual(), m = mesRefAmort();
      var lst = disponiveis();
      var i = E.taxaImplicita(ep2.principal, ep2.parcela, ep2.n);
      $('#a-grade', ovl).innerHTML = lst.map(function (p) {
        var cls = p.estado === 'calendario' ? 'pc pago' : p.estado === 'outra' ? 'pc ant' : (sel[p.n] ? 'pc on' : 'pc');
        var tit = p.estado === 'calendario' ? 'parcela já paga pelo calendário ('
          : p.estado === 'outra' ? 'já antecipada em outra amortização (' : 'vence em (';
        return '<button type="button" class="' + cls + '" data-p="' + p.n + '" title="' + tit + E.mesLabel(p.mes) + ')">' +
          p.n + '<i>' + E.mesLabel(p.mes) + '</i></button>';
      }).join('');
      $$('.pc', ovl).forEach(function (b) {
        b.onclick = function () {
          var n = +b.dataset.p, livres = lst.filter(function (p) { return p.estado === 'livre'; });
          if (livres.every(function (p) { return p.n !== n; })) return;
          var alvo = livres.filter(function (p) { return p.n >= n; });
          var jaTodas = alvo.every(function (p) { return sel[p.n]; }) && Object.keys(sel).length === alvo.length;
          sel = {};
          if (!jaTodas) alvo.forEach(function (p) { sel[p.n] = 1; });
          $('#a-q', ovl).value = Object.keys(sel).length;
          desenhar();
        };
      });

      var ps = Object.keys(sel).map(Number).sort(function (x, y) { return x - y; });
      var nominal = E.r2(ps.length * ep2.parcela);
      var pv = 0;
      ps.forEach(function (n) {
        var t = E.diffMes(m, E.addMes(ep2.mes1, n - 1)); if (t < 1) t = 1;
        pv += ep2.parcela / Math.pow(1 + i, t);
      });
      pv = E.r2(pv);
      var abertasDepois = lst.filter(function (p) { return p.estado === 'livre' && !sel[p.n]; }).length;
      $('#a-resumo', ovl).innerHTML = ps.length
        ? '<b>' + ps.length + ' parcela(s)</b> — nº ' + faixaParcelas(ps) + ' · nominal ' + E.brl(nominal) +
        ' · valor presente <b>' + E.brl(pv) + '</b> · desconto ' + E.brl(nominal - pv) +
        '<br>Depois desta amortização restam <b>' + abertasDepois + '</b> parcela(s) em aberto no contrato.'
        : '<span style="color:var(--ink-3)">Nenhuma parcela selecionada.</span>';
      var campo = $('#a-v', ovl);
      if (!campo.dataset.tocado && ps.length) campo.value = pv.toFixed(2).replace('.', ',');
    }

    $('#a-q', ovl).oninput = function () { aplicarQtd(+this.value || 0); };
    $('#a-ep', ovl).onchange = function () { sel = {}; $('#a-q', ovl).value = 0; desenhar(); };
    $('#a-d', ovl).onchange = desenhar;
    $('#a-v', ovl).oninput = function () { this.dataset.tocado = '1'; };
    if (a) $('#a-v', ovl).dataset.tocado = '1';
    desenhar();
  }

  /* ===================================================== TELA · AUDITORIA === */
  function viewAuditoria(root) {
    var av = E.diagnostico(db);
    var g = { crit: [], warn: [], info: [] };
    av.forEach(function (a) { g[a.n].push(a); });
    var casc = E.cascata(db);
    var confSoma = E.r2(casc.reduce(function (a, c) { return a + c.resultado; }, 0) + db.meta.saldoInicial);
    var confFinal = casc.length ? casc[casc.length - 1].saldoFinal : 0;

    function bloco(t, arr, cls, icone) {
      return '<div class="card" style="margin-bottom:14px"><h3>' + icone + ' ' + t + ' <span class="tag">' + arr.length + '</span></h3>' +
        (arr.length ? '<div class="tw"><table><tbody>' + arr.map(function (a) {
          return '<tr><td style="width:38%"><b>' + h(a.t) + '</b></td><td style="color:var(--ink-2)">' + h(a.d) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nada a corrigir aqui. ✓</div>') + '</div>';
    }

    root.innerHTML = topo('Auditoria automática',
      'Roda a cada carregamento sobre a base inteira — ' + db.lancamentos.length + ' lançamentos, ' + E.meses(db).length + ' meses.') +

      '<div class="grid g-kpi" style="margin-bottom:14px">' +
      kpi('Conferência da cascata', E.brl(E.r2(confSoma - confFinal)), 'Deve ser R$ 0,00', Math.abs(confSoma - confFinal) < 0.005 ? 'acc-in' : 'acc-out') +
      kpi('Críticos', String(g.crit.length), 'exigem correção', g.crit.length ? 'acc-out' : 'acc-in') +
      kpi('Atenção', String(g.warn.length), 'vale conferir', 'acc-am') +
      kpi('Observações', String(g.info.length), 'informativos', 'acc-br') +
      '</div>' +

      bloco('Críticos', g.crit, 'crit', '⚑') +
      bloco('Atenção', g.warn, 'warn', '⚠') +
      bloco('Observações', g.info, 'info', 'ⓘ') +

      '<div class="card"><h3>Últimas operações</h3><div class="tw"><table><thead><tr><th style="width:150px">Quando</th><th>Operação</th></tr></thead><tbody>' +
      (S.historico().slice(0, 40).map(function (x) {
        return '<tr><td class="num" style="color:var(--ink-3)">' + new Date(x.t).toLocaleString('pt-BR') + '</td><td>' + h(x.d) + '</td></tr>';
      }).join('') || '<tr><td colspan="2" class="empty">Sem operações registradas ainda.</td></tr>') +
      '</tbody></table></div></div>';
  }

  /* ==================================================== TELA · CATEGORIAS === */
  function viewCategorias(root) {
    function lista(classe) {
      var arr = db.categorias[classe];
      var uso = {};
      db.lancamentos.forEach(function (l) { uso[l.cat] = (uso[l.cat] || 0) + 1; });
      return '<div class="card"><h3>' + (classe === 'receita' ? 'Receitas' : 'Despesas') + ' <span class="tag">' + arr.length + '</span></h3>' +
        '<div class="inline" style="margin-bottom:12px"><div class="fld" style="flex:1"><input placeholder="nova categoria de ' + classe + '" data-add="' + classe + '"></div>' +
        '<button class="btn" data-addbtn="' + classe + '">+ Adicionar</button></div>' +
        '<div class="tw" style="max-height:420px"><table><tbody>' + arr.map(function (c, i) {
          return '<tr><td>' + h(c) + '</td><td class="r num" style="color:var(--ink-3);width:80px">' + (uso[c] || 0) + ' lanç.</td>' +
            '<td class="c actions" style="width:74px"><button class="iconbtn" data-rn="' + classe + '|' + i + '">✎</button>' +
            '<button class="iconbtn del" data-rm="' + classe + '|' + i + '">✕</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    root.innerHTML = topo('Categorias',
      'Toda categoria nova entra automaticamente nos menus de lançamento e nos relatórios.') +
      '<div class="grid g-2">' + lista('receita') + lista('despesa') + '</div>';

    $$('[data-addbtn]').forEach(function (b) {
      b.onclick = function () {
        var cl = b.dataset.addbtn, inp = $('[data-add="' + cl + '"]');
        var v = inp.value.trim(); if (!v) return;
        if (E.todasCategorias(db).indexOf(v) >= 0) { toast('Essa categoria já existe.', 'err'); return; }
        db.categorias[cl].push(v);
        db.categorias[cl].sort(function (a, b2) { return a.localeCompare(b2, 'pt-BR'); });
        S.touch('Nova categoria: ' + v); toast('Categoria adicionada'); render();
      };
    });
    $$('[data-add]').forEach(function (i) { i.onkeydown = function (e) { if (e.key === 'Enter') $('[data-addbtn="' + i.dataset.add + '"]').click(); }; });
    $$('[data-rn]').forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.rn.split('|'), cl = p[0], i = +p[1], antigo = db.categorias[cl][i];
        modal('Renomear categoria', '<div class="fld"><label>Nome</label><input id="c-n" value="' + h(antigo) + '"></div>' +
          '<div class="hint" style="margin-top:10px">Todos os lançamentos com esta categoria serão atualizados.</div>', function (o) {
            var novo = $('#c-n', o).value.trim(); if (!novo || novo === antigo) return;
            db.categorias[cl][i] = novo;
            db.lancamentos.forEach(function (l) { if (l.cat === antigo) l.cat = novo; });
            (db.recorrentes || []).forEach(function (r) { if (r.cat === antigo) r.cat = novo; });
            S.touch('Renomeou categoria ' + antigo + ' → ' + novo); toast('Categoria renomeada'); render();
          });
      };
    });
    $$('[data-rm]').forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.rm.split('|'), cl = p[0], i = +p[1], c = db.categorias[cl][i];
        var n = db.lancamentos.filter(function (l) { return l.cat === c; }).length;
        confirmar(n ? 'A categoria "' + c + '" tem ' + n + ' lançamento(s). Eles ficarão sem categoria. Continuar?' : 'Excluir a categoria "' + c + '"?', function () {
          db.categorias[cl].splice(i, 1);
          S.touch('Excluiu categoria: ' + c); toast('Categoria excluída'); render();
        });
      };
    });
  }

  /* ========================================================= TELA · DADOS === */
  function viewDados(root) {
    var tamanho = 0;
    try { tamanho = new Blob([JSON.stringify(db)]).size; } catch (e) { }
    root.innerHTML = topo('Dados & backup',
      'O sistema grava sozinho no navegador (IndexedDB + localStorage) a cada alteração.') +

      '<div class="grid g-2" style="margin-bottom:14px">' +
      '<div class="card"><h3>Configuração</h3>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="fld"><label>Mês de referência</label><select id="d-ref">' + selMeses(db.meta.mesRef) + '</select></div>' +
      '<div class="fld"><label>Saldo inicial (R$)</label><input id="d-si" inputmode="decimal" value="' + db.meta.saldoInicial.toFixed(2).replace('.', ',') + '"></div>' +
      '<div class="fld"><label>Primeiro mês</label><input id="d-pm" type="month" value="' + db.meta.primeiroMes + '"></div>' +
      '<div class="fld"><label>Último mês</label><input id="d-um" type="month" value="' + db.meta.ultimoMes + '"></div>' +
      '</div>' +
      '<div class="hint">O mês de referência separa o <b>realizado</b> da <b>projeção</b> e controla parcelas pagas, metas e consignados.</div>' +
      '<div style="margin-top:14px"><button class="btn pri" id="d-salvar">Salvar configuração</button></div></div>' +

      '<div class="card"><h3>Situação da base</h3>' +
      '<table><tbody>' +
      linhaInfo('Lançamentos', db.lancamentos.length) +
      linhaInfo('Parcelamentos', db.parcelamentos.length) +
      linhaInfo('Recorrentes', (db.recorrentes || []).length) +
      linhaInfo('Categorias', E.todasCategorias(db).length) +
      linhaInfo('Meses cobertos', E.meses(db).length) +
      linhaInfo('Tamanho da base', (tamanho / 1024).toFixed(1).replace('.', ',') + ' KB') +
      '<tr><td style="color:var(--ink-3)">Espaço no navegador</td><td class="r num" id="d-quota">…</td></tr>' +
      '<tr><td style="color:var(--ink-3)">Armazenamento persistente</td><td class="r" id="d-persist">…</td></tr>' +
      '<tr><td style="color:var(--ink-3)">Último backup</td><td class="r num">' +
      (db.meta.ultimoBackup
        ? new Date(db.meta.ultimoBackup).toLocaleDateString('pt-BR') + ' (' + diasDesdeBackup() + 'd)'
        : '<span style="color:#f0d69a">nunca</span>') + '</td></tr>' +
      '</tbody></table>' +
      '<div class="alert info" style="margin-top:14px"><span class="ic">ⓘ</span><div>Os dados ficam <b>neste navegador</b>. Faça um backup em JSON com frequência — é o arquivo que leva tudo para outro computador ou celular.</div></div>' +
      '</div></div>' +

      '<div class="card"><h3>Backup e restauração</h3>' +
      '<div class="inline">' +
      '<button class="btn pri" id="d-exp">↓ Baixar backup (JSON)</button>' +
      '<button class="btn" id="d-imp">↑ Restaurar backup</button>' +
      '<button class="btn" id="d-csv">↓ Exportar tudo em CSV</button>' +
      '<div class="spacer"></div>' +
      (S.temSementeAberta() ? '<button class="btn" id="d-seed">Voltar à planilha original</button>' : '') +
      '<button class="btn dgr" id="d-zap">Apagar tudo</button>' +
      '<input type="file" id="d-file" accept=".json,application/json" style="display:none">' +
      '</div>' +
      '<div class="hint">O backup JSON é o arquivo que leva tudo para outro computador ou celular. “Apagar tudo” limpa este navegador.</div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px" id="sync-painel">' + blocoSync() + '</div>' +

      '<div class="card" style="margin-top:14px"><h3>Proteção por senha</h3>' +
      '<p style="font-size:13.5px;color:var(--ink-2);max-width:70ch">O arquivo publicado na internet (<code>data/seed.enc.js</code>) guarda seus dados <b>criptografados</b> em AES‑256‑GCM, com a chave derivada da sua senha por PBKDF2 (250 mil iterações). Sem a senha, quem baixar o arquivo vê apenas texto embaralhado.</p>' +
      '<div class="inline" style="margin-top:14px">' +
      '<button class="btn pri" id="d-senha">🔑 Gerar pacote com nova senha</button>' +
      '<button class="btn" id="d-lock">🔒 Bloquear este navegador</button>' +
      '</div>' +
      '<div class="hint">“Gerar pacote” baixa um <code>seed.enc.js</code> novo, com a base atual e a senha que você escolher — substitua o arquivo no repositório para atualizar o site. “Bloquear” apaga a cópia local: na próxima abertura o sistema pedirá a senha de novo (use em computador compartilhado).</div>' +
      '</div>';

    $('#d-salvar').onclick = function () {
      db.meta.mesRef = $('#d-ref').value;
      db.meta.saldoInicial = parseVal($('#d-si').value);
      db.meta.primeiroMes = $('#d-pm').value;
      db.meta.ultimoMes = $('#d-um').value;
      E.aplicarRecorrentes(db);
      S.touch('Configuração alterada'); toast('Configuração salva');
    };
    $('#d-exp').onclick = function () { fazerBackup(); };
    S.quota().then(function (q) {
      var el = $('#d-quota'); if (!el) return;
      el.textContent = q && q.quota
        ? (q.usage / 1048576).toFixed(1).replace('.', ',') + ' MB usados de ' + (q.quota / 1073741824).toFixed(1).replace('.', ',') + ' GB'
        : 'não informado';
    });
    (function () {
      var el = $('#d-persist'); if (!el) return;
      var p = S.persistente;
      el.innerHTML = p === true ? '<span class="tag ok">sim — protegido contra limpeza automática</span>'
        : p === false ? '<span class="tag run">não concedido pelo navegador</span>'
          : '<span class="tag">não suportado</span>';
    })();
    ligarBotoesSync();
    $('#d-imp').onclick = function () { $('#d-file').click(); };
    $('#d-file').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { S.importar(fr.result); toast('Backup restaurado'); }
        catch (e) { toast('Arquivo inválido: ' + e.message, 'err'); }
      };
      fr.readAsText(f);
    };
    $('#d-csv').onclick = function () {
      var out = [['Data', 'Descricao', 'Categoria', 'Entrada', 'Saida', 'Conta']];
      db.lancamentos.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; }).forEach(function (l) {
        out.push([l.data, l.desc, l.cat, l.valor > 0 ? l.valor : '', l.valor < 0 ? -l.valor : '', l.conta || '']);
      });
      baixarCSV(out, 'lancamentos-completo.csv');
    };
    if ($('#d-seed')) $('#d-seed').onclick = function () {
      confirmar('Isso descarta as alterações feitas aqui e volta aos dados da planilha. Continuar?', function () {
        S.restaurarSemente(); toast('Base restaurada');
      });
    };
    $('#d-lock').onclick = function () {
      confirmar('Apagar a cópia local? O site voltará a pedir a senha. Seus dados continuam no arquivo publicado e no seu backup JSON.', function () {
        S.apagarTudo().then(function () { location.reload(); });
      });
    };
    $('#d-senha').onclick = function () {
      if (!global.Cripto || !Cripto.disponivel()) { toast('Criptografia indisponível neste contexto. Abra o site pelo endereço https.', 'err'); return; }
      modal('Gerar pacote protegido',
        '<div class="fld"><label>Nova senha</label><input type="password" id="s1" autocomplete="new-password"></div>' +
        '<div class="fld" style="margin-top:12px"><label>Repita a senha</label><input type="password" id="s2" autocomplete="new-password"></div>' +
        '<div class="hint" style="margin-top:12px">Guarde bem: <b>não há recuperação</b>. Sem a senha, o pacote não abre — nem por mim, nem por ninguém.</div>',
        function (o) {
          var a = $('#s1', o).value, b = $('#s2', o).value;
          if (!a || a.length < 8) { toast('Use pelo menos 8 caracteres.', 'err'); return false; }
          if (a !== b) { toast('As senhas não conferem.', 'err'); return false; }
          Cripto.fechar(db, a).then(function (pac) {
            baixar('window.__SEED_ENC__=' + JSON.stringify(pac) + ';\n', 'seed.enc.js', 'application/javascript');
            toast('Pacote gerado — substitua data/seed.enc.js no repositório');
            S.log('Gerou novo pacote protegido');
          });
        }, 'Gerar');
    };
    $('#d-zap').onclick = function () {
      confirmar('Apagar TODOS os dados deste navegador? Faça um backup antes.', function () {
        S.apagarTudo().then(function () { location.reload(); });
      });
    };
  }
  function linhaInfo(l, v) {
    return '<tr><td style="color:var(--ink-3)">' + h(l) + '</td><td class="r num">' + h(v) + '</td></tr>';
  }

  /* ------------------------------------------------------ painel da nuvem */
  function blocoSync() {
    var s = Sync.estado;
    var semServidor = (s === 'sem-servidor');
    var cab = '<h3>☁︎ Sincronização na nuvem</h3>';
    if (semServidor) {
      return cab + '<div class="alert"><span class="ic">☁︎</span><div>Esta cópia está rodando <b>sem servidor</b> — os dados ficam só neste aparelho. ' +
        'A versão publicada na Netlify tem o servidor ligado: abrindo o link com sua senha, os lançamentos aparecem em qualquer aparelho.</div></div>';
    }
    var linha = s === 'sincronizado'
      ? '<div class="alert info"><span class="ic">✓</span><div>Tudo gravado no servidor' +
      (Sync.ultimo ? ' · última gravação <b>' + new Date(Sync.ultimo).toLocaleString('pt-BR') + '</b>' : '') +
      (Sync.rev ? ' · versão <b>' + Sync.rev + '</b>' : '') +
      '<br><span style="opacity:.8">Abra o mesmo link em qualquer aparelho e informe a senha: os dados vêm junto.</span></div></div>'
      : s === 'conflito'
        ? '<div class="alert crit"><span class="ic">⚠</span><div><b>Conflito.</b> Outro aparelho gravou depois desta cópia. ' +
        'Use <b>Puxar do servidor</b> para adotar a versão de lá, ou <b>Enviar mesmo assim</b> para sobrescrever com o que está aqui.</div></div>'
        : s === 'offline'
          ? '<div class="alert"><span class="ic">⚠</span><div>Sem conexão com o servidor. Os lançamentos estão salvos neste aparelho e sobem sozinhos quando a internet voltar.' +
          (Sync.erro ? '<br><span style="opacity:.75">' + h(Sync.erro) + '</span>' : '') + '</div></div>'
          : '<div class="alert info"><span class="ic">☁︎</span><div>Conectando ao servidor…</div></div>';

    return cab + linha +
      '<div class="inline" style="margin-top:14px">' +
      '<button class="btn" id="sy-pull">↓ Puxar do servidor</button>' +
      '<button class="btn" id="sy-push">↑ Enviar deste aparelho</button>' +
      (s === 'conflito' ? '<button class="btn dgr" id="sy-force">Enviar mesmo assim</button>' : '') +
      '</div>' +
      '<div class="hint">O que sobe para o servidor vai <b>criptografado</b> com a sua senha. A Netlify guarda um arquivo embaralhado — quem tiver acesso ao servidor não lê nada.</div>';
  }
  function ligarBotoesSync() {
    var pull = $('#sy-pull'), push = $('#sy-push'), force = $('#sy-force');
    if (pull) pull.onclick = function () {
      Sync.puxar().then(function (r) {
        if (r && r.db) { S.adotar(r.db, 'servidor'); db = S.db; render(); toast('Base do servidor carregada'); }
        else if (r && r.vazio) toast('O servidor ainda não tem nada gravado.', 'err');
        else toast('Não consegui falar com o servidor.', 'err');
      });
    };
    if (push) push.onclick = function () {
      Sync.empurrar(db).then(function (ok) { toast(ok ? 'Enviado ao servidor' : 'Não foi possível enviar', ok ? 'ok' : 'err'); render(); });
    };
    if (force) force.onclick = function () {
      confirmar('Sobrescrever o que está no servidor com os dados deste aparelho?', function () {
        Sync.empurrar(db, true).then(function (ok) { toast(ok ? 'Servidor sobrescrito' : 'Falhou', ok ? 'ok' : 'err'); render(); });
      });
    };
  }

  /* ------------------------------------------------------------- exportação */
  function baixar(txt, nome, mime) {
    var b = new Blob([txt], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function baixarCSV(linhas, nome) {
    var csv = '﻿' + linhas.map(function (r) {
      return r.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        if (typeof c === 'number') s = c.toFixed(2).replace('.', ',');
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
    baixar(csv, nome, 'text/csv');
  }
  function exportarCSV(lst, nome) {
    var out = [['Data', 'Descricao', 'Categoria', 'Entrada', 'Saida']];
    lst.forEach(function (l) { out.push([l.data, l.desc, l.cat, l.valor > 0 ? l.valor : '', l.valor < 0 ? -l.valor : '']); });
    baixarCSV(out, nome);
    toast('CSV gerado');
  }

  /* ------------------------------------------------------------------ boot */
  /* --------------------------------------------------- tela de desbloqueio */
  function telaDestravar() {
    var semCripto = !global.Cripto || !Cripto.disponivel();
    document.getElementById('app').innerHTML =
      '<div style="min-height:100vh;display:grid;place-items:center;padding:22px">' +
      '<div class="card" style="width:min(430px,100%);padding:28px">' +
      '<div style="display:flex;gap:12px;align-items:center;margin-bottom:18px">' +
      '<div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(145deg,#a586f5,#4a2f8f);display:grid;place-items:center;color:#14071f;font-weight:700">SF</div>' +
      '<div><b style="font-size:15px">Controle Financeiro</b><div style="font-size:11.5px;color:var(--ink-3);letter-spacing:.06em;text-transform:uppercase">Base protegida</div></div></div>' +
      (semCripto
        ? '<div class="alert crit"><span class="ic">⚠</span><div>Este navegador não permite descriptografar em <b>file://</b>. Abra o site pelo endereço https, ou use o botão abaixo para carregar seu backup JSON.</div></div>'
        : '<p style="font-size:13.5px;color:var(--ink-2);margin-bottom:16px">Seus dados estão criptografados neste arquivo. Informe a senha para abrir — ela fica só no seu aparelho.</p>' +
        '<div class="fld"><label>Senha</label><input type="password" id="u-senha" autocomplete="current-password" placeholder="••••••••"></div>' +
        '<div id="u-erro" style="color:#f0b3b3;font-size:12.5px;margin-top:9px;display:none"></div>' +
        '<button class="btn pri" id="u-ok" style="width:100%;justify-content:center;margin-top:16px">Destravar</button>') +
      '<div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--stroke-soft)">' +
      '<button class="btn" id="u-imp" style="width:100%;justify-content:center">Carregar backup JSON</button>' +
      '<input type="file" id="u-file" accept=".json,application/json" style="display:none">' +
      '</div></div></div>';

    var erro = function (m) { var e = $('#u-erro'); if (e) { e.textContent = m; e.style.display = 'block'; } else toast(m, 'err'); };

    if (!semCripto) {
      var tentar = function () {
        var s = $('#u-senha').value;
        if (!s) return erro('Digite a senha.');
        $('#u-ok').disabled = true; $('#u-ok').textContent = 'Abrindo…';

        /* 1) deriva chave e credencial · 2) tenta o servidor · 3) cai na base do arquivo */
        Promise.all([Cripto.derivarChaveSync(s), Cripto.tokenAuth(s)])
          .then(function (r) { return S.guardarCredenciais(r[0], r[1]); })
          .then(function () { $('#u-ok').textContent = 'Buscando no servidor…'; return Sync.puxar(); })
          .then(function (remoto) {
            if (remoto && remoto.db) {                       // servidor tem a base mais recente
              S.adotar(remoto.db, 'servidor');
              return { origem: 'servidor' };
            }
            return Cripto.abrir(global.__SEED_ENC__, s).then(function (obj) {
              S.adotar(obj, 'semente');
              if (Sync.disponivel) Sync.empurrar(S.db, true);  // publica a base inicial
              return { origem: 'arquivo' };
            });
          })
          .then(function (r) {
            db = S.db;
            continuarBoot();
            if (r.origem === 'servidor') toast('Dados carregados do servidor');
          })
          .catch(function (e) {
            S.limparCredenciais();
            $('#u-ok').disabled = false; $('#u-ok').textContent = 'Destravar';
            erro(e.message || 'Não foi possível abrir.');
            $('#u-senha').select();
          });
      };
      $('#u-ok').onclick = tentar;
      $('#u-senha').onkeydown = function (e) { if (e.key === 'Enter') tentar(); };
      $('#u-senha').focus();
    }
    $('#u-imp').onclick = function () { $('#u-file').click(); };
    $('#u-file').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = JSON.parse(fr.result);
          S.adotar(o && o.db ? o.db : o, 'backup');
          db = S.db; continuarBoot();
        } catch (e) { erro('Arquivo inválido.'); }
      };
      fr.readAsText(f);
    };
  }

  function continuarBoot() {
    db = S.db;
    var hojeMes = E.mesDeHoje();
    if (hojeMes > db.meta.mesRef && hojeMes <= db.meta.ultimoMes && db.meta.autoRef !== false) {
      db.meta.mesRef = hojeMes;
      S.log('Mês de referência avançado automaticamente para ' + hojeMes);
    }
    E.aplicarRecorrentes(db);
    S.on(render);
    window.addEventListener('hashchange', render);
    render();
    S.persist(false);
  }

  function boot() {
    S.init().then(function (base) {
      if (!base) return telaDestravar();
      continuarBoot();
      /* aparelho já conhecido: puxa o que outros aparelhos gravaram */
      if (S.chave && S.token) {
        Sync.puxar().then(function (remoto) {
          if (!remoto || !remoto.db) return;
          var localQtd = db.lancamentos.length, remotoQtd = remoto.db.lancamentos.length;
          var localMod = db.meta.modificadoEm || '', remotoMod = remoto.db.meta.modificadoEm || '';
          if (remotoMod > localMod) {
            S.adotar(remoto.db, 'servidor');
            db = S.db; render();
            toast('Atualizado com o servidor (' + remotoQtd + ' lançamentos)');
          } else if (localMod > remotoMod) {
            Sync.empurrar(db);
          }
        });
      }
    }).catch(function (e) {
      console.error(e);
      document.getElementById('app').innerHTML =
        '<div style="padding:40px;max-width:640px;margin:0 auto"><h1>Não foi possível carregar</h1><p style="color:#bab0cc;margin-top:12px">' + h(e.message) + '</p></div>';
    });
  }

  global.App = { render: render, toast: toast, boot: boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
