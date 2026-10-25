/* Beacons (contribution visuals): lit beacons by blaze (intensity), event feed, kindling curve, test fire, layers */
(function () {
  'use strict';
  var CC = window.CC, S = CC.S, $ = CC.$, $$ = CC.$$, esc = CC.esc;
  CC.ready = init;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var V, model = {}, sel = 'altar', tests = [], clock = { T0: 2700, t0: Date.now(), speed: 6, paused: false, off: 0 }, feedFlt = 'all', lastN = -1, detached = false, bombAt = -1e9, raf = null;
  var KINDS = { bits: ['Bits', 'bolt'], sub: ['Sub', 'star'], gift: ['Gift subs', 'gift'], points: ['Points', 'coin'], hype_train: ['Hype Train', 'train'] };
  var COLS = 40, ROWS = 16;

  function simT() { return clock.T0 + clock.off + (clock.paused ? 0 : (Date.now() - clock.t0) / 1000 * clock.speed); }
  function freeze() { clock.off = simT() - clock.T0; clock.t0 = Date.now(); }

  /* ---------- model ---------- */
  function mkModel(v) {
    var m = { id: v.id, giftW: 1, halfLife: 0, sqrt: false, bounds: [], looks: [], pts: [], max: 100, dflt: null };
    if (v.id === 'altar') { m.halfLife = 300; m.sqrt = true; m.bounds = [500, 2500]; m.max = 10000; m.looks = v.ranges.map(function (r) { return r.look; }); m.ys = [.22, .6]; }
    else if (v.id === 'cam-frame') { m.sqrt = true; m.bounds = [5, 20]; m.max = 100; m.looks = v.ranges.map(function (r) { return r.look; }); m.ys = [.2, .6]; }
    else { m.bounds = [1, 3, 5]; m.max = 6; m.looks = ['calm'].concat(v.ranges.map(function (r) { return r.look; })); m.ys = [.22, .55, .88]; }
    m.pts = [[0, 0]].concat(m.bounds.map(function (b, i) { return [b, m.ys[i]]; })).concat([[m.max, 1]]);
    m.dflt = JSON.stringify({ pts: m.pts, halfLife: m.halfLife, giftW: 1 });
    return m;
  }
  function curveFn(pts) { // monotone cubic (Fritsch-Carlson)
    var n = pts.length, dx = [], dy = [], s = [], t = [], i;
    for (i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-9; dy[i] = pts[i + 1][1] - pts[i][1]; s[i] = dy[i] / dx[i]; }
    t[0] = s[0]; t[n - 1] = s[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (i = 0; i < n - 1; i++) { if (s[i] === 0) { t[i] = 0; t[i + 1] = 0; } else { var a = t[i] / s[i], b = t[i + 1] / s[i], h = a * a + b * b; if (h > 9) { var k = 3 / Math.sqrt(h); t[i] = k * a * s[i]; t[i + 1] = k * b * s[i]; } } }
    return function (x) {
      if (x <= pts[0][0]) return pts[0][1]; if (x >= pts[n - 1][0]) return pts[n - 1][1];
      var j = 0; while (j < n - 2 && x > pts[j + 1][0]) j++;
      var h = dx[j], u = (x - pts[j][0]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * pts[j][1] + (u3 - 2 * u2 + u) * h * t[j] + (-2 * u3 + 3 * u2) * pts[j + 1][1] + (u3 - u2) * h * t[j + 1];
    };
  }
  function weightOf(v, kind) { var m = model[v.id]; if (kind === 'gift') return (v.id === 'altar' ? 100 : 1) * m.giftW; return 1; }
  function valueOf(v, T, withTests) {
    var m = model[v.id], evs = S.contributions.concat(withTests ? tests : []), sum = 0, lvl = 0;
    evs.forEach(function (c) {
      if (c.t > T) return;
      if (v.id === 'hype-border') { if (c.kind === 'hype_train' && T - c.t <= 600) lvl = Math.max(lvl, c.amount); return; }
      if (v.inputs.indexOf(c.kind) < 0) return;
      var dec = m.halfLife ? Math.pow(.5, (T - c.t) / m.halfLife) : 1; sum += c.amount * weightOf(v, c.kind) * dec;
    });
    return v.id === 'hype-border' ? lvl : sum;
  }
  function blazeOf(v, val) { var m = model[v.id], f = curveFn(m.pts); return Math.max(0, Math.min(1, f(Math.min(val, m.max)))); }
  function stageOf(v, val) { var m = model[v.id], k = 0; m.bounds.forEach(function (b, i) { if (val >= b) k = i + 1; }); return { k: k, look: m.looks[k] || m.looks[m.looks.length - 1] }; }
  function vis(id) { return V.filter(function (v) { return v.id === id; })[0]; }
  function nm(n) { return n >= 1000 ? CC.fmt.n(Math.round(n)) : (Math.round(n * 10) / 10).toString(); }

  /* ---------- hero beacons (halftone blaze) ---------- */
  function buildBeacons() {
    var h = '';
    V.forEach(function (v) {
      var m = model[v.id], dots = '';
      var dc = v.id === 'altar' ? 'var(--or)' : v.id === 'cam-frame' ? 'var(--or)' : 'var(--gules)';
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var x = 4.5 + c * 9, y = 5 + r * 9.2;
        dots += '<circle data-c="' + c + '" data-r="' + r + '" cx="' + x + '" cy="' + y + '" r="0" fill="' + dc + '"/>';
        if (v.id === 'altar') dots += '<circle class="b" data-c="' + c + '" data-r="' + r + '" cx="' + (x + 1.6) + '" cy="' + (y + 1.4) + '" r="0" fill="var(--gules)"/>';
      }
      h += '<button class="pl" role="radio" aria-checked="' + (v.id === sel) + '" aria-pressed="' + (v.id === sel) + '" data-id="' + v.id + '" style="--dc:' + dc + '"><div class="hd"><b>' + esc(v.name) + '</b><span class="chip dash">' + esc(v.kind) + '</span></div>' +
        '<svg class="cov" viewBox="0 0 364 150" preserveAspectRatio="none" aria-hidden="true"><g style="mix-blend-mode:var(--blend)">' + dots + '</g><rect x="1" y="1" width="362" height="148" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3" opacity=".5"/></svg>' +
        '<div class="stg" data-t="">—</div><div class="val"><b class="num">0</b><span></span></div><div class="rng"></div><div class="rl"></div>' +
        '<div class="ft"><span>Inputs</span>' + v.inputs.map(function (i) { return '<span class="chip ' + (i === 'bits' ? 'or' : i === 'sub' ? 'azure' : i === 'gift' ? 'gules' : 'dash') + '">' + (KINDS[i] ? KINDS[i][0] : i) + '</span>'; }).join('') + '<span style="margin-left:auto" class="chip dash">' + esc(v.decay || 'no decay') + '</span></div></button>';
    });
    $('#plates').innerHTML = h;
    $$('#plates .pl').forEach(function (b) { b.addEventListener('click', function () { selectVis(b.getAttribute('data-id')); }); });
  }
  function hash01(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
  function paintBeacon(v, T) {
    var el = $('#plates .pl[data-id=' + v.id + ']'); if (!el) return;
    var val = valueOf(v, T, false), c = blazeOf(v, val), st = stageOf(v, val), m = model[v.id];
    var maxR = 4.2, t = Date.now() / 1000;
    $$('circle', el).forEach(function (ci) {
      var col = +ci.getAttribute('data-c'), row = +ci.getAttribute('data-r'), isB = ci.classList.contains('b'), f = 0, j = .85 + .3 * hash01(col, row);
      if (v.id === 'altar') { var yy = (ROWS - 1 - row) / (ROWS - 1), cx = Math.abs(col / (COLS - 1) - .5) * 2; f = Math.max(0, Math.min(1, (c * 1.25 - yy * .95 - cx * .35 * (1 - c)) * 2.2)); if (isB) f = Math.max(0, f * 1.1 - .35); }
      else if (v.id === 'cam-frame') { var dx = Math.min(col, COLS - 1 - col) / (COLS * .5), dy = Math.min(row, ROWS - 1 - row) / (ROWS * .5), d = Math.min(dx, dy * 1.4); f = Math.max(0, Math.min(1, (c * 1.15 - d * 1.5) * 2.4)); }
      else { var dx2 = Math.min(col, COLS - 1 - col) / (COLS * .5), dy2 = Math.min(row, ROWS - 1 - row) / (ROWS * .5), d2 = Math.min(dx2, dy2 * 1.4), pulse = reduce ? 0 : Math.sin(t * (1.5 + c * 4)) * .08; f = Math.max(0, Math.min(1, ((c + pulse) * 1.1 - d2 * 1.5) * 2.4)); }
      ci.setAttribute('r', (f * maxR * j * (isB ? .62 : 1)).toFixed(2));
    });
    var stg = $('.stg', el); stg.textContent = st.look; stg.setAttribute('data-t', st.look);
    var unit = v.id === 'hype-border' ? 'level' : v.id === 'altar' ? 'bits-equivalent' : 'subs & gifts';
    $('.val b', el).textContent = v.id === 'hype-border' ? (val || 0) : nm(val); $('.val span', el).textContent = '→ ' + Math.round(c * 100) + '% blaze · ' + unit;
    var rng = $('.rng', el); var max = m.max, xs = function (x) { return (m.sqrt ? Math.sqrt(x / max) : x / max) * 100; };
    rng.innerHTML = '<i style="left:0;width:' + xs(Math.min(val, max)) + '%"></i>' + m.bounds.map(function (b) { return '<u style="left:' + xs(b) + '%"></u>'; }).join('');
    $('.rl', el).innerHTML = '<span>0</span>' + m.bounds.map(function (b) { return '<span>' + nm(b) + '</span>'; }).join('') + '<span>' + nm(max) + '</span>';
  }
  function paintAll() { var T = simT(); V.forEach(function (v) { paintBeacon(v, T); }); paintFeed(T); paintPreview(T); paintCurveNow(T); }

  /* ---------- feed ---------- */
  function feedEvents(T) {
    var evs = S.contributions.filter(function (c) { return c.t <= T; }).concat(tests.filter(function (c) { return c.t <= T; }));
    evs.sort(function (a, b) { return b.t - a.t; });
    return evs.filter(function (c) { return feedFlt === 'all' || c.kind === feedFlt; });
  }
  function lights(c) { var out = []; V.forEach(function (v) { if (v.id === 'hype-border') { if (c.kind === 'hype_train') out.push(v); } else if (v.inputs.indexOf(c.kind) >= 0) out.push(v); }); return out; }
  function paintFeed(T) {
    var evs = feedEvents(T), key = evs.length + '|' + feedFlt + '|' + tests.length; if (key === paintFeed.k) return; var fresh = lastN >= 0 && evs.length > lastN; paintFeed.k = key; lastN = evs.length;
    var tb = $('#feed tbody');
    tb.innerHTML = evs.length ? evs.map(function (c, i) {
      var k = KINDS[c.kind] || [c.kind, 'star'], p = lights(c);
      return '<tr' + (fresh && i === 0 ? ' class="flash"' : '') + '><td class="n">' + CC.fmt.clock(c.t) + '</td><td><span class="fk">' + CC.icon(k[1]) + k[0] + (c.test ? ' <span class="chip solid-or">test</span>' : '') + '</span></td><td class="n">' + CC.fmt.n(c.amount) + '</td><td class="mono">' + esc(c.login) + '</td><td>' + (p.length ? p.map(function (v) { return '<span class="chip ' + (v.id === 'altar' ? 'gules' : v.id === 'cam-frame' ? 'or' : 'azure') + '">' + esc(v.name.split(' ').slice(-1)[0]) + '</span>'; }).join(' ') : '<span class="muted" title="Lights no beacon here">—</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M28 5c4.5 5.5 7 9 7 12.5a7 7 0 0 1-14 0c0-3.5 2.5-7 7-12.5z" stroke-dasharray="3 4"/><path d="M18 28c1.6-2.6 4.4-2.6 6 0M25.5 28c1.6-3 4.4-3 6 0M33 28c1.3-2.2 3.7-2.2 5 0"/><path d="M9 28h38M12 28l4 9h24l4-9M21 37l-5 14M35 37l5 14M28 37v14M18.5 45h19"/></svg><b>No beacon is lit</b><p>Nothing has fed the beacons in this filter. The braziers are cold.</p></div></td></tr>';
    $('#feed-meta').textContent = 'sample data · ' + evs.length + ' of ' + (S.contributions.length + tests.length) + ' events so far · ' + CC.fmt.clock(T);
    var fl = ['all', 'bits', 'sub', 'gift', 'points', 'hype_train'];
    $('#feed-flt').innerHTML = fl.map(function (f) { return '<button class="chip" data-f="' + f + '" aria-pressed="' + (feedFlt === f) + '">' + (f === 'all' ? 'All' : KINDS[f][0]) + '</button>'; }).join('');
    $$('#feed-flt button').forEach(function (b) { b.addEventListener('click', function () { feedFlt = b.getAttribute('data-f'); paintFeed.k = null; paintFeed(simT()); }); });
  }

  /* ---------- kindling curve (drag the handles) ---------- */
  var CV = { L: 46, R: 16, T: 24, B: 38, W: 560, H: 290 };
  function xs(m, x) { var p = m.sqrt ? Math.sqrt(Math.max(0, x) / m.max) : x / m.max; return CV.L + p * (CV.W - CV.L - CV.R); }
  function xi(m, px) { var p = Math.max(0, Math.min(1, (px - CV.L) / (CV.W - CV.L - CV.R))); return m.sqrt ? p * p * m.max : p * m.max; }
  function ys(y) { return CV.T + (1 - y) * (CV.H - CV.T - CV.B); }
  function yi(py) { return Math.max(0, Math.min(1, 1 - (py - CV.T) / (CV.H - CV.T - CV.B))); }
  function drawCurve() {
    var v = vis(sel), m = model[v.id], f = curveFn(m.pts), svg = $('#curve'), h = '';
    CV.W = Math.max(440, svg.clientWidth || 560); svg.setAttribute('viewBox', '0 0 ' + CV.W + ' ' + CV.H);
    var bx = [0].concat(m.bounds).concat([m.max]);
    for (var i = 0; i < bx.length - 1; i++) { h += '<rect x="' + xs(m, bx[i]) + '" y="' + CV.T + '" width="' + (xs(m, bx[i + 1]) - xs(m, bx[i])) + '" height="' + (CV.H - CV.T - CV.B) + '" fill="' + (i % 2 ? 'var(--tint-2)' : 'var(--tint)') + '"/>'; h += '<text x="' + (xs(m, bx[i]) + 6) + '" y="' + (CV.T - 8) + '" font-size="12" font-weight="700" font-family="var(--font-ui)" fill="var(--ink-2)" style="letter-spacing:.05em;text-transform:uppercase">' + esc(m.looks[i] || '') + '</text>'; }
    for (var g = 0; g <= 1; g += .25) h += '<line x1="' + CV.L + '" x2="' + (CV.W - CV.R) + '" y1="' + ys(g) + '" y2="' + ys(g) + '" stroke="var(--hair)" stroke-dasharray="2 4"/><text x="' + (CV.L - 8) + '" y="' + (ys(g) + 4) + '" text-anchor="end" font-size="12" font-family="var(--font-num)" fill="var(--muted)">' + Math.round(g * 100) + '%</text>';
    m.bounds.concat([m.max]).forEach(function (b) { h += '<text x="' + xs(m, b) + '" y="' + (CV.H - 20) + '" text-anchor="' + (b === m.max ? 'end' : 'middle') + '" font-size="12" font-family="var(--font-num)" fill="var(--muted)">' + nm(b) + '</text>'; });
    h += '<text x="' + CV.L + '" y="' + (CV.H - 20) + '" font-size="12" font-family="var(--font-num)" fill="var(--muted)">0</text><text x="' + ((CV.W + CV.L) / 2) + '" y="' + (CV.H - 4) + '" text-anchor="middle" font-size="12" font-family="var(--font-ui)" fill="var(--muted)" style="letter-spacing:.07em;text-transform:uppercase">' + (v.id === 'hype-border' ? 'hype train level' : v.id === 'altar' ? 'input (bits-equivalent, root scale)' : 'input (subs and gifts, root scale)') + '</text>';
    var d = ''; for (var k = 0; k <= 120; k++) { var p = k / 120, x = m.sqrt ? p * p * m.max : p * m.max; d += (k ? 'L' : 'M') + xs(m, x).toFixed(1) + ',' + ys(f(x)).toFixed(1) + ' '; }
    h += '<path d="' + d + ' L' + xs(m, m.max) + ',' + ys(0) + ' L' + xs(m, 0) + ',' + ys(0) + 'Z" fill="var(--or)" opacity=".75" style="mix-blend-mode:var(--blend)"/><path d="' + d + '" fill="none" stroke="var(--ink)" stroke-width="2.4"/>';
    h += '<g id="nowmark"></g>';
    m.pts.forEach(function (p, i) { var last = i === m.pts.length - 1, first = i === 0; h += '<g class="h" data-i="' + i + '" style="' + (first ? 'cursor:default' : last ? 'cursor:ew-resize' : 'cursor:move') + '"><circle cx="' + xs(m, p[0]) + '" cy="' + ys(p[1]) + '" r="' + (first ? 4 : 9) + '" fill="' + (first ? 'var(--ink)' : 'var(--paper)') + '" stroke="var(--ink)" stroke-width="2.4" tabindex="' + (first ? -1 : 0) + '" role="slider" aria-label="Handle ' + i + ': ' + nm(p[0]) + ' input, ' + Math.round(p[1] * 100) + '% blaze" aria-valuenow="' + Math.round(p[1] * 100) + '"/>' + (first ? '' : '<circle cx="' + xs(m, p[0]) + '" cy="' + ys(p[1]) + '" r="3" fill="var(--gules)"/>') + '</g>'; });
    svg.innerHTML = h;
    $$('#curve .h').forEach(function (g) { var i = +g.getAttribute('data-i'); if (i === 0) return; g.addEventListener('pointerdown', function (e) { e.preventDefault(); g.setPointerCapture(e.pointerId); drag(i, g, e); }); g.addEventListener('keydown', function (e) { keyMove(i, e); }); });
    $('#cv-name').textContent = v.name; $('#cv-decay').value = String(m.halfLife); $('#cv-gw').value = m.giftW; $('#cv-gw-v').textContent = m.giftW + '×';
    $('#cv-decay').disabled = v.id === 'hype-border'; $('#cv-gw').disabled = v.id === 'hype-border';
    paintCurveNow(simT());
  }
  function paintCurveNow(T) {
    var g = $('#nowmark'); if (!g) return; var v = vis(sel), m = model[v.id], val = Math.min(valueOf(v, T, false), m.max), c = blazeOf(v, val);
    g.innerHTML = '<line x1="' + xs(m, val) + '" x2="' + xs(m, val) + '" y1="' + CV.T + '" y2="' + ys(0) + '" stroke="var(--gules)" stroke-width="1.8" stroke-dasharray="4 3"/><circle cx="' + xs(m, val) + '" cy="' + ys(c) + '" r="5" fill="var(--gules)" stroke="var(--paper)" stroke-width="2"/><text x="' + Math.min(xs(m, val) + 8, CV.W - 90) + '" y="' + (ys(c) - 10) + '" font-size="12" font-weight="700" font-family="var(--font-num)" fill="var(--gules-text)">now ' + nm(val) + ' → ' + Math.round(c * 100) + '%</text>';
  }
  function drag(i, g, e0) {
    var v = vis(sel), m = model[v.id], svg = $('#curve');
    function move(e) {
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (CV.W / r.width), py = (e.clientY - r.top) * (CV.H / r.height), last = i === m.pts.length - 1;
      var lo = m.pts[i - 1][0], hi = last ? Infinity : m.pts[i + 1][0], x = xi(m, px), gap = m.max * .01;
      x = Math.max(lo + gap, Math.min(last ? m.max * 4 : hi - gap, x)); if (v.id === 'hype-border' && !last) x = Math.round(x * 2) / 2; if (x <= lo) x = lo + gap;
      m.pts[i][0] = x; if (last) m.max = x; else m.bounds[i - 1] = x;
      if (!last) { var y = yi(py); y = Math.max(m.pts[i - 1][1], Math.min(m.pts[i + 1][1], y)); m.pts[i][1] = y; }
      sched();
    }
    function up() { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); }
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  }
  function keyMove(i, e) {
    var v = vis(sel), m = model[v.id], last = i === m.pts.length - 1, d = { ArrowUp: [0, .03], ArrowDown: [0, -.03], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (!d) return; e.preventDefault();
    if (!last) m.pts[i][1] = Math.max(m.pts[i - 1][1], Math.min(m.pts[i + 1][1], m.pts[i][1] + d[1]));
    var dx = d[0] * m.max * (m.sqrt ? .01 : .02), nx = m.pts[i][0] + dx; nx = Math.max(m.pts[i - 1][0] + m.max * .01, last ? nx : Math.min(m.pts[i + 1][0] - m.max * .01, nx)); m.pts[i][0] = nx; if (last) m.max = nx; else m.bounds[i - 1] = nx;
    sched(true);
  }
  function sched(redraw) { if (raf) return; raf = requestAnimationFrame(function () { raf = null; if (redraw !== false) drawCurve(); paintAll(); }); }

  /* ---------- preview art: beacon brazier on the battlements, banner frame, hype border ---------- */
  var WALL = '<g fill="var(--ink)" opacity=".85"><rect x="0" y="152" width="320" height="28"/><path d="M0 140h30v12H0zM58 140h30v12H58zM232 140h30v12h-30zM290 140h30v12h-30z"/></g>' +
    '<path d="M0 166h320M44 152v14M118 152v14M202 152v14M276 152v14M80 166v14M160 166v14M240 166v14" stroke="var(--paper)" stroke-width="1.2" opacity=".3"/>' +
    '<path d="M146 152l5-12h18l5 12z" fill="var(--ink)"/><path d="M106 128h108l-16 13H122z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M118 134.5h84" stroke="var(--ink)" stroke-width="1.6"/>';
  var RIM = '<path d="M100 128h120" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>';
  function artBrazier(c) {
    var n = 1 + Math.floor(c * 4), hgt = 22 + c * 108, h = WALL;
    h += '<g style="mix-blend-mode:var(--blend)">';
    for (var i = 0; i < n; i++) { var x = 160 + (i - (n - 1) / 2) * (c > .66 ? 12 : 26), hh = hgt * (1 - Math.abs(i - (n - 1) / 2) * .16), w = 14 + c * (c > .66 ? 16 : 11); h += '<path class="flick" style="animation-delay:' + (i * .23).toFixed(2) + 's" d="M' + x + ',128 C' + (x - w) + ',' + (128 - hh * .45) + ' ' + (x - w * .3) + ',' + (128 - hh * .75) + ' ' + x + ',' + (128 - hh) + ' C' + (x + w * .3) + ',' + (128 - hh * .75) + ' ' + (x + w) + ',' + (128 - hh * .45) + ' ' + x + ',128Z" fill="var(--or)"/><path class="flick" style="animation-delay:' + (i * .31).toFixed(2) + 's" d="M' + (x + 3) + ',128 C' + (x - w * .5) + ',' + (128 - hh * .3) + ' ' + x + ',' + (128 - hh * .5) + ' ' + (x + 3) + ',' + (128 - hh * .66) + ' C' + (x + w * .6) + ',' + (128 - hh * .4) + ' ' + (x + w * .5) + ',' + (128 - hh * .2) + ' ' + (x + 3) + ',128Z" fill="var(--gules)"/>'; }
    h += '</g>' + RIM;
    var sp = Math.floor(c * 16); for (var k = 0; k < sp; k++) { var sx = 100 + hash01(k, 3) * 120, sy = 120 - hash01(k, 7) * hgt * 1.15; h += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + (1 + hash01(k, 9) * 1.6).toFixed(1) + '" fill="var(--gules)"/>'; }
    return h;
  }
  function banner(x, len) { // a hanging swallowtail banner on its rod, beside the frame
    return '<path d="M' + (x - 3) + ' 30h20" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/><path d="M' + x + ' 30h14v' + len.toFixed(1) + 'l-7-7l-7 7z" fill="var(--gules)" style="mix-blend-mode:var(--blend)"/><path d="M' + (x + 3.5) + ' 40l3.5 4 3.5-4" fill="none" stroke="var(--or)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function artFrame(c) {
    var bw = 4 + c * 12, bl = 34 + c * 56, h = '<rect x="40" y="26" width="240" height="128" fill="var(--paper)" opacity=".5"/><g stroke="var(--ink)" stroke-width="1.4" opacity=".35"><path d="M40 90h240M160 26v128"/></g>' + banner(6, bl) + banner(300, bl);
    h += '<rect x="' + (40 - bw / 2) + '" y="' + (26 - bw / 2) + '" width="' + (240 + bw) + '" height="' + (128 + bw) + '" fill="none" stroke="var(--or)" stroke-width="' + bw + '" style="mix-blend-mode:var(--blend)"/><rect x="' + (40 - bw) + '" y="' + (26 - bw) + '" width="' + (240 + bw * 2) + '" height="' + (128 + bw * 2) + '" fill="none" stroke="var(--ink)" stroke-width="2"/><rect x="' + (40 + bw) + '" y="' + (26 + bw) + '" width="' + (240 - bw * 2) + '" height="' + (128 - bw * 2) + '" fill="none" stroke="var(--ink)" stroke-width="1.6"/>';
    if (c > .3) { var nr = Math.floor(8 + c * 22); for (var i = 0; i < nr; i++) { var t = i / nr, px, py, rot; var per = 2 * (240 + 128), d = t * per; if (d < 240) { px = 40 + d; py = 26; } else if (d < 368) { px = 280; py = 26 + d - 240; } else if (d < 608) { px = 280 - (d - 368); py = 154; } else { px = 40; py = 154 - (d - 608); } h += '<path d="M' + (px - 3) + ',' + (py - 3) + 'l6,6M' + (px + 3) + ',' + (py - 3) + 'l-6,6" stroke="var(--gules)" stroke-width="1.8"/>'; } }
    if (c > .62) { for (var j = 0; j < 36; j++) { var a = j / 36 * Math.PI * 2, rx = 150 + 12 * Math.sin(j * 3), px2 = 160 + Math.cos(a) * rx, py2 = 90 + Math.sin(a) * (rx * .62); h += '<circle cx="' + px2.toFixed(1) + '" cy="' + py2.toFixed(1) + '" r="' + (1.3 + hash01(j, 2) * 2.2).toFixed(1) + '" fill="var(--or)" style="mix-blend-mode:var(--blend)"/>'; } }
    return h;
  }
  function artBorder(c, lvl) {
    var bw = 3 + c * 22, h = '<rect x="0" y="0" width="320" height="180" fill="none" stroke="var(--gules)" stroke-width="' + bw + '" style="mix-blend-mode:var(--blend)" opacity="' + (.5 + c * .5).toFixed(2) + '"/><rect x="' + bw + '" y="' + bw + '" width="' + (320 - bw * 2) + '" height="' + (180 - bw * 2) + '" fill="none" stroke="var(--ink)" stroke-width="1.5"/>';
    if (c > .8) for (var i = 0; i < 18; i++) { var x = hash01(i, 5) * 320, l = 10 + hash01(i, 6) * 26; h += '<path d="M' + x.toFixed(1) + ',0 l' + (hash01(i, 8) * 8 - 4).toFixed(1) + ',' + l.toFixed(1) + '" stroke="var(--azure)" stroke-width="2.2" style="mix-blend-mode:var(--blend)"/>'; }
    h += '<text x="160" y="96" text-anchor="middle" font-size="12" font-family="var(--font-ui)" font-weight="700" letter-spacing="1.5" fill="var(--muted)">LEVEL ' + (lvl || 0) + '</text>';
    return h;
  }
  function paintPreview(T) {
    var v = vis(sel), tw = T - bombAt < 5, val = valueOf(v, T, true), c = detached ? +$('#pv-i').value / 100 : blazeOf(v, val);
    if (!detached) { $('#pv-i').value = Math.round(c * 100); }
    $('#pv-v').textContent = Math.round(c * 100) + '%'; var pf = $('#pv-follow'); pf.textContent = detached ? 'set by hand' : 'following live'; pf.style.color = detached ? 'var(--muted)' : 'var(--or-text)';
    $('#prev').innerHTML = v.id === 'altar' ? artBrazier(c) : v.id === 'cam-frame' ? artFrame(c) : artBorder(c, Math.round(c * 6));
    $('#preview').classList.toggle('bomb', tw && !detached);
    var key = v.id; $('#feed-url').textContent = 'http://localhost:4821/feeds/' + key;
  }
  var code = {
    altar: '<span class="c">/* altar.css · the app sets --blaze from 0 to 1 */</span>\n.flame { transform: scale(calc(.5 + var(--blaze) * 1.6));\n         opacity:   calc(.35 + var(--blaze) * .65); }\n.sparks { --n: calc(var(--blaze) * 16); }',
    'cam-frame': '<span class="c">/* frame.css */</span>\n.frame { border-width: calc(4px + var(--blaze) * 12px); }\n.runes { opacity: clamp(0, (var(--blaze) - .3) * 3, 1); }\n.halo  { opacity: clamp(0, (var(--blaze) - .62) * 4, 1); }',
    'hype-border': '<span class="c">/* border.css */</span>\n.border { border-width: calc(3px + var(--blaze) * 22px);\n          animation: pulse calc(1.4s - var(--blaze) * .8s) infinite; }'
  };
  function renderLayers() {
    var v = vis(sel); $('#pl-name').textContent = v.name;
    var f = { altar: ['altar.html', 'altar.css', 'altar.js'], 'cam-frame': ['frame.html', 'frame.css', 'frame.js'], 'hype-border': ['border.html', 'border.css', 'border.js'] }[v.id];
    var tp = ['structure: the shapes', 'looks: reads --blaze', 'behaviour: easing, sparks, sound cue'];
    $('#layers').innerHTML = f.map(function (n, i) { return '<li><span class="no">' + (i + 1) + '</span><span><b class="mono" style="font-size:13px">' + n + '</b><br><span class="muted">' + tp[i] + '</span></span><span class="chip dash">' + ['HTML', 'CSS', 'JS'][i] + '</span></li>'; }).join('') + '<li><span class="no">+</span><span><b>artwork</b><br><span class="muted">optional: drawn by an image-generation API with your key; you seal (approve) it first</span></span><span class="chip dash">PNG / SVG</span></li>';
    $('#code').innerHTML = code[v.id];
  }
  function selectVis(id) { sel = id; $$('#plates .pl').forEach(function (b) { var on = b.getAttribute('data-id') === id; b.setAttribute('aria-pressed', on); b.setAttribute('aria-checked', on); }); detached = false; drawCurve(); renderLayers(); paintAll(); }

  /* ---------- the Steward (co-pilot) ---------- */
  function propose(text) {
    var s = text.toLowerCase(), lines = [], apply = [], v;
    if (/frame|gold|gild|camera/.test(s) || (/gift/.test(s) && /glow|harder|brighter/.test(s))) {
      v = vis('cam-frame'); var m = model['cam-frame'];
      if (/gift|glow|harder|bright/.test(s)) {
        lines.push({ op: '', s: 'Beacon: Gilded camera frame · inputs sub, gift' });
        lines.push({ op: 'del', s: 'Each gift sub counts ' + m.giftW + '×'}); lines.push({ op: 'ins', s: 'Each gift sub counts 3×' });
        lines.push({ op: 'del', s: 'Glow: full at ' + nm(m.bounds[1]) + ' units' }); lines.push({ op: 'ins', s: 'Glow: runes from 3, halo from 12 units; curve steeper' });
        lines.push({ op: 'ins', s: 'Frame colour: gold (or), glow on gifts' });
        apply.push(function () { m.giftW = 3; m.bounds = [3, 12]; m.pts = [[0, 0], [3, .3], [12, .72], [m.max, 1]]; });
      }
    }
    if (/altar|fire|flame|burn/.test(s) && /faster|quick|shorter|slower|longer/.test(s)) {
      var mm = model.altar, fast = /faster|quick|shorter/.test(s), to = fast ? 120 : 900;
      lines.push({ op: 'del', s: 'Altar: ' + (mm.halfLife ? 'halves every ' + mm.halfLife / 60 + ' min' : 'no decay') }); lines.push({ op: 'ins', s: 'Altar: halves every ' + to / 60 + ' min' });
      apply.push(function () { mm.halfLife = to; v = vis('altar'); });
    }
    if (/border|hype/.test(s) && /thick|bigger|stronger/.test(s)) { var mb = model['hype-border']; lines.push({ op: 'del', s: 'Hype border: full storm at level 5' }); lines.push({ op: 'ins', s: 'Hype border: full storm at level 4' }); apply.push(function () { mb.bounds = [1, 2.5, 4]; mb.pts = [[0, 0], [1, .3], [2.5, .65], [4, .9], [mb.max, 1]]; }); }
    if (!apply.length) return null;
    var target = /altar|fire|flame/.test(s) ? 'altar' : /border|hype/.test(s) ? 'hype-border' : 'cam-frame';
    return { title: 'Draft writ · ' + vis(target).name, lines: lines, note: 'Should you want artwork drawn, it goes through an image-generation API on your own key, and only once you seal it.', toast: 'Sealed: the kindling curve has moved', apply: function () { apply.forEach(function (f) { f(); }); selectVis(target); CC.flash($('#curve').parentNode); CC.flash($('#plates .pl[data-id=' + target + ']')); } };
  }

  function init() {
    V = S.visuals; V.forEach(function (v) { model[v.id] = mkModel(v); });
    buildBeacons(); drawCurve(); renderLayers(); paintAll();
    $('#url-copy').innerHTML = CC.icon('copy');
    $('#head-actions').innerHTML = '<span class="chip dash" id="clk-chip"></span><a class="btn ghost" href="moderator.html" title="A message the Gatehouse bars (removes) never counts toward a tally">' + CC.icon('watch') + 'Barred lines never count</a>';
    $('#clk-pause').addEventListener('click', function () { clock.paused ? (clock.paused = false, clock.t0 = Date.now()) : (freeze(), clock.paused = true); this.textContent = clock.paused ? 'Resume sample clock' : 'Pause sample clock'; this.setAttribute('aria-pressed', String(clock.paused)); });
    $$('#clk-speed button').forEach(function (b) { b.addEventListener('click', function () { freeze(); clock.speed = +b.getAttribute('data-s'); $$('#clk-speed button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
    $('#cv-decay').addEventListener('change', function (e) { model[sel].halfLife = +e.target.value; paintAll(); });
    $('#cv-gw').addEventListener('input', function (e) { model[sel].giftW = +e.target.value; $('#cv-gw-v').textContent = e.target.value + '×'; paintAll(); });
    $('#cv-reset').addEventListener('click', function () { var d = JSON.parse(model[sel].dflt); model[sel].pts = d.pts; model[sel].halfLife = d.halfLife; model[sel].giftW = 1; model[sel].bounds = d.pts.slice(1, -1).map(function (p) { return p[0]; }); model[sel].max = d.pts[d.pts.length - 1][0]; drawCurve(); paintAll(); CC.toast('Kindling curve reset'); });
    $('#pv-i').addEventListener('input', function () { detached = true; paintPreview(simT()); });
    $('#pv-bomb').addEventListener('click', function () { detached = false; var T = simT(); tests.push({ t: T, kind: 'gift', amount: 50, login: 'test fire', test: true }); bombAt = T; paintFeed.k = null; paintAll(); CC.toast('Test fire: 50 gift subs fed to the preview only'); });
    $('#url-copy').addEventListener('click', function () { CC.copy($('#feed-url').textContent, 'Feed URL copied'); });
    CC.steward.setup({ intro: 'Tell me how a beacon should burn. I shall draft a writ for its kindling curve; nothing changes until you seal it.', examples: ['gild the camera frame so it glows harder with each gift sub', 'let the altar fire burn down faster', 'make the hype border thicker'], propose: propose });
    setInterval(function () { if (!document.hidden) { var T = simT(); V.forEach(function (v) { paintBeacon(v, T); }); paintFeed(T); paintPreview(T); paintCurveNow(T); var c = $('#clk-chip'); if (c) c.textContent = 'Sample clock ' + CC.fmt.clock(T) + ' ×' + (clock.paused ? 0 : clock.speed); } }, reduce ? 800 : 330);
    CC.on(function () { paintAll(); });
    if (window.ResizeObserver) { var lastW = 0; new ResizeObserver(function () { var w = $('#curve').clientWidth; if (Math.abs(w - lastW) > 4) { lastW = w; drawCurve(); } }).observe($('#curve').parentNode); }
  }
})();
