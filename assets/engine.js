/* ============================================================================
   engine.js — motor de cálculo
   Tudo aqui é derivado dos dados brutos. Nada de saldo digitado à mão:
   qualquer lançamento novo recalcula a cascata inteira dos 25+ meses.
   ========================================================================== */
(function (global) {
  'use strict';

  var MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
    'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  var E = {};

  /* --------------------------------------------------------- formatadores */
  E.brl = function (v, sinal) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var n = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var s = v < 0 ? '−' : (sinal && v > 0 ? '+' : '');
    return s + 'R$ ' + n;
  };
  E.brlCurto = function (v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1000000) return s + (a / 1000000).toFixed(1).replace('.', ',') + ' mi';
    if (a >= 1000) return s + (a / 1000).toFixed(1).replace('.', ',') + ' mil';
    return s + a.toFixed(0);
  };
  E.pct = function (v) { return (v * 100).toFixed(1).replace('.', ',') + '%'; };
  E.mesLabel = function (m) { var p = m.split('-'); return MESES_CURTO[+p[1] - 1] + '/' + p[0].slice(2); };
  E.mesLabelLongo = function (m) { var p = m.split('-'); return MESES_LONGO[+p[1] - 1] + ' de ' + p[0]; };
  E.dataLabel = function (d) { var p = d.split('-'); return p[2] + '/' + p[1]; };
  E.hoje = function () { var d = new Date(); return d.toISOString().slice(0, 10); };
  E.mesDeHoje = function () { return E.hoje().slice(0, 7); };

  /* --------------------------------------------------------------- meses */
  E.addMes = function (m, k) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    return y + '-' + String(mo + 1).padStart(2, '0');
  };
  E.diffMes = function (a, b) {
    return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  };
  E.meses = function (db) {
    var a = db.meta.primeiroMes, z = db.meta.ultimoMes, out = [], c = a, guard = 0;
    while (c <= z && guard++ < 600) { out.push(c); c = E.addMes(c, 1); }
    return out;
  };
  E.diasNoMes = function (m) { return new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); };

  /* -------------------------------------------------------- lançamentos */
  E.doMes = function (db, m) {
    return db.lancamentos.filter(function (l) { return l.data.slice(0, 7) === m; })
      .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  };
  E.resumoMes = function (db, m) {
    var e = 0, s = 0;
    db.lancamentos.forEach(function (l) {
      if (l.data.slice(0, 7) !== m) return;
      if (l.valor > 0) e += l.valor; else s -= l.valor;
    });
    return { entradas: r2(e), saidas: r2(s), resultado: r2(e - s) };
  };

  /** cascata de saldos — a espinha dorsal do sistema */
  E.cascata = function (db) {
    var ms = E.meses(db), saldo = db.meta.saldoInicial, out = [];
    ms.forEach(function (m) {
      var r = E.resumoMes(db, m);
      var ini = saldo, fim = r2(saldo + r.resultado);
      saldo = fim;
      out.push({
        mes: m, saldoInicial: ini, entradas: r.entradas, saidas: r.saidas,
        resultado: r.resultado, saldoFinal: fim,
        status: E.statusMes(db, m)
      });
    });
    return out;
  };
  E.statusMes = function (db, m) {
    if (m < db.meta.primeiroMes) return 'base';
    if (m === db.meta.mesBase) return 'base';
    return m <= db.meta.mesRef ? 'realizado' : 'projecao';
  };
  E.saldoAte = function (db, m) {
    var c = E.cascata(db);
    for (var i = 0; i < c.length; i++) if (c[i].mes === m) return c[i].saldoFinal;
    return db.meta.saldoInicial;
  };

  /* -------------------------------------------------- categorias / relatórios */
  E.todasCategorias = function (db) {
    return db.categorias.receita.concat(db.categorias.despesa);
  };
  E.classeDe = function (db, cat) {
    return db.categorias.receita.indexOf(cat) >= 0 ? 'receita'
      : db.categorias.despesa.indexOf(cat) >= 0 ? 'despesa' : 'sem';
  };
  /** matriz categoria × mês */
  E.consolidado = function (db, classe, meses) {
    var cats = classe === 'receita' ? db.categorias.receita : db.categorias.despesa;
    var mp = {}, semCat = {};
    cats.forEach(function (c) { mp[c] = {}; meses.forEach(function (m) { mp[c][m] = 0; }); });
    db.lancamentos.forEach(function (l) {
      var m = l.data.slice(0, 7);
      if (meses.indexOf(m) < 0) return;
      var ehRec = l.valor > 0;
      if ((classe === 'receita') !== ehRec) return;
      var c = l.cat || '(sem categoria)';
      if (!mp[c]) { mp[c] = {}; meses.forEach(function (x) { mp[c][x] = 0; }); semCat[c] = true; }
      mp[c][m] = r2(mp[c][m] + Math.abs(l.valor));
    });
    return Object.keys(mp).map(function (c) {
      var linha = meses.map(function (m) { return mp[c][m] || 0; });
      return { cat: c, valores: linha, total: r2(linha.reduce(function (a, b) { return a + b; }, 0)), orfa: !!semCat[c] };
    }).sort(function (a, b) { return b.total - a.total; });
  };

  E.porCategoriaPeriodo = function (db, classe, de, ate) {
    var acc = {};
    db.lancamentos.forEach(function (l) {
      var m = l.data.slice(0, 7);
      if (m < de || m > ate) return;
      if ((classe === 'receita') !== (l.valor > 0)) return;
      var c = l.cat || '(sem categoria)';
      acc[c] = r2((acc[c] || 0) + Math.abs(l.valor));
    });
    return Object.keys(acc).map(function (c) { return { cat: c, valor: acc[c] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
  };

  /* ------------------------------------------------------- parcelamentos */
  E.parcelaNoMes = function (p, m) {
    var k = E.diffMes(p.mes1, m);
    if (k < 0 || k >= p.n) return null;
    return { parcela: k + 1, de: p.n, valor: p.valor };
  };
  E.parcelasDoMes = function (db, m, cartao) {
    var out = [];
    db.parcelamentos.forEach(function (p) {
      if (cartao && p.cartao !== cartao) return;
      var x = E.parcelaNoMes(p, m);
      if (x) out.push({ id: p.id, cartao: p.cartao, fornecedor: p.fornecedor, parcela: x.parcela, de: x.de, valor: x.valor });
    });
    return out;
  };
  E.totalParcelado = function (db, m, cartao) {
    return r2(E.parcelasDoMes(db, m, cartao).reduce(function (a, b) { return a + b.valor; }, 0));
  };
  /** fatura efetivamente paga = lançamentos na categoria do cartão */
  E.catDoCartao = function (cartao) { return cartao === 'Carrefour' ? 'CC Carrefour' : 'CC Itaú'; };
  E.faturaPaga = function (db, m, cartao) {
    var cat = E.catDoCartao(cartao), s = 0;
    db.lancamentos.forEach(function (l) {
      if (l.data.slice(0, 7) === m && l.cat === cat && l.valor < 0) s -= l.valor;
    });
    return r2(s);
  };
  E.cartaoMes = function (db, m, cartao) {
    var par = E.totalParcelado(db, m, cartao), fat = E.faturaPaga(db, m, cartao);
    return { parcelado: par, fatura: fat, aVista: r2(fat - par) };
  };
  E.cartoes = function (db) {
    var s = {};
    db.parcelamentos.forEach(function (p) { s[p.cartao] = 1; });
    s['Itaú'] = 1; s['Carrefour'] = 1;
    return Object.keys(s).sort();
  };
  /** situação de cada compromisso parcelado, relativa ao mês de referência */
  E.statusParcelamento = function (db, p) {
    var pagas = Math.max(0, Math.min(p.n, E.diffMes(p.mes1, db.meta.mesRef) + 1));
    var ultima = E.addMes(p.mes1, p.n - 1);
    var total = r2(p.n * p.valor);
    return {
      pagas: pagas, restantes: p.n - pagas, ultima: ultima, total: total,
      pago: r2(pagas * p.valor), falta: r2((p.n - pagas) * p.valor),
      status: pagas >= p.n ? 'quitado' : (pagas <= 0 ? 'a-iniciar' : 'andamento')
    };
  };

  /* ----------------------------------------------------------- empréstimos */
  /** taxa implícita (a.m.) por bisseção: PV = PMT · (1−(1+i)^−n)/i */
  E.taxaImplicita = function (pv, pmt, n) {
    if (!pv || !pmt || !n || pmt * n <= pv) return 0;
    var lo = 1e-9, hi = 1.5, i, f;
    for (var k = 0; k < 200; k++) {
      i = (lo + hi) / 2;
      f = pmt * (1 - Math.pow(1 + i, -n)) / i;
      if (f > pv) lo = i; else hi = i;
    }
    return (lo + hi) / 2;
  };
  E.valorPresente = function (pmt, i, n) {
    if (n <= 0) return 0;
    if (!i) return r2(pmt * n);
    return r2(pmt * (1 - Math.pow(1 + i, -n)) / i);
  };
  E.emprestimo = function (db, ep) {
    var i = E.taxaImplicita(ep.principal, ep.parcela, ep.n);
    var pagas = Math.max(0, Math.min(ep.n, E.diffMes(ep.mes1, db.meta.mesRef) + 1 + (ep.antecipadas || 0)));
    var restantes = ep.n - pagas;
    var pv = E.valorPresente(ep.parcela, i, restantes);
    return {
      taxaMes: i, taxaAno: Math.pow(1 + i, 12) - 1,
      totalContrato: r2(ep.parcela * ep.n),
      pagas: pagas, restantes: restantes,
      nominalRestante: r2(ep.parcela * restantes),
      quitarHoje: pv, economia: r2(ep.parcela * restantes - pv),
      ultima: E.addMes(ep.mes1, ep.n - 1),
      quitado: restantes <= 0
    };
  };
  E.saldoDevedorSerie = function (db) {
    var ms = E.meses(db);
    return ms.map(function (m) {
      var tot = 0, parcelaMes = 0;
      db.emprestimos.forEach(function (ep) {
        var i = E.taxaImplicita(ep.principal, ep.parcela, ep.n);
        var ant = ep.antecipadas || 0;
        var pagas = Math.max(0, Math.min(ep.n, E.diffMes(ep.mes1, m) + 1 + ant));
        var rest = ep.n - pagas;
        tot += (pagas <= 0) ? ep.principal : E.valorPresente(ep.parcela, i, rest);
        if (rest > 0 && m >= ep.mes1) parcelaMes += ep.parcela;
      });
      return { mes: m, saldo: r2(tot), parcela: r2(parcelaMes) };
    });
  };

  /* ----------------------------------------------------------------- metas */
  E.meta = function (db, mt) {
    var restam = Math.max(0, E.diffMes(db.meta.mesRef, mt.prazo));
    var falta = Math.max(0, r2(mt.alvo - mt.guardado));
    return {
      pct: mt.alvo > 0 ? Math.min(1, mt.guardado / mt.alvo) : 0,
      falta: falta, mesesRestantes: restam,
      aporte: restam > 0 ? r2(falta / restam) : falta,
      vencida: mt.alvo > 0 && restam <= 0 && falta > 0,
      concluida: mt.alvo > 0 && falta <= 0,
      semAlvo: !(mt.alvo > 0)
    };
  };

  /* ------------------------------------------------------------ recorrentes */
  /** materializa lançamentos recorrentes nos meses futuros que ainda não têm */
  E.aplicarRecorrentes = function (db) {
    var criados = 0, ms = E.meses(db);
    (db.recorrentes || []).forEach(function (r) {
      if (!r.ativo) return;
      ms.forEach(function (m) {
        if (m < r.inicio) return;
        if (r.fim && m > r.fim) return;
        if (m <= db.meta.mesRef && !r.retroativo) return;  // não mexe no realizado
        var dia = Math.min(r.dia || 1, E.diasNoMes(m));
        var data = m + '-' + String(dia).padStart(2, '0');
        var existe = db.lancamentos.some(function (l) { return l.rec === r.id && l.data.slice(0, 7) === m; });
        if (existe) return;
        db.lancamentos.push({
          id: (global.Store ? Store.novoId('r') : 'r' + Math.random()),
          data: data, desc: r.desc, cat: r.cat, valor: r.valor, conta: r.conta || 'Banco', rec: r.id
        });
        criados++;
      });
    });
    return criados;
  };

  /* ------------------------------------------------------------ diagnóstico */
  E.diagnostico = function (db) {
    var av = [];
    var casc = E.cascata(db);

    db.lancamentos.forEach(function (l) {
      if (!l.cat) av.push({ n: 'crit', t: 'Lançamento sem categoria', d: E.dataLabel(l.data) + ' · ' + l.desc + ' · ' + E.brl(l.valor) });
      else if (E.classeDe(db, l.cat) === 'sem') av.push({ n: 'warn', t: 'Categoria fora do cadastro', d: l.cat + ' — ' + E.dataLabel(l.data) + ' ' + l.desc });
      else if (E.classeDe(db, l.cat) === 'receita' && l.valor < 0) av.push({ n: 'warn', t: 'Saída com categoria de receita', d: E.dataLabel(l.data) + ' · ' + l.desc + ' · ' + l.cat });
      else if (E.classeDe(db, l.cat) === 'despesa' && l.valor > 0) av.push({ n: 'warn', t: 'Entrada com categoria de despesa', d: E.dataLabel(l.data) + ' · ' + l.desc + ' · ' + l.cat });
      if (l.valor === 0) av.push({ n: 'warn', t: 'Lançamento sem valor', d: E.dataLabel(l.data) + ' · ' + l.desc });
    });

    casc.forEach(function (c) {
      if (c.saldoFinal < 0) av.push({ n: 'crit', t: 'Saldo negativo no fim do mês', d: E.mesLabel(c.mes) + ' · ' + E.brl(c.saldoFinal) });
    });

    E.cartoes(db).forEach(function (cart) {
      E.meses(db).forEach(function (m) {
        if (m === db.meta.mesBase) return;
        var x = E.cartaoMes(db, m, cart);
        if (x.fatura > 0 && x.aVista < 0) {
          av.push({ n: 'warn', t: 'Fatura menor que o parcelado — ' + cart, d: E.mesLabel(m) + ' · fatura ' + E.brl(x.fatura) + ' vs parcelado ' + E.brl(x.parcelado) });
        }
        if (x.fatura === 0 && x.parcelado > 0 && m <= db.meta.mesRef) {
          av.push({ n: 'warn', t: 'Fatura não lançada — ' + cart, d: E.mesLabel(m) + ' · parcelado ' + E.brl(x.parcelado) });
        }
      });
    });

    var somaConsig = 0;
    db.emprestimos.forEach(function (ep) {
      var e = E.emprestimo(db, ep);
      if (!e.quitado) somaConsig += ep.parcela;
    });
    if (somaConsig > 0) {
      var temLanc = db.lancamentos.some(function (l) { return /consign/i.test(l.desc) && l.valor < 0; });
      if (!temLanc) av.push({
        n: 'info', t: 'Parcelas de consignado fora do fluxo',
        d: E.brl(somaConsig) + '/mês em consignado não aparece como saída — confirme se já vem descontado do salário líquido.'
      });
    }

    db.metas.forEach(function (mt) {
      var saldoRef = E.saldoAte(db, db.meta.mesRef);
      if (mt.guardado > saldoRef + 0.005) {
        av.push({ n: 'info', t: 'Meta sem lastro em conta', d: mt.nome + ': ' + E.brl(mt.guardado) + ' guardado, mas o saldo em ' + E.mesLabel(db.meta.mesRef) + ' é ' + E.brl(saldoRef) + '. Se está em aplicação separada, cadastre-a como conta.' });
      }
    });

    return av;
  };

  /* ----------------------------------------------------------------- util */
  function r2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
  E.r2 = r2;
  E.MESES_CURTO = MESES_CURTO;

  global.Engine = E;
})(window);
