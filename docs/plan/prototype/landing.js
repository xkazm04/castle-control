/* Castle Control landing: custom lettering, the keep, halftones, chamber scenes, interaction.  Classic script, no network. */
(function () {
  'use strict';
  var D = document, W = window;
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function f(n) { return Math.round(n * 10) / 10; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function guard(fn) { try { fn(); } catch (e) { if (W.console) console.warn('castle:', e && e.message); } }
  var reduced = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- custom lettering: heavy condensed capitals, drawn on a 100-unit cap height ---------- */
  var G = {
    A: { w: 72, d: 'M0 100L22 0H50L72 100H48L44 82H28L24 100ZM36 46L40 64H32Z' },
    B: { w: 61, d: 'M0 0H32A23 23 0 0 1 32 46H34A27 27 0 0 1 34 100H0ZM24 22H32A5 5 0 0 1 32 32H24ZM24 66H34A6 6 0 0 1 34 78H24Z' },
    C: { w: 66, d: 'M33 0A33 33 0 0 1 66 33V36H42V35A9 9 0 0 0 24 35V65A9 9 0 0 0 42 65V64H66V67A33 33 0 0 1 33 100A33 33 0 0 1 0 67V33A33 33 0 0 1 33 0Z' },
    E: { w: 54, d: 'M0 0H54V24H24V38H48V62H24V76H54V100H0Z' },
    G: { w: 68, d: 'M34 0A34 34 0 0 1 68 34V38H44V35A10 10 0 0 0 24 35V65A10 10 0 0 0 44 65V62H36V44H68V66A34 34 0 0 1 34 100A34 34 0 0 1 0 66V34A34 34 0 0 1 34 0Z' },
    H: { w: 68, d: 'M0 0H24V38H44V0H68V100H44V62H24V100H0Z' },
    L: { w: 50, d: 'M0 0H24V76H50V100H0Z' },
    M: { w: 90, d: 'M0 0H26L45 46L64 0H90V100H66V48L52 80H38L24 48V100H0Z' },
    N: { w: 70, d: 'M0 0H24L46 54V0H70V100H46L24 46V100H0Z' },
    O: { w: 70, d: 'M35 0A35 35 0 0 1 70 35V65A35 35 0 0 1 35 100A35 35 0 0 1 0 65V35A35 35 0 0 1 35 0ZM35 24A11 11 0 0 1 46 35V65A11 11 0 0 1 35 76A11 11 0 0 1 24 65V35A11 11 0 0 1 35 24Z' },
    P: { w: 62, d: 'M0 0H32A30 30 0 0 1 32 60H24V100H0ZM24 24H32A6 6 0 0 1 32 36H24Z' },
    R: { w: 64, d: 'M0 0H32A30 30 0 0 1 52 52L64 100H38L27 62H24V100H0ZM24 24H32A6 6 0 0 1 32 36H24Z' },
    S: { w: 62, d: 'M18 0H62V24H24V38H44A18 18 0 0 1 62 56V82A18 18 0 0 1 44 100H0V76H38V62H18A18 18 0 0 1 0 44V18A18 18 0 0 1 18 0Z' },
    T: { w: 64, d: 'M0 0H64V24H44V100H20V24H0Z' },
    U: { w: 68, d: 'M0 0H24V66A10 10 0 0 0 44 66V0H68V66A34 34 0 0 1 0 66Z' }
  };
  function word(text, gap) {
    gap = gap == null ? 8 : gap;
    var x = 0, out = '', k = 0;
    for (var i = 0; i < text.length; i++) {
      var g = G[text.charAt(i)];
      if (!g) { x += 30; continue; }
      out += '<g transform="translate(' + x + ' 0)"><path class="gl" style="--k:' + k + '" fill-rule="evenodd" d="' + g.d + '"/></g>';
      x += g.w + gap; k++;
    }
    return { svg: out, w: x - gap };
  }
  function fillWords() {
    $$('svg[data-word]').forEach(function (s) {
      var w = word(s.getAttribute('data-word'));
      s.setAttribute('viewBox', '0 0 ' + w.w + ' 100');
      s.setAttribute('preserveAspectRatio', 'xMinYMid meet');
      s.innerHTML = w.svg;
      var ink = s.getAttribute('data-ink');
      if (ink) s.style.fill = ink;
    });
  }

  /* ---------- halftone, hex and ticket helpers ---------- */
  function halftone(o) {
    var s = o.s || 12, k = o.k || 0.74, a = (o.ang == null ? 45 : o.ang) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var cx = o.x + o.w / 2, cy = o.y + o.h / 2, R = Math.hypot(o.w, o.h) / 2, n = Math.ceil(R / s), d = [];
    for (var i = -n; i <= n; i++) for (var j = -n; j <= n; j++) {
      var lx = i * s, ly = j * s, px = cx + lx * ca - ly * sa, py = cy + lx * sa + ly * ca;
      if (px < o.x || px > o.x + o.w || py < o.y || py > o.y + o.h) continue;
      var t = o.tone(px, py);
      if (!(t > 0.03)) continue;
      if (t > 1) t = 1;
      var r = Math.round(Math.sqrt(t) * s * k * 10) / 10;
      d.push('M' + f(px - r) + ' ' + f(py) + 'a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f(-2 * r) + ' 0');
    }
    return d.join('');
  }
  function hexD(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i; p.push(f(cx + r * Math.cos(a)) + ' ' + f(cy + r * Math.sin(a))); }
    return 'M' + p.join('L') + 'Z';
  }
  function hexGrid(cols, rows, r, ox, oy) {
    var cells = [], dx = 1.5 * r, dy = Math.sqrt(3) * r;
    for (var c = 0; c < cols; c++) for (var q = 0; q < rows; q++) cells.push({ c: c, r: q, x: ox + c * dx, y: oy + q * dy + (c % 2 ? dy / 2 : 0) });
    return cells;
  }
  function inHex(px, py, cx, cy, r) {
    var x = Math.abs(px - cx), y = Math.abs(py - cy), h = r * Math.sqrt(3) / 2;
    return y <= h && (x * h + y * r / 2) <= r * h;
  }
  function inRect(px, py, b) { return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; }
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var TK = 'M0 0H240V38A12 12 0 0 0 240 62V100H0V62A12 12 0 0 0 0 38Z';
  function ticketPoster(x, y, rot, num, sc, ink) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + sc + ') translate(0 -50)">' +
      '<path d="' + TK + '" fill="' + ink + '" style="stroke:var(--ko)" stroke-width="7" stroke-linejoin="round"/>' +
      '<path d="M66 9V91" style="stroke:var(--ko)" stroke-width="3" stroke-dasharray="3 6" fill="none"/>' +
      '<text x="33" y="57" text-anchor="middle" font-size="16" font-weight="800" letter-spacing="2" style="fill:var(--ko);font-family:var(--font-ui)">N°</text>' +
      '<text x="154" y="67" text-anchor="middle" font-size="46" font-weight="800" style="fill:var(--ko);font-family:var(--font-num)">' + num + '</text></g>';
  }
  function ticketPaper(x, y, rot, num, sc) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + sc + ') translate(-120 -50)">' +
      '<path d="' + TK + '" fill="var(--sheet)" stroke="var(--press)" stroke-width="6" stroke-linejoin="round"/>' +
      '<path d="M66 9V91" stroke="var(--press)" stroke-width="3" stroke-dasharray="3 6" fill="none"/>' +
      '<text x="154" y="67" text-anchor="middle" font-size="46" font-weight="800" fill="var(--press)" style="font-family:var(--font-num)">' + num + '</text></g>';
  }
  function setD(id, d) { var e = D.getElementById(id); if (e) e.setAttribute('d', d); }
  function setHTML(id, h) { var e = D.getElementById(id); if (e) e.innerHTML = h; }

  /* territories on the nine-by-six hex map (sample: three sides) */
  function side(c, r) {
    if (c <= 2) return r === 5 && c === 2 ? 'fog' : 'quill';
    if (c >= 5 && r <= 2) return 'tallow';
    if (c >= 4 && r >= 3) return 'sable';
    return 'fog';
  }
  var SIDE_INK = { quill: 'var(--azure)', tallow: 'var(--or)', sable: 'var(--gules)' };

  /* ---------- the keep: one table drives the stone plate, its halftone and the hit areas ---------- */
  var GROUND = 846;
  var CASTLE = [
    { id: 'gate-tower-l', x: 140, y: 470, w: 110 },
    { id: 'gate-tower-r', x: 410, y: 470, w: 110 },
    { id: 'gate-block', x: 250, y: 540, w: 160 },
    { id: 'curtain-1', x: 520, y: 600, w: 40 },
    { id: 'keep', x: 560, y: 440, w: 490, cut: true },
    { id: 'curtain-2', x: 1050, y: 580, w: 100 },
    { id: 'beacon-tower', x: 1150, y: 400, w: 160 },
    { id: 'curtain-3', x: 1310, y: 660, w: 50 },
    { id: 'watch-tower', x: 1360, y: 540, w: 120 }
  ];
  var ARCH = { x: 284, w: 92, top: 700 };              // the gate passage
  var KEEP = { x: 576, y: 452, w: 458, floor: 630 };    // the cutaway interior
  var HEXBOX = { x: 620, y: 458, w: 212, h: 168 }, WINBOX = { x: 894, y: 446, w: 64, h: 108 }, DRUM = { x: 724, y: 748, r: 100 }, WRIT = { x: 912, y: 660, w: 124, h: 186 };
  function merlons(p, mw, gap, mh) {
    var n = Math.max(2, Math.floor((p.w + gap) / (mw + gap))), step = (p.w - mw) / (n - 1), o = '';
    for (var i = 0; i < n; i++) o += '<rect x="' + f(p.x + i * step) + '" y="' + (p.y - mh) + '" width="' + mw + '" height="' + (mh + 1) + '"/>';
    return o;
  }
  function inArch(px, py) { return px > ARCH.x && px < ARCH.x + ARCH.w && py < GROUND && (py > ARCH.top || Math.hypot(px - (ARCH.x + ARCH.w / 2), py - ARCH.top) < ARCH.w / 2); }
  function stoneTone(px, py) {
    if (py > GROUND) return 0;
    if (inArch(px, py)) return 0.34;
    for (var i = 0; i < CASTLE.length; i++) {
      var p = CASTLE[i];
      if (px < p.x || px > p.x + p.w || py < p.y) continue;
      if (p.cut) {
        if (!inRect(px, py, { x: KEEP.x, y: KEEP.y, w: KEEP.w, h: GROUND - KEEP.y })) return 0;
        if (py < KEEP.floor) return (inRect(px, py, HEXBOX) || inRect(px, py, WINBOX)) ? 0 : 0.26;
        if (py < KEEP.floor + 12) return 0;
        var g = Math.hypot(px - DRUM.x, py - DRUM.y);
        if (g < DRUM.r || inRect(px, py, WRIT)) return 0;
        return Math.min(0.46, 0.06 + (g - DRUM.r) / 640);        // the hall is lit from the drum outward
      }
      var lit = (px - p.x) / p.w;                                   // the beacons light the walls from the right
      return 0.36 - 0.2 * lit;
    }
    return 0;
  }
  function buildCastle() {
    var st = '', i;
    CASTLE.forEach(function (p) {
      var h = GROUND - p.y;
      if (p.cut) {
        // cutaway keep: outer walls, roof slab and floor slab in solid key; the front wall is lifted away
        st += '<rect x="' + p.x + '" y="' + p.y + '" width="16" height="' + h + '"/><rect x="' + (p.x + p.w - 16) + '" y="' + p.y + '" width="16" height="' + h + '"/>';
        st += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="12"/><rect x="' + p.x + '" y="' + KEEP.floor + '" width="' + p.w + '" height="12"/>';
        st += merlons(p, 26, 16, 26);
        return;
      }
      st += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + h + '" fill="none" stroke="var(--key)" stroke-width="5"/>';
      st += merlons(p, 22, 14, 24);
    });
    // the gate passage, arrow slits, the beacon tower's windows and door, the ground line
    st += '<path d="M' + ARCH.x + ' ' + GROUND + 'V' + ARCH.top + 'a' + ARCH.w / 2 + ' ' + ARCH.w / 2 + ' 0 0 1 ' + ARCH.w + ' 0V' + GROUND + '" fill="none" stroke="var(--key)" stroke-width="7"/>';
    [[192, 650], [462, 650], [192, 752], [462, 752], [1420, 700], [1100, 650], [538, 660], [1230, 760]].forEach(function (s) { st += '<rect x="' + (s[0] - 4) + '" y="' + s[1] + '" width="8" height="34" rx="4"/>'; });
    [[1205, 470], [1205, 616], [1406, 600]].forEach(function (w, k) { var ww = k === 2 ? 28 : 50, hh = k === 2 ? 44 : 64; st += '<path d="M' + w[0] + ' ' + (w[1] + hh) + 'V' + (w[1] + ww / 2) + 'a' + ww / 2 + ' ' + ww / 2 + ' 0 0 1 ' + ww + ' 0V' + (w[1] + hh) + 'Z" fill="none" stroke="var(--key)" stroke-width="5"/>'; });
    st += '<path d="M1100 ' + GROUND + 'V776a22 22 0 0 1 44 0V' + GROUND + '" fill="none" stroke="var(--key)" stroke-width="6"/>';
    st += '<rect x="96" y="' + (GROUND - 3) + '" width="1408" height="7"/>';
    setHTML('stone', st);
    setD('ht-stone', halftone({ x: 120, y: 290, w: 1360, h: GROUND - 290, s: 11, ang: 45, k: 0.72, tone: stoneTone }));
  }

  /* ---------- the poster ---------- */
  function buildPoster() {
    if (!D.getElementById('stage')) return;
    buildCastle();
    // wordmark across the sky, with a gules ghost slipped out of register; its lower third dissolves into halftone
    var wm = word('CASTLE CONTROL'), s = 1180 / wm.w, wx = 800 - (wm.w * s) / 2, wy = 124, cap = 100 * s, wmEl = D.getElementById('wm');
    if (wmEl) {
      var cut = wy + cap * 0.62;
      var holes = halftone({ x: wx - 12, y: cut, w: wm.w * s + 24, h: wy + cap - cut + 8, s: 9, ang: 45, k: 0.8, tone: function (px, py) { var t = (py - cut) / (wy + cap - cut); return Math.pow(Math.max(0, t), 1.25) * 1.15; } });
      wmEl.innerHTML = '<defs><mask id="wmMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><g fill="#fff" transform="translate(' + f(wx) + ' ' + wy + ') scale(' + s.toFixed(4) + ')">' + wm.svg + '</g><path fill="#000" d="' + holes + '"/></mask></defs>' +
        '<g class="ghost" transform="translate(5.5 4.5)"><g mask="url(#wmMask)"><rect width="1600" height="1000"/></g></g>' +
        '<g class="face"><g mask="url(#wmMask)"><rect width="1600" height="1000"/></g></g>';
    }
    // chamber names print in the sky where the wordmark stood, in the chamber's ink
    [['lots', 'LOT CHAMBER'], ['gate', 'GATEHOUSE'], ['beacons', 'BEACONS'], ['map', 'MAP ROOM']].forEach(function (n) {
      var w = word(n[1]), sc = 1.34, x = 800 - (w.w * sc) / 2;
      var el = D.getElementById('n-' + n[0]);
      if (el) el.innerHTML = '<g class="gh" transform="translate(' + f(x + 6) + ' 125) scale(' + sc + ')">' + w.svg + '</g><g transform="translate(' + f(x) + ' 120) scale(' + sc + ')">' + w.svg + '</g>';
    });
    // beacons: the glow around both fires, and the lit windows
    setD('ht-glow', halftone({
      x: 980, y: 150, w: 540, h: 520, s: 14, ang: 45, tone: function (px, py) {
        var d1 = Math.hypot(px - 1231, py - 300), d2 = Math.hypot(px - 1421, py - 464), a = Math.atan2(py - 300, px - 1231);
        var t1 = (d1 > 92 && d1 < 270) ? Math.pow(1 - (d1 - 92) / 178, 1.4) * (0.62 + 0.38 * Math.abs(Math.cos(a * 9))) : 0;
        var t2 = (d2 > 50 && d2 < 150) ? Math.pow(1 - (d2 - 50) / 100, 1.5) * 0.8 : 0;
        return (inRect(px, py, { x: 1150, y: 376, w: 160, h: 600 }) || inRect(px, py, { x: 1360, y: 516, w: 120, h: 400 })) ? 0 : Math.max(t1, t2);
      }
    }));
    setHTML('lit-windows', '<path d="M1205 534V495a25 25 0 0 1 50 0V534Z"/><path d="M1205 680V641a25 25 0 0 1 50 0V680Z"/><path d="M1406 644V614a14 14 0 0 1 28 0V644Z"/>');
    // the lot chamber: hall bunting, tickets tumbling in the drum, a fan of drawn lots, warm floor
    var bt = '', i;
    for (i = 0; i < 13; i++) {
      var x0 = 596 + i * 34, t0 = (x0 - 596) / 418, y0 = 650 + 26 * 4 * t0 * (1 - t0);
      bt += '<path d="M' + f(x0) + ' ' + f(y0) + 'h24l-12 24z"/>';
    }
    setHTML('bunting', '<path d="M590 650Q811 702 1030 650" fill="none" stroke="var(--gules)" stroke-width="3"/>' + bt);
    var tk = '', nums = ['0087', '0140', '0312'], angs = [6, -12, -30];
    for (i = 0; i < 3; i++) tk += ticketPoster(812, 796, angs[i], nums[i], 0.34 - i * 0.01, 'var(--gules)');
    setHTML('fan', tk);
    var inner = '';
    for (i = 0; i < 8; i++) {
      var a = rnd() * 6.283, rr = 18 + rnd() * 34;
      inner += ticketPoster(f(724 + Math.cos(a) * rr - 14), f(748 + Math.sin(a) * rr), f(rnd() * 360), String(10 + Math.floor(rnd() * 89)).padStart(4, '0'), 0.13, 'var(--gules)');
    }
    setHTML('drum-tk', inner);
    setD('ht-hall', halftone({ x: 590, y: 800, w: 260, h: 46, s: 9, ang: 45, tone: function (px, py) { var d = Math.hypot((px - 724) / 2.6, py - 846); return d < 48 ? 0.6 * (1 - d / 48) : 0; } }));
    // the gatehouse: the moat and its waves, messages held behind the portcullis
    setD('ht-moat', halftone({ x: 96, y: 852, w: 1408, h: 50, s: 10, ang: 45, k: 0.7, tone: function (px, py) { return 0.28 + 0.3 * (py - 852) / 50; } }));
    var wv = '';
    [866, 888].forEach(function (y, k) { var d = 'M' + (110 + k * 20) + ' ' + y; for (var x = 110 + k * 20; x < 1480; x += 40) d += 'q10-8 20 0t20 0'; wv += '<path d="' + d + '" stroke-dasharray="' + (k ? '60 40' : '120 30') + '"/>'; });
    setHTML('waves', wv);
    var hb = '';
    [712, 750].forEach(function (y) { hb += '<path d="M296 ' + y + 'h60a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-40l-8 7v-7h-12a4 4 0 0 1-4-4v-12a4 4 0 0 1 4-4z" fill="none" stroke="var(--azure)" stroke-width="3"/><circle cx="312" cy="' + (y + 10) + '" r="2.6"/><circle cx="324" cy="' + (y + 10) + '" r="2.6"/><circle cx="336" cy="' + (y + 10) + '" r="2.6"/>'; });
    setHTML('held', hb);
    // the map room: the hex map on the back wall
    var cells = hexGrid(9, 6, 13, 640, 476), g = '', solid = '', sel = { '1,2': 1, '4,3': 1, '6,1': 1, '7,4': 1 };
    var tones = { '0,1': .55, '0,2': .55, '1,1': .55, '1,3': .55, '2,2': .55, '2,3': .55, '3,1': .55, '3,2': .55, '5,0': .35, '5,1': .35, '6,2': .35, '7,2': .35, '8,1': .35, '8,2': .35, '4,5': .8, '5,4': .8, '5,5': .8, '6,4': .8, '6,5': .8, '7,5': .8 };
    var hd = '';
    cells.forEach(function (c) {
      var key = c.c + ',' + c.r;
      g += hexD(c.x, c.y, 12.4);
      if (sel[key]) solid += hexD(c.x, c.y, 12.4);
      else if (tones[key]) {
        var t = tones[key];
        hd += halftone({ x: c.x - 14, y: c.y - 13, w: 28, h: 26, s: 4.6, ang: 45, k: 0.74, tone: function (px, py) { return inHex(px, py, c.x, c.y, 11.6) ? t : 0; } });
      }
    });
    var hg = D.getElementById('hexg'); if (hg) hg.innerHTML = '<path d="' + g + '"/>';
    setD('hex-solid', solid); setD('ht-hex', hd);
  }

  /* ---------- scenes ---------- */
  var S = W.SAMPLE || null;
  function buildScenes() {
    if (!D.getElementById('scene-lots')) return;
    // LOT CHAMBER: tumbling tickets, drum shadow
    var i, t = '', ns = ['0087', '0140', '0312', '0004', '0198', '0233', '0061', '0275', '0019', '0150'];
    seed = 5;
    for (i = 0; i < ns.length; i++) {
      var a = rnd() * 6.283, rr = 40 + rnd() * 120;
      t += ticketPaper(f(560 + Math.cos(a) * rr), f(400 + Math.sin(a) * rr), f(rnd() * 360 - 180), ns[i], 0.5);
    }
    setHTML('sd-tk', t);
    setD('sd-ht', halftone({
      x: 300, y: 150, w: 600, h: 600, s: 13, ang: 45, tone: function (px, py) {
        var d1 = Math.hypot(px - 560, py - 400), d2 = Math.hypot(px - 596, py - 436);
        return (d1 > 252 && d2 < 276) ? 0.7 * (1 - (d2 / 276) * 0.4) : 0;
      }
    }));

    // GATEHOUSE: the gate roll from the sample (pass / hold / bar), held lines behind the portcullis, the Herald's chart
    var pick = [['rookimp41', 'that stamp was clean'], ['inkwarden42', 'just skip'], ['hollowmage83', 'CAPS CAPS CAPS CAPS'], ['fogwisp34', 'what is the ledger for?'], ['quillscribe20', 'buy cheap views [link removed]'], ['ledgerwarden18', 'malaLeft malaLeft'], ['cryptsmith42', 'when is the next draw?'], ['ashowl97', 'LEFT door']];
    var rows = '';
    pick.forEach(function (p, k) {
      var v = 'pass';
      if (S && S.chat) {
        var m = S.chat.filter(function (c) { return c.login === p[0] && c.text === p[1]; });
        if (m.length) { var vs = m.map(function (c) { return c.verdict; }); v = vs.indexOf('removed') >= 0 ? 'bar' : vs.indexOf('held') >= 0 ? 'hold' : 'pass'; }
      } else { v = ['pass', 'pass', 'bar', 'pass', 'bar', 'hold', 'hold', 'pass'][k]; }
      var y = 164 + k * 49, len = (p[0].length + 2 + p[1].length) * 10.6;
      rows += '<text x="84" y="' + y + '"><tspan font-weight="800">' + esc(p[0]) + '</tspan><tspan dx="12">' + esc(p[1]) + '</tspan></text>';
      if (v === 'bar') rows += '<path d="M80 ' + (y - 6) + 'H' + f(84 + len) + '" stroke="var(--gules)" stroke-width="3.5" fill="none"/><text class="ser" x="646" y="' + y + '" text-anchor="end" font-size="24" fill="var(--gules)" font-weight="700">bar</text>';
      else if (v === 'hold') rows += '<path d="M84 ' + (y + 10) + 'q8-8 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" stroke="var(--azure)" stroke-width="2.6" fill="none"/><rect x="584" y="' + (y - 24) + '" width="64" height="32" rx="16" fill="none" stroke="var(--azure)" stroke-width="3"/><text class="ser" x="616" y="' + (y + 0) + '" text-anchor="middle" font-size="22" fill="var(--press)" font-weight="700">hold</text>';
      else rows += '<text class="ser" x="646" y="' + y + '" text-anchor="end" font-size="24" fill="var(--press)" font-weight="700">pass</text>';
    });
    setHTML('pf-rows', rows);
    var held = (S && S.chat) ? S.chat.filter(function (c) { return c.verdict === 'held'; }).slice(-3) : [];
    var gh = '';
    held.forEach(function (m, k) {
      var y = -92 + k * 70, txt = m.text.length > 17 ? m.text.slice(0, 16) + '…' : m.text;
      gh += '<rect x="-114" y="' + y + '" width="228" height="44" rx="8" fill="var(--azure)" style="mix-blend-mode:multiply"/><text x="-100" y="' + (y + 28) + '" font-size="16" font-weight="700" fill="var(--press)" class="mono">' + esc(txt) + '</text>';
    });
    setHTML('gate-held', gh);
    var series = [['go-left', 'var(--azure)', 'go left'], ['hype', 'var(--or)', 'hype'], ['skip-boss', 'var(--gules)', 'skip the boss'], ['go-right', 'var(--press)', 'go right']];
    var cons = (S && S.consensus && S.consensus.length) ? S.consensus : null, ch = '', lg = '';
    if (cons) {
      var x0 = 456, x1 = 920, base = 904, top = 654, max = 60, n = cons.length, sx = (x1 - x0) / (n - 1), sy = (base - top) / max;
      [20, 40, 60].forEach(function (v) { ch += '<path d="M' + x0 + ' ' + f(base - v * sy) + 'H' + x1 + '" stroke="var(--press)" stroke-opacity=".28" stroke-width="1.2" stroke-dasharray="3 5"/><text x="' + (x0 - 6) + '" y="' + f(base - v * sy + 4) + '" text-anchor="end" font-size="14" font-weight="700" fill="var(--press-2)">' + v + '%</text>'; });
      series.forEach(function (sr) {
        var d = 'M' + x0 + ' ' + base;
        cons.forEach(function (c, k) { d += 'L' + f(x0 + k * sx) + ' ' + f(base - c[sr[0]] * sy); });
        d += 'L' + x1 + ' ' + base + 'Z';
        ch += '<path d="' + d + '" fill="' + sr[1] + '" fill-opacity=".86" style="mix-blend-mode:multiply"/>';
      });
      ch += '<path d="M' + x0 + ' ' + base + 'H' + x1 + '" stroke="var(--press)" stroke-width="2"/>';
      [0, 5, 10, 14].forEach(function (k) { ch += '<text x="' + f(x0 + k * sx) + '" y="' + (base + 18) + '" text-anchor="middle" font-size="14" font-weight="700" fill="var(--press-2)">' + (k === 14 ? 'now' : '−' + (14 - k) + ' min') + '</text>'; });
      var last = cons[n - 1];
      series.forEach(function (sr, k) {
        var lx = [420, 538, 642, 820][k];
        lg += '<rect x="' + lx + '" y="932" width="15" height="15" fill="' + sr[1] + '"/><text x="' + (lx + 20) + '" y="946">' + sr[2] + ' <tspan class="mono" font-weight="800">' + Math.round(last[sr[0]]) + '%</tspan></text>';
      });
    }
    setHTML('pf-chart', ch); setHTML('pf-legend', lg);

    // BEACONS: the brazier's glow and the contribution timeline with its dying blaze
    setD('si-ht', halftone({
      x: 40, y: 40, w: 500, h: 500, s: 13, ang: 45, tone: function (px, py) {
        var d = Math.hypot(px - 300, py - 290); if (d < 176 || d > 300) return 0;
        return Math.pow(1 - (d - 176) / 124, 1.3);
      }
    }));
    var C = (S && S.contributions && S.contributions.length) ? S.contributions : null, tm = '', lgd = '';
    if (C) {
      var tx0 = 176, tx1 = 922, tmax = 2900, ybase = 892, kinds = ['bits', 'sub', 'gift', 'points', 'hype_train'], kcol = { bits: 'var(--azure)', sub: 'var(--gules)', gift: 'var(--press)', points: 'var(--sheet)', hype_train: 'var(--orange)' };
      var klab = { bits: 'bits', sub: 'subs', gift: 'gifts', points: 'points', hype_train: 'hype' };
      var wt = function (c) { return c.kind === 'bits' ? c.amount / 120 : c.kind === 'sub' ? 1 : c.kind === 'gift' ? 0.6 * c.amount / 4 : c.kind === 'hype_train' ? 4 : 0; };
      var pts = [], mx = 0, tt;
      for (tt = 0; tt <= tmax; tt += 20) {
        var v = 0; C.forEach(function (c) { if (c.t <= tt) v += wt(c) * Math.pow(0.5, (tt - c.t) / 300); });
        pts.push([tt, v]); if (v > mx) mx = v;
      }
      var d = 'M' + tx0 + ' ' + ybase;
      pts.forEach(function (p) { d += 'L' + f(tx0 + p[0] / tmax * (tx1 - tx0)) + ' ' + f(ybase - p[1] / mx * 128); });
      d += 'L' + tx1 + ' ' + ybase + 'Z';
      tm += '<path d="' + d + '" fill="var(--press)"/>';
      tm += '<path d="M' + tx0 + ' ' + ybase + 'H' + tx1 + '" stroke="var(--press)" stroke-width="2"/>';
      [0, 10, 20, 30, 40].forEach(function (m) { var x = tx0 + m * 60 / tmax * (tx1 - tx0); tm += '<text x="' + f(x) + '" y="' + (ybase + 20) + '" text-anchor="middle" font-size="14" font-weight="700" fill="var(--press-2)">' + (m ? m + ' min' : '0') + '</text>'; });
      kinds.forEach(function (k, ki) {
        var y = 656 + ki * 21;
        tm += '<path d="M' + tx0 + ' ' + y + 'H' + tx1 + '" stroke="var(--press)" stroke-opacity=".16" stroke-width="1"/>';
        lgd += '<text x="84" y="' + (y + 4) + '" font-size="14" letter-spacing="1" font-weight="800">' + klab[k].toUpperCase() + '</text>';
        C.filter(function (c) { return c.kind === k; }).forEach(function (c) {
          var r = Math.max(3.2, Math.min(10, Math.sqrt(c.amount) * (k === 'points' ? 0.2 : k === 'sub' ? 3.2 : 0.42)));
          tm += '<circle cx="' + f(tx0 + c.t / tmax * (tx1 - tx0)) + '" cy="' + y + '" r="' + f(r) + '" fill="' + kcol[k] + '" stroke="var(--press)" stroke-width="' + (k === 'points' ? 1.6 : 0.8) + '"/>';
        });
      });
    }
    setHTML('si-time', tm); setHTML('si-legend', lgd);

    // MAP ROOM: the nine-by-six hex map in three inks, the phone preview and the Extension panel
    var hx = '', cells = hexGrid(9, 6, 44, 104, 108);
    cells.forEach(function (c) {
      var sd = side(c.c, c.r);
      hx += '<path d="' + hexD(c.x, c.y, 41.5) + '" fill="' + (SIDE_INK[sd] || 'none') + '" ' + (sd === 'fog' ? 'stroke="var(--cream)" stroke-opacity=".55" stroke-dasharray="4 5" stroke-width="2"' : 'stroke="var(--press)" stroke-width="3"') + '/>';
    });
    var sc = cells.filter(function (c) { return c.c === 4 && c.r === 2; })[0];
    if (sc) hx += '<path d="' + hexD(sc.x, sc.y, 41.5) + '" fill="none" stroke="var(--cream)" stroke-width="6"/><g stroke="var(--cream)" stroke-width="2.5" fill="none"><circle cx="' + sc.x + '" cy="' + sc.y + '" r="13"/><path d="M' + (sc.x - 28) + ' ' + sc.y + 'H' + (sc.x + 28) + 'M' + sc.x + ' ' + (sc.y - 28) + 'V' + (sc.y + 28) + '"/></g>';
    var a1 = cells.filter(function (c) { return c.c === 1 && c.r === 3; })[0], a2 = cells.filter(function (c) { return c.c === 3 && c.r === 2; })[0];
    if (a1 && a2) hx += '<path d="M' + a1.x + ' ' + a1.y + 'C' + (a1.x + 40) + ' ' + (a1.y - 70) + ' ' + (a2.x - 40) + ' ' + (a2.y - 70) + ' ' + (a2.x - 6) + ' ' + (a2.y - 4) + '" stroke="var(--cream)" stroke-width="4" stroke-dasharray="9 8" fill="none" stroke-linecap="round"/>';
    hx += '<text x="104" y="600" font-size="15" font-weight="800" letter-spacing="1.8" fill="var(--cream)">HEX MAP · 9 × 6 · THREE SIDES · TILE PICK EVERY 90 S</text>';
    setHTML('sl-hex', hx);
    var mini = function (r, ox, oy) {
      var o = '';
      hexGrid(9, 6, r, ox, oy).forEach(function (c) { var sd = side(c.c, c.r); o += '<path d="' + hexD(c.x, c.y, r * 0.92) + '" fill="' + (SIDE_INK[sd] || 'none') + '" ' + (sd === 'fog' ? 'stroke="var(--cream)" stroke-opacity=".5" stroke-width="1"' : 'stroke="var(--press)" stroke-width="1"') + '/>'; });
      return o;
    };
    setHTML('sl-mini', mini(11, 22, 20));
    setHTML('sl-panel', mini(8, 12, 12) + '<g font-size="10.5" font-weight="800" text-anchor="middle"><rect x="0" y="124" width="148" height="26" rx="5" fill="var(--azure)"/><text x="74" y="141" fill="var(--press)">MARCH</text><rect x="0" y="156" width="148" height="26" rx="5" fill="var(--or)"/><text x="74" y="173" fill="var(--press)">FORTIFY</text></g>');
  }

  /* ---------- focus (hover) + scenes ---------- */
  var M = { lots: 'lottery', gate: 'moderator', beacons: 'visuals', map: 'studio' }, ORDER = ['lots', 'gate', 'beacons', 'map'];
  var stage = D.getElementById('stage'), openM = null, trigger = null, pending = null;
  function setFocus(m) { if (stage && !openM) stage.setAttribute('data-focus', m || ''); }
  function bindFocusable(el, m) {
    el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') setFocus(m); });
    el.addEventListener('pointerleave', function () { if (D.activeElement !== el) setFocus(''); });
    el.addEventListener('focus', function () { setFocus(m); });
    el.addEventListener('blur', function () { setFocus(''); });
  }
  function bindFocus() {
    $$('.hit').forEach(function (h) {
      var m = h.getAttribute('data-m');
      bindFocusable(h, m);
      h.addEventListener('click', function (e) { e.preventDefault(); pending = h; openByHash(m); });
    });
    $$('.colorbar .sw[data-m]').forEach(function (a) { bindFocusable(a, a.getAttribute('data-m')); });
    $$('.strip').forEach(function (b) { b.addEventListener('click', function () { pending = b; openByHash(b.getAttribute('data-m')); }); });
  }
  function origin(el) {
    if (!el) return [W.innerWidth / 2, W.innerHeight / 2];
    var r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }
  function openByHash(m) { if (location.hash === '#' + m) { applyHash(); } else { location.hash = m; } }
  var zTop = 50;
  function doOpen(m) {
    var sc = D.getElementById('scene-' + m); if (!sc || openM === m) return;
    var prevScene = openM ? D.getElementById('scene-' + openM) : null;
    if (prevScene) { prevScene.classList.add('is-under'); setTimeout(function () { if (openM !== prevScene.id.replace('scene-', '')) { prevScene.classList.remove('is-open', 'is-under'); prevScene.setAttribute('inert', ''); prevScene.style.zIndex = ''; } }, reduced ? 300 : 1050); }
    sc.style.zIndex = String(++zTop);
    if (!prevScene) trigger = pending || null;
    pending = null;
    var o = prevScene ? [W.innerWidth / 2, W.innerHeight / 2] : origin(trigger);
    sc.style.setProperty('--ox', o[0] + 'px'); sc.style.setProperty('--oy', o[1] + 'px');
    sc.removeAttribute('inert');
    void sc.offsetWidth;
    sc.classList.add('is-open');
    if (stage) { stage.setAttribute('data-open', m); stage.setAttribute('data-focus', ''); }
    D.body.classList.add('scene-open');
    ['main', '.foot'].forEach(function (q) { var e = $(q); if (e) e.setAttribute('inert', ''); });
    openM = m;
    setTimeout(function () { var b = $('.back', sc); if (b && openM === m) b.focus({ preventScroll: true }); }, 420);
  }
  function doClose(silent) {
    if (!openM) return;
    var sc = D.getElementById('scene-' + openM);
    if (sc) { sc.classList.remove('is-open'); sc.setAttribute('inert', ''); setTimeout(function () { if (!sc.classList.contains('is-open')) sc.style.zIndex = ''; }, 1100); var cp = $('.scene-copy', sc); if (cp) cp.scrollTop = 0; }
    if (stage) stage.removeAttribute('data-open');
    D.body.classList.remove('scene-open');
    ['main', '.foot'].forEach(function (q) { var e = $(q); if (e) e.removeAttribute('inert'); });
    openM = null;
    if (!silent && trigger && trigger.focus) { try { trigger.focus({ preventScroll: true }); } catch (e) { } }
  }
  function applyHash() {
    var h = (location.hash || '').replace('#', '');
    if (M[h]) doOpen(h); else doClose();
  }
  function closeScene() {
    if (!openM) return;
    try { W.history.replaceState(null, '', location.pathname + location.search); } catch (e) { if (location.hash) { location.hash = ''; return; } }
    doClose();
  }
  W.addEventListener('hashchange', applyHash);
  W.addEventListener('popstate', applyHash);
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { pending = b; location.hash = b.getAttribute('data-go'); }); });
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', closeScene); });

  /* the one keymap of the landing: Esc goes back a level, arrows walk the chambers, 1-4 open one */
  var KEYMAP = [
    { key: 'Escape', when: function () { return !!openM; }, run: closeScene },
    { key: 'ArrowRight', when: function () { return !!openM; }, run: function () { location.hash = ORDER[(ORDER.indexOf(openM) + 1) % 4]; } },
    { key: 'ArrowLeft', when: function () { return !!openM; }, run: function () { location.hash = ORDER[(ORDER.indexOf(openM) + 3) % 4]; } }
  ].concat(ORDER.map(function (m, i) { return { key: String(i + 1), when: function () { return true; }, run: function () { pending = null; openByHash(m); } }; }));
  D.addEventListener('keydown', function (e) {
    var t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = KEYMAP.filter(function (m) { return m.key === e.key && m.when(); })[0];
    if (k) { e.preventDefault(); pending = null; k.run(); }
  });
  $$('[data-more]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.closest('.scene-copy').querySelector('.full'), open = box.hasAttribute('hidden');
      if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.textContent = open ? 'Hide the feature list' : 'Full feature list';
      if (open) setTimeout(function () { box.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }, 30);
    });
  });

  /* ---------- theme: shared with the app through its saved state ---------- */
  var LS = 'cc.state.v1', tb = D.getElementById('theme');
  function readState() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function syncTheme() {
    var stock = D.documentElement.getAttribute('data-theme') === 'stock';
    if (tb) { tb.setAttribute('aria-pressed', stock ? 'true' : 'false'); var sp = tb.querySelector('span'); if (sp) sp.textContent = stock ? 'Paper' : 'Dark stock'; }
  }
  if (tb) tb.addEventListener('click', function () {
    var nx = D.documentElement.getAttribute('data-theme') === 'stock' ? 'paper' : 'stock', st = readState();
    D.documentElement.setAttribute('data-theme', nx);
    st.theme = nx;
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { }
    syncTheme();
  });
  syncTheme();

  /* ---------- intro: the plates snap into register, then the drawbridge drops; skippable ---------- */
  var introT = 0, body = D.body;
  function finishIntro() { clearTimeout(introT); body.setAttribute('data-phase', 'done'); }
  function startIntro() {
    if (body.getAttribute('data-phase') !== 'pre') return;
    W.requestAnimationFrame(function () { W.requestAnimationFrame(function () {
      body.setAttribute('data-phase', 'run');
      introT = setTimeout(finishIntro, 3000);
    }); });
    var skip = D.getElementById('skip');
    if (skip) skip.addEventListener('click', finishIntro);
    ['keydown', 'pointerdown'].forEach(function (ev) { W.addEventListener(ev, function once() { W.removeEventListener(ev, once, true); if (body.getAttribute('data-phase') !== 'done') finishIntro(); }, true); });
  }

  /* ---------- pointer parallax: the plates slip a little against each other ---------- */
  function parallax() {
    if (reduced || !stage || !W.matchMedia('(hover:hover)').matches) return;
    var layers = $$('.stage .plate, .stage .type'), depth = layers.map(function (el) { return el.classList.contains('type') ? 2 : (parseFloat(W.getComputedStyle(el).getPropertyValue('--d')) || 0); });
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, box = null;
    function measure() { box = stage.getBoundingClientRect(); }
    function tick() {
      cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
      for (var i = 0; i < layers.length; i++) layers[i].style.translate = (cx * depth[i]).toFixed(2) + 'px ' + (cy * depth[i]).toFixed(2) + 'px';
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.003 && !D.hidden) raf = W.requestAnimationFrame(tick); else raf = 0;
    }
    measure(); W.addEventListener('resize', measure);
    D.addEventListener('pointermove', function (e) {
      if (openM || e.pointerType === 'touch') return;
      tx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / (box.width / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / (box.height / 2)));
      if (!raf) raf = W.requestAnimationFrame(tick);
    }, { passive: true });
  }

  /* ---------- mobile wordmark (two lines) ---------- */
  function mobileWord() {
    var el = D.getElementById('m-wm'); if (!el) return;
    var a = word('CASTLE'), b = word('CONTROL'), s = 340 / b.w, lh = 100 * s + 12, g = '';
    el.setAttribute('viewBox', '0 0 344 ' + f(lh + 100 * s + 4));
    g += '<g style="fill:var(--gules)" transform="translate(3 3) scale(' + s.toFixed(4) + ')">' + a.svg + '</g>';
    g += '<g style="fill:var(--gules)" transform="translate(3 ' + f(3 + lh) + ') scale(' + s.toFixed(4) + ')">' + b.svg + '</g>';
    g += '<g style="fill:var(--key)" transform="scale(' + s.toFixed(4) + ')">' + a.svg + '</g>';
    g += '<g style="fill:var(--key)" transform="translate(0 ' + f(lh) + ') scale(' + s.toFixed(4) + ')">' + b.svg + '</g>';
    el.innerHTML = g;
  }

  /* ---------- go ---------- */
  guard(fillWords);
  guard(buildPoster);
  guard(buildScenes);
  guard(mobileWord);
  guard(bindFocus);
  guard(parallax);
  guard(function () {
    var sl = D.getElementById('sample-line');
    if (sl && S && S.channel) sl.textContent = 'fictional channel · ' + S.channel.viewers + ' viewers · tier ' + S.channel.room_tier;
  });
  if (location.hash && M[location.hash.replace('#', '')]) { body.setAttribute('data-phase', 'done'); W.requestAnimationFrame(applyHash); }
  else startIntro();
})();
