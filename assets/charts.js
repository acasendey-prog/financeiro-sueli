/* ============================================================================
   charts.js — gráficos SVG sem dependências externas
   Marcas finas, grade discreta, rótulos seletivos, tooltip em todos os gráficos.
   ========================================================================== */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var tip;

  function el(n, a) {
    var e = document.createElementNS(NS, n);
    for (var k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
    return e;
  }
  function getTip() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(html, ev) {
    var t = getTip(); t.innerHTML = html; t.style.opacity = '1';
    var r = t.getBoundingClientRect();
    var x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.opacity = '0'; }

  /** escala "bonita" para o eixo Y */
  function nice(max, min) {
    min = min || 0;
    if (max === min) max = min + 1;
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (span / (step * m) <= 5.2) { step = step * m; return true; } return false; });
    return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step: step };
  }
  function money(v) { return global.Engine.brl(v); }
  function curto(v) { return global.Engine.brlCurto(v); }

  function mount(host, w, h) {
    host.innerHTML = '';
    var svg = el('svg', { class: 'chart', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h });
    host.appendChild(svg);
    svg.addEventListener('mouseleave', hideTip);
    return svg;
  }
  function autoRender(host, fn) {
    var run = function () {
      var w = host.clientWidth || 640;
      if (w < 80) return;
      fn(w);
    };
    run();
    if (global.ResizeObserver && !host._ro) {
      host._ro = new ResizeObserver(function () { clearTimeout(host._rt); host._rt = setTimeout(run, 90); });
      host._ro.observe(host);
    }
    host._redraw = run;
  }

  var C = {};

  /* ------------------------------------------- linha / área (série temporal) */
  C.linha = function (host, o) {
    autoRender(host, function (w) {
      var h = o.altura || 250, pad = { t: 14, r: 16, b: 26, l: 58 };
      var svg = mount(host, w, h);
      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      var all = [];
      o.series.forEach(function (s) { s.dados.forEach(function (v) { if (v !== null) all.push(v); }); });
      var sc = nice(Math.max.apply(null, all), Math.min(0, Math.min.apply(null, all)));
      var X = function (i) { return pad.l + (o.labels.length <= 1 ? iw / 2 : i * iw / (o.labels.length - 1)); };
      var Y = function (v) { return pad.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };

      for (var g = sc.lo; g <= sc.hi + 1e-6; g += sc.step) {
        svg.appendChild(el('line', { class: 'grid-l', x1: pad.l, x2: w - pad.r, y1: Y(g), y2: Y(g) }));
        var tx = el('text', { class: 'ax', x: pad.l - 8, y: Y(g) + 3.5, 'text-anchor': 'end' });
        tx.textContent = curto(g); svg.appendChild(tx);
      }
      if (sc.lo < 0) svg.appendChild(el('line', { x1: pad.l, x2: w - pad.r, y1: Y(0), y2: Y(0), stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1 }));

      var passo = Math.max(1, Math.ceil(o.labels.length / Math.floor(iw / 52)));
      o.labels.forEach(function (l, i) {
        if (i % passo && i !== o.labels.length - 1) return;
        var t = el('text', { class: 'ax', x: X(i), y: h - 8, 'text-anchor': 'middle' });
        t.textContent = l; svg.appendChild(t);
      });

      o.series.forEach(function (s, si) {
        var d = '', a = '';
        s.dados.forEach(function (v, i) { if (v === null) return; d += (d ? 'L' : 'M') + X(i) + ' ' + Y(v); });
        if (o.area && si === 0) {
          a = d + 'L' + X(s.dados.length - 1) + ' ' + Y(sc.lo) + 'L' + X(0) + ' ' + Y(sc.lo) + 'Z';
          var gid = 'ga' + Math.random().toString(36).slice(2, 7);
          var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          lg.appendChild(el('stop', { offset: '0%', 'stop-color': s.cor, 'stop-opacity': .30 }));
          lg.appendChild(el('stop', { offset: '100%', 'stop-color': s.cor, 'stop-opacity': .02 }));
          svg.appendChild(lg);
          svg.appendChild(el('path', { d: a, fill: 'url(#' + gid + ')' }));
        }
        svg.appendChild(el('path', {
          d: d, fill: 'none', stroke: s.cor, 'stroke-width': s.espessura || 2,
          'stroke-dasharray': s.tracejado || null,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
      });

      /* rótulos de dados — só nas séries marcadas, espaçados para não colidir */
      if (o.rotulos) {
        var passoR = Math.max(1, Math.ceil(o.labels.length / Math.max(2, Math.floor(iw / 74))));
        o.series.forEach(function (s) {
          if (s.rotular === false) return;
          var ocupados = [];
          s.dados.forEach(function (v, i) {
            if (v === null || v === undefined) return;
            if (i % passoR && i !== o.labels.length - 1) return;
            var x = X(i), y = Y(v) - 9;
            // desvia para baixo se já houver rótulo muito perto neste ponto
            var colide = ocupados.some(function (p) { return Math.abs(p.x - x) < 46 && Math.abs(p.y - y) < 12; });
            if (colide) y = Y(v) + 15;
            ocupados.push({ x: x, y: y });
            var anchor = i === 0 ? 'start' : (i === o.labels.length - 1 ? 'end' : 'middle');
            var halo = el('text', { class: 'lbl-halo', x: x, y: y, 'text-anchor': anchor });
            halo.textContent = curto(v);
            svg.appendChild(halo);
            var t = el('text', { class: 'lbl-pt', x: x, y: y, 'text-anchor': anchor, fill: s.cor });
            t.textContent = curto(v);
            svg.appendChild(t);
          });
        });
      }

      /* camada de hover: faixa por ponto + crosshair */
      var cross = el('line', { y1: pad.t, y2: pad.t + ih, stroke: 'rgba(255,255,255,.26)', 'stroke-width': 1, opacity: 0 });
      svg.appendChild(cross);
      var marks = o.series.map(function (s) {
        var c = el('circle', { r: 4.5, fill: s.cor, stroke: 'var(--bg-base)', 'stroke-width': 2, opacity: 0 });
        svg.appendChild(c); return c;
      });
      o.labels.forEach(function (lb, i) {
        var bw = iw / Math.max(1, o.labels.length - 1);
        var rct = el('rect', { x: X(i) - bw / 2, y: pad.t, width: bw, height: ih, fill: 'transparent' });
        rct.style.cursor = 'crosshair';
        rct.addEventListener('mousemove', function (ev) {
          cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
          var html = '<b>' + (o.titulos ? o.titulos[i] : lb) + '</b>';
          o.series.forEach(function (s, k) {
            var v = s.dados[i];
            marks[k].setAttribute('cx', X(i)); marks[k].setAttribute('cy', Y(v || 0));
            marks[k].setAttribute('opacity', v === null ? 0 : 1);
            html += '<div class="row"><span><i style="background:' + s.cor + '"></i>' + s.nome + '</span><span class="num">' + money(v) + '</span></div>';
          });
          showTip(html, ev);
        });
        rct.addEventListener('mouseleave', function () {
          cross.setAttribute('opacity', 0); marks.forEach(function (m) { m.setAttribute('opacity', 0); });
        });
        svg.appendChild(rct);
      });
    });
  };

  /* ---------------------------------------------------- barras verticais */
  C.barras = function (host, o) {
    autoRender(host, function (w) {
      var h = o.altura || 250, pad = { t: 14, r: 16, b: 28, l: 58 };
      var svg = mount(host, w, h);
      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      var vals = [];
      o.series.forEach(function (s) { s.dados.forEach(function (v) { vals.push(v); }); });
      var sc = nice(Math.max.apply(null, vals), Math.min(0, Math.min.apply(null, vals)));
      var Y = function (v) { return pad.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
      var n = o.labels.length, gw = iw / n, ns = o.series.length;
      var bw = Math.max(3, (gw - 8) / ns - 2);

      for (var g = sc.lo; g <= sc.hi + 1e-6; g += sc.step) {
        svg.appendChild(el('line', { class: 'grid-l', x1: pad.l, x2: w - pad.r, y1: Y(g), y2: Y(g) }));
        var tx = el('text', { class: 'ax', x: pad.l - 8, y: Y(g) + 3.5, 'text-anchor': 'end' });
        tx.textContent = curto(g); svg.appendChild(tx);
      }
      var passo = Math.max(1, Math.ceil(n / Math.floor(iw / 48)));
      o.labels.forEach(function (lb, i) {
        if (i % passo) return;
        var t = el('text', { class: 'ax', x: pad.l + gw * (i + .5), y: h - 9, 'text-anchor': 'middle' });
        t.textContent = lb; svg.appendChild(t);
      });

      o.labels.forEach(function (lb, i) {
        var x0 = pad.l + gw * i + 4;
        o.series.forEach(function (s, k) {
          var v = s.dados[i], y = Y(Math.max(0, v)), y0 = Y(0);
          var hh = Math.abs(y0 - y);
          var r = el('rect', {
            x: x0 + k * (bw + 2), y: v >= 0 ? y : y0, width: bw,
            height: Math.max(1.5, hh), rx: Math.min(4, bw / 2), fill: s.cor, opacity: .92
          });
          r.style.cursor = 'pointer';
          r.addEventListener('mousemove', function (ev) {
            r.setAttribute('opacity', 1);
            var html = '<b>' + (o.titulos ? o.titulos[i] : lb) + '</b>';
            o.series.forEach(function (ss) {
              html += '<div class="row"><span><i style="background:' + ss.cor + '"></i>' + ss.nome + '</span><span class="num">' + money(ss.dados[i]) + '</span></div>';
            });
            showTip(html, ev);
          });
          r.addEventListener('mouseleave', function () { r.setAttribute('opacity', .92); hideTip(); });
          svg.appendChild(r);
        });
      });
      svg.appendChild(el('line', { x1: pad.l, x2: w - pad.r, y1: Y(0), y2: Y(0), stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1 }));
    });
  };

  /* ------------------------------------------ barras horizontais (ranking) */
  C.ranking = function (host, o) {
    autoRender(host, function (w) {
      var itens = o.itens.slice(0, o.max || 10);
      var rowH = 27, h = itens.length * rowH + 14;
      var svg = mount(host, w, h);
      var labW = Math.min(190, Math.max(96, w * .34)), valW = 96;
      var bw = Math.max(40, w - labW - valW - 10);
      var max = Math.max.apply(null, itens.map(function (x) { return x.valor; })) || 1;

      itens.forEach(function (it, i) {
        var y = i * rowH + 6;
        var t = el('text', { class: 'ax', x: labW - 10, y: y + 13, 'text-anchor': 'end', fill: 'var(--ink-2)' });
        t.textContent = it.cat.length > 24 ? it.cat.slice(0, 23) + '…' : it.cat;
        svg.appendChild(t);
        svg.appendChild(el('rect', { x: labW, y: y + 4, width: bw, height: 13, rx: 4, fill: 'rgba(255,255,255,.05)' }));
        var lw = Math.max(3, it.valor / max * bw);
        var r = el('rect', { x: labW, y: y + 4, width: lw, height: 13, rx: 4, fill: o.cor || 'var(--s1)', opacity: .9 });
        r.style.cursor = 'pointer';
        r.addEventListener('mousemove', function (ev) {
          showTip('<b>' + it.cat + '</b><div class="row"><span>' + (o.nome || 'Valor') + '</span><span class="num">' + money(it.valor) + '</span></div>' +
            '<div class="row"><span>Participação</span><span class="num">' + (it.valor / (o.total || max) * 100).toFixed(1).replace('.', ',') + '%</span></div>', ev);
        });
        r.addEventListener('mouseleave', hideTip);
        svg.appendChild(r);
        var v = el('text', { class: 'lbl', x: w - 2, y: y + 14, 'text-anchor': 'end' });
        v.textContent = money(it.valor); svg.appendChild(v);
      });
    });
  };

  /* --------------------------------------------------- barras empilhadas */
  C.empilhado = function (host, o) {
    autoRender(host, function (w) {
      var h = o.altura || 250, pad = { t: 14, r: 16, b: 28, l: 58 };
      var svg = mount(host, w, h);
      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      var tot = o.labels.map(function (_, i) {
        return o.series.reduce(function (a, s) { return a + Math.max(0, s.dados[i]); }, 0);
      });
      var sc = nice(Math.max.apply(null, tot), 0);
      var Y = function (v) { return pad.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
      var n = o.labels.length, gw = iw / n, bw = Math.max(4, gw - 9);

      for (var g = sc.lo; g <= sc.hi + 1e-6; g += sc.step) {
        svg.appendChild(el('line', { class: 'grid-l', x1: pad.l, x2: w - pad.r, y1: Y(g), y2: Y(g) }));
        var tx = el('text', { class: 'ax', x: pad.l - 8, y: Y(g) + 3.5, 'text-anchor': 'end' });
        tx.textContent = curto(g); svg.appendChild(tx);
      }
      var passo = Math.max(1, Math.ceil(n / Math.floor(iw / 48)));
      o.labels.forEach(function (lb, i) {
        if (i % passo) return;
        var t = el('text', { class: 'ax', x: pad.l + gw * (i + .5), y: h - 9, 'text-anchor': 'middle' });
        t.textContent = lb; svg.appendChild(t);
      });

      o.labels.forEach(function (lb, i) {
        var acc = 0, x = pad.l + gw * i + (gw - bw) / 2;
        o.series.forEach(function (s, k) {
          var v = Math.max(0, s.dados[i]); if (v <= 0) { return; }
          var y1 = Y(acc + v), y0 = Y(acc);
          var alt = Math.max(1.5, y0 - y1 - (k > 0 ? 2 : 0));
          var r = el('rect', { x: x, y: y1, width: bw, height: alt, rx: k === o.series.length - 1 ? 4 : 2, fill: s.cor, opacity: .93 });
          r.style.cursor = 'pointer';
          r.addEventListener('mousemove', function (ev) {
            var html = '<b>' + (o.titulos ? o.titulos[i] : lb) + '</b>';
            o.series.forEach(function (ss) {
              html += '<div class="row"><span><i style="background:' + ss.cor + '"></i>' + ss.nome + '</span><span class="num">' + money(ss.dados[i]) + '</span></div>';
            });
            html += '<div class="row" style="border-top:1px solid rgba(255,255,255,.14);margin-top:4px;padding-top:4px"><span>Total</span><span class="num">' + money(tot[i]) + '</span></div>';
            showTip(html, ev);
          });
          r.addEventListener('mouseleave', hideTip);
          svg.appendChild(r);
          acc += v;
        });
      });
    });
  };

  C.legenda = function (series) {
    return '<div class="leg">' + series.map(function (s) {
      return '<span><i style="background:' + s.cor + '"></i>' + s.nome + '</span>';
    }).join('') + '</div>';
  };

  global.Charts = C;
})(window);
