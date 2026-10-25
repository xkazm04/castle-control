/* Castle Control app shell: state, masthead (the rampart), chambers column, the Steward (co-pilot), keymap, helpers. Classic script, file:// safe. */
(function () {
  'use strict';
  var S = window.SAMPLE || null;
  var LS = 'cc.state.v1';
  var CC = (window.CC = window.CC || {});
  CC.S = S;

  /* ---------- helpers ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  CC.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  CC.$ = function (sel, root) { return (root || document).querySelector(sel); };
  CC.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  CC.fmt = {
    n: function (x) { return Number(x).toLocaleString('en-US'); },
    pad: function (n) { return (n < 10 ? '0' : '') + n; },
    clock: function (sec) { sec = Math.max(0, Math.floor(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return CC.fmt.pad(h) + ':' + CC.fmt.pad(m) + ':' + CC.fmt.pad(s); },
    ms: function (sec) { sec = Math.max(0, Math.floor(sec)); return CC.fmt.pad(Math.floor(sec / 60)) + ':' + CC.fmt.pad(sec % 60); }
  };
  CC.mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  CC.hashInt = function (str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* SHA-256 (sync, public-domain style) so seals and casts can really be recomputed offline */
  var sha = function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, mw = mp(2, 32), i, j, result = '', words = [], abl = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {};
    for (var c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (mp(c, .5) * mw) | 0; k[pc++] = (mp(c, 1 / 3) * mw) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((abl / mw) | 0); words[words.length] = abl;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash; hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
    return result;
  };
  CC.sha256 = function (s) { return sha(unescape(encodeURIComponent(String(s)))); };

  /* ---------- state ---------- */
  var DEF = { theme: 'paper', live: true, twitch: 'connected', obs: 'connected', editor: null, rules: {}, params: { capsPct: 70, capsMin: 20, spamN: 3, spamWin: 30, newDays: 7 }, shield: false, delay: 2, t0: 0, resolved: {}, ledger: [], tilt: null };
  function load() {
    var st = {};
    try { st = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { st = {}; }
    var o = {}; for (var k in DEF) o[k] = DEF[k];
    for (k in st) o[k] = st[k];
    o.params = Object.assign({}, DEF.params, st.params || {});
    if (S && S.moderator) S.moderator.rules.forEach(function (r) { if (!o.rules[r.id]) o.rules[r.id] = r.mode; });
    if (!o.t0) o.t0 = Date.now() - 8077000; // 02:14:37 into the stream
    return o;
  }
  var state = (CC.state = load());
  var listeners = [];
  CC.save = function () { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { } };
  CC.on = function (fn) { listeners.push(fn); };
  CC.set = function (patch, silent) {
    for (var k in patch) state[k] = patch[k];
    CC.save(); if (!silent) { applyState(); listeners.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } }); }
  };
  CC.setRule = function (id, mode) { state.rules[id] = mode; CC.set({ rules: state.rules }); };
  window.addEventListener('storage', function (e) { if (e.key === LS) { state = CC.state = load(); applyState(); listeners.forEach(function (f) { f(state); }); } });
  CC.counts = function () {
    var a = 0, p = 0; Object.keys(state.rules).forEach(function (k) { if (state.rules[k] === 'armed') a++; else p++; });
    return { armed: a, shadow: p, total: a + p };
  };
  CC.every = function (fn, ms) { var id = setInterval(function () { if (!document.hidden) fn(); }, ms); return id; };

  /* ---------- icons (custom drawn, 20x20, stroke) ---------- */
  var IC = {
    watch: '<path d="M2.5 11.5s2.8-4.3 7.5-4.3 7.5 4.3 7.5 4.3-2.8 4.3-7.5 4.3-7.5-4.3-7.5-4.3z"/><circle cx="10" cy="11.5" r="2"/><path d="M3.5 3.2h2.3v1.6h2.6V3.2h3.2v1.6h2.6V3.2h2.3"/>',
    armed: '<path d="M4 4l10.5 10.5M16 4L5.5 14.5M12.4 16.6l4.2-4.2M3.4 12.4l4.2 4.2"/>',
    portcullis: '<path d="M4 17V8.5a6 6 0 0 1 12 0V17"/><path d="M7 4.6V17M10 3.6V17M13 4.6V17M4 10.5h12M4 14h12"/>',
    pass: '<path d="M4 17V8.5a6 6 0 0 1 12 0V17"/><path d="M6.8 12.5h6.4M10.8 10l2.5 2.5-2.5 2.5"/>',
    seal: '<circle cx="10" cy="8.6" r="5.4"/><path d="M7.6 13.2 6.4 17.6l2.4-1.3L10 18l1.2-1.7 2.4 1.3-1.2-4.4"/><path d="M7.9 8.7l1.5 1.5 2.8-3"/>',
    tower: '<path d="M5 17.5V3.5h2.2v2h2V3.5h1.6v2h2V3.5H15v14z"/><path d="M8.4 17.5v-3.2a1.6 1.6 0 0 1 3.2 0v3.2M9.2 8.5h1.6"/>',
    scroll: '<path d="M6.2 3.5h9.3v10.8a2.2 2.2 0 0 1-2.2 2.2H5"/><path d="M6.2 3.5A1.9 1.9 0 0 0 4.3 5.4V7h1.9M5 16.5a2.1 2.1 0 0 0 1.2-1.9V3.5M9 7.5h3.8M9 10.5h3.8"/>',
    flag: '<path d="M5 18V2.5M5 3.5h10.5l-2.6 3.1 2.6 3.1H5"/>',
    ticket: '<path d="M3 5.5h14V9a1.5 1.5 0 0 0 0 3v3.5H3V12a1.5 1.5 0 0 0 0-3z"/><path d="M7.5 5.5v10" stroke-dasharray="1.6 1.8"/>',
    hex: '<path d="M10 2.2l6.8 3.9v7.8L10 17.8l-6.8-3.9V6.1z"/>',
    beacon: '<path d="M10 2.4c2.3 2.5 3.4 4.1 3.4 5.8a3.4 3.4 0 0 1-6.8 0c0-1.7 1.1-3.3 3.4-5.8z"/><path d="M3.8 11.6h12.4l-2 3.4H5.8zM8 15l-1.1 2.6M12 15l1.1 2.6"/>',
    brazier: '<path d="M3.8 11.6h12.4l-2 3.4H5.8zM8 15l-1.1 2.6M12 15l1.1 2.6"/><path d="M8.2 9.2c.6-1 1.5-1.1 1.9-2.3M11.4 9.2c.4-.7.9-.9 1.1-1.6" stroke-dasharray="1.4 1.6"/>',
    bubble: '<path d="M3.5 4h13v9h-7l-3.5 3v-3h-2.5z"/>',
    frame: '<rect x="3" y="4" width="14" height="12" rx="1"/><rect x="6.2" y="7" width="7.6" height="6"/>',
    lock: '<rect x="4" y="9" width="12" height="8" rx="1"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
    unlock: '<rect x="4" y="9" width="12" height="8" rx="1"/><path d="M7 9V6.5a3 3 0 0 1 5.6-1.4"/>',
    copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1"/><path d="M13 7V4.5H4.5V13H7"/>',
    check: '<path d="M4 10.5l4 4 8-9"/>',
    x: '<path d="M5 5l10 10M15 5L5 15"/>',
    bar: '<rect x="4.5" y="3.5" width="11" height="13.5" rx="1"/><path d="M2.5 10.2h15M10 3.5v13.5"/>',
    hold: '<path d="M5.5 3h9M5.5 17h9M6.6 3c0 3.8 6.8 4.2 6.8 7s-6.8 3.2-6.8 7M13.4 3c0 3.8-6.8 4.2-6.8 7s6.8 3.2 6.8 7"/>',
    tear: '<path d="M5 3.5h10V9l-2.5 1.4L10 9l-2.5 1.4L5 9z"/><path d="M5 12.2l2.5-1.4L10 12.2l2.5-1.4 2.5 1.4v4.3H5z"/>',
    play: '<path d="M6 4l10 6-10 6z"/>',
    pause: '<path d="M6 4v12M14 4v12"/>',
    clock: '<circle cx="10" cy="10" r="7"/><path d="M10 5.8V10l3 2"/>',
    shield: '<path d="M10 2.4l6.6 2.6v4.6c0 3.8-2.8 6.6-6.6 8-3.8-1.4-6.6-4.2-6.6-8V5z"/>',
    back: '<path d="M16 10H4.5M9.5 5l-5 5 5 5"/>',
    theme: '<circle cx="10" cy="10" r="6.3"/><path d="M10 3.7a6.3 6.3 0 0 0 0 12.6z" fill="currentColor"/>',
    quill: '<path d="M16.8 3.2C10.6 3.6 7 7.6 6 13.4L3.6 17"/><path d="M16.8 3.2c-.6 5.2-3.7 8.7-9.3 9.7M9.4 10.4l2.8-.6M11.6 7.6l2.4-.4"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    minus: '<path d="M4 10h12"/>',
    chev: '<path d="M5 7.5l5 5 5-5"/>',
    undo: '<path d="M5 8.5h7.5a3.8 3.8 0 0 1 0 7.6H8"/><path d="M8.2 5L5 8.5l3.2 3.5"/>',
    download: '<path d="M10 3v9M6 8.8l4 4 4-4M4 16.5h12"/>',
    sliders: '<path d="M3 6h14M3 14h14"/><circle cx="7" cy="6" r="2" fill="var(--paper)"/><circle cx="13" cy="14" r="2" fill="var(--paper)"/>',
    eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.3"/>',
    star: '<path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/>',
    bolt: '<path d="M11 2.5L4.5 11H9.5L8.5 17.5 15.5 8.5H10.5z"/>',
    gift: '<rect x="3.5" y="8" width="13" height="8.5"/><path d="M2.8 5.5h14.4V8H2.8zM10 5.5v11M10 5.5C8 2.5 5.5 3.6 6.3 5.5M10 5.5c2-3 4.5-1.9 3.7 0"/>',
    coin: '<circle cx="10" cy="10" r="7"/><path d="M10 6v8M7.6 8c0-1 1-1.6 2.4-1.6s2.4.6 2.4 1.6-1 1.4-2.4 1.6-2.4.6-2.4 1.6S8.6 13.6 10 13.6s2.4-.6 2.4-1.6"/>',
    train: '<path d="M3 12.5h14M4.5 12.5V7.5h11v5M7 7.5V5h6v2.5"/><circle cx="6.5" cy="15" r="1.3"/><circle cx="13.5" cy="15" r="1.3"/>',
    book: '<path d="M3.5 4.5c2.5-1 4.7-.8 6.5.8 1.8-1.6 4-1.8 6.5-.8v10.8c-2.5-1-4.7-.8-6.5.8-1.8-1.6-4-1.8-6.5-.8z"/><path d="M10 5.3v10.8"/>',
    link: '<path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.5-2.5a3.2 3.2 0 0 0-4.5-4.5L9.8 5.7M11.5 8.5a3.2 3.2 0 0 0-4.5 0L4.5 11a3.2 3.2 0 0 0 4.5 4.5l1.2-1.2"/>',
    phone: '<rect x="6" y="2.5" width="8" height="15" rx="1.6"/><path d="M9 15h2"/>',
    desktop: '<rect x="2.5" y="4" width="15" height="10" rx="1"/><path d="M7.5 17h5M10 14v3"/>'
  };
  CC.icon = function (n, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  };
  /* registration mark: filled = connected, hollow = down, half = reconnecting */
  CC.reg = function (st) {
    var col = st === 'connected' ? 'var(--ok)' : st === 'down' ? 'var(--danger)' : 'var(--warn)';
    var fill = st === 'connected' ? '<circle cx="10" cy="10" r="5.2" fill="' + col + '" stroke="none"/>' :
      st === 'reconnecting' ? '<path d="M10 4.8a5.2 5.2 0 0 0 0 10.4z" fill="' + col + '" stroke="none"/>' : '';
    return '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="' + col + '" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="5.2"/>' + fill + '<path d="M10 1v18M1 10h18" stroke="var(--ink)" stroke-width="1.1"/>' + (st === 'connected' ? '<path d="M10 6.6v6.8M6.6 10h6.8" stroke="var(--paper)" stroke-width="1.3"/>' : '') + '</svg>';
  };

  /* ---------- toast ---------- */
  CC.toast = function (msg) {
    var box = CC.$('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 320); }, 2600);
  };
  CC.copy = function (text, msg) {
    function done() { CC.toast(msg || 'Copied'); }
    try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fb); return; } } catch (e) { }
    fb();
    function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); done(); }
  };
  CC.flash = function (el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };

  /* ---------- shell ---------- */
  var MODS = [
    { id: 'lottery', no: 1, key: '1', name: 'Lot Chamber', fn: 'lottery manager', href: 'lottery.html' },
    { id: 'moderator', no: 2, key: '2', name: 'Gatehouse', fn: 'AI moderator', href: 'moderator.html' },
    { id: 'visuals', no: 3, key: '3', name: 'Beacons', fn: 'contribution visuals', href: 'visuals.html' },
    { id: 'studio', no: 4, key: '4', name: 'Map Room', fn: 'Extension studio', href: 'studio.html' }
  ];
  CC.MODS = MODS;
  /* the one keymap: every global key the app answers, in one table */
  var KEYMAP = MODS.map(function (m) { return { key: m.key, label: m.name + ' · ' + m.fn, run: function () { if (m.id !== cur) location.href = m.href; } }; }).concat([
    { key: '/', label: 'Ask the Steward', run: function () { CC.toggleSteward(true); setTimeout(function () { CC.$('#ed-in').focus(); }, 60); } },
    { key: 'Escape', always: true, label: 'Close the demo panel', run: function (c) { if (!c.pop.hidden) { c.pop.hidden = true; c.btn.focus(); } } }
  ]);
  CC.KEYMAP = KEYMAP;
  var cur = document.body.getAttribute('data-module') || 'lottery';

  function viewers() { var base = S && S.channel ? S.channel.viewers : 214; var t = Date.now(); return base + Math.round(2 * Math.sin(t / 9000) + 1.4 * Math.sin(t / 3100)); }
  function uptime() { return CC.fmt.clock((Date.now() - state.t0) / 1000); }
  CC.heldPending = function () {
    var all = CC.heldAll(); return all.filter(function (m) { return !state.resolved[m.key]; });
  };
  CC.heldAll = function () {
    if (!S) return [];
    var held = S.chat.map(function (m, i) { m.i = i; return m; }).filter(function (m) { return m.verdict === 'held'; });
    var n = (S.moderator && S.moderator.held_queue) || 3;
    return held.slice(-n).map(function (m) { return { key: 'h' + m.i, t: m.t, login: m.login, text: m.text, direction: m.direction }; });
  };

  function shellHTML() {
    var h = '';
    h += '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs></defs></svg>';
    h += '<header class="masthead" role="banner">' +
      '<a class="brand" href="index.html" aria-label="Castle Control, the whole keep">' + CC.markSVG() + '<span class="wm" data-t="Castle&#10;Control">Castle<br>Control</span></a>' +
      '<div class="mh-group" id="mh-air"></div><span class="mh-sep"></span>' +
      '<div class="mh-group" id="mh-links"></div>' +
      '<a class="modchip" id="mh-mod" href="moderator.html"></a>' +
      '<span class="mh-spacer"></span>' +
      '<span class="tag-sample" title="Fictional channel, invented numbers">Sample data</span>' +
      '<div class="demo"><button class="btn icon" id="btn-demo" aria-haspopup="true" aria-expanded="false" title="Demo state: flip live, Twitch and OBS" aria-label="Demo state">' + CC.icon('sliders') + '</button><div class="pop" id="pop-demo" hidden></div></div>' +
      '<button class="btn icon" id="btn-theme" title="Paper / dark stock" aria-label="Toggle paper and dark stock">' + CC.icon('theme') + '</button>' +
      '<button class="btn" id="btn-ed" aria-controls="editor" title="Ask the Steward (/)">' + CC.icon('quill') + 'Steward</button>' +
      '</header>';
    h += '<div class="banner" id="banner" role="status"></div>';
    h += '<nav class="contents" aria-label="The four chambers"><div class="kicker">Chambers · keys 1–4</div>';
    MODS.forEach(function (m) {
      h += '<a class="plate-link" data-module="' + m.id + '" href="' + m.href + '"' + (m.id === cur ? ' aria-current="page"' : '') + '><span class="no">' + m.no + '</span><span class="tx"><b>' + m.name + '</b><i>' + m.fn + '</i><em data-fig="' + m.id + '"></em></span></a>';
    });
    h += '<div class="also"><a href="index.html">' + CC.icon('tower') + 'The whole keep</a><a href="brand.html">' + CC.icon('book') + 'Brand sheet</a></div>';
    h += '<div class="now" id="nowblock"></div><div class="colorbar" aria-hidden="true"><i></i><i></i><i></i><i></i></div></nav>';
    h += '<div class="page-wrap" id="page-wrap"></div>';
    h += '<aside class="editor" id="editor" aria-label="The Steward, optional co-pilot"><div class="editor-in">' +
      '<div class="ed-head"><h3>' + CC.icon('quill') + 'The Steward</h3><p>Tell it what you want in plain words. It drafts a writ; nothing changes until you seal it. Every chamber works without a steward.</p>' +
      '<div class="ed-eng"><span class="kicker" style="white-space:nowrap">Runs on</span><select id="ed-engine" aria-label="Steward engine"><option>your own AI CLI</option><option>a local model</option><option>an API key</option></select></div></div>' +
      '<div class="ed-log" id="ed-log" aria-live="polite"></div>' +
      '<div class="ed-foot"><textarea id="ed-in" rows="2" placeholder="Ask the Steward…" aria-label="Ask the Steward"></textarea>' +
      '<div class="row"><small>Prototype: replies are canned, no model is called. Enter sends.</small><button class="btn primary sm" id="ed-send">Send</button></div></div>' +
      '</div></aside>';
    return h;
  }

  function mountShell() {
    var main = document.getElementById('page');
    var shell = document.createElement('div'); shell.className = 'shell'; shell.id = 'shell';
    shell.innerHTML = shellHTML();
    document.body.insertBefore(shell, document.body.firstChild);
    CC.$('#page-wrap').appendChild(main);
    CC.$('#btn-theme').addEventListener('click', function () { CC.set({ theme: state.theme === 'stock' ? 'paper' : 'stock' }); });
    CC.$('#btn-ed').addEventListener('click', function () { CC.toggleSteward(); });
    var btn = CC.$('#btn-demo'), pop = CC.$('#pop-demo');
    btn.addEventListener('click', function (e) { e.stopPropagation(); var open = pop.hidden; pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) renderDemo(); });
    document.addEventListener('click', function (e) { var path = e.composedPath ? e.composedPath() : [], inside = path.indexOf(pop) >= 0 || path.indexOf(btn) >= 0 || pop.contains(e.target) || e.target === btn; if (!pop.hidden && !inside) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      var k = KEYMAP.filter(function (m) { return m.key === e.key && (m.always || !typing) && !e.ctrlKey && !e.metaKey && !e.altKey; })[0];
      if (k) { e.preventDefault(); k.run({ pop: pop, btn: btn }); }
    });
    // footer
    var f = document.createElement('footer'); f.className = 'footer';
    f.innerHTML = '<span><b>Castle Control</b> is a working name, not a registered trademark. Free and open source. Not affiliated with Twitch.</span><span>Sample data: fictional channel, invented numbers.</span><span class="kicker" style="align-self:center">Chamber ' + (MODS.filter(function (m) { return m.id === cur; })[0] || { no: 1 }).no + ' of 4</span><div class="colorbar" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
    main.appendChild(f);
    applyState();
  }

  function renderDemo() {
    var pop = CC.$('#pop-demo');
    function seg(key, opts) {
      return '<div class="seg2" role="group" aria-label="' + key + '">' + opts.map(function (o) { return '<button data-k="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(state[key]) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    }
    pop.innerHTML = '<h4>Demo state · sample data</h4>' +
      '<div class="row"><label>Stream</label>' + seg('live', [[true, 'Live'], [false, 'Offline']]) + '</div>' +
      '<div class="row"><label>Twitch</label>' + seg('twitch', [['connected', 'OK'], ['reconnecting', 'Retry'], ['down', 'Down']]) + '</div>' +
      '<div class="row"><label>OBS</label>' + seg('obs', [['connected', 'OK'], ['reconnecting', 'Retry'], ['down', 'Down']]) + '</div>' +
      '<div class="row"><label>Drawbridge <span class="muted">(Shield Mode)</span></label>' + seg('shield', [[false, 'Down'], [true, 'Up']]) + '</div>' +
      '<div class="row" style="border-top:1px solid var(--hair-2)"><span class="hint" style="max-width:150px">Flips the status on every page.</span><button class="btn sm ghost" id="demo-reset">Reset demo</button></div>';
    CC.$$('button[data-k]', pop).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
        var val = (k === 'live' || k === 'shield') ? v === 'true' : v;
        var patch = {}; patch[k] = val;
        if (k === 'live' && val) patch.t0 = Date.now() - 8077000;
        CC.set(patch); renderDemo();
      });
    });
    CC.$('#demo-reset').addEventListener('click', function () {
      try { localStorage.removeItem(LS); } catch (e) { }
      var fresh = load(); for (var k in fresh) state[k] = fresh[k]; CC.set({}); renderDemo(); CC.toast('Demo state reset');
    });
  }

  function applyState() {
    var root = document.documentElement;
    if (state.theme === 'stock') root.setAttribute('data-theme', 'stock'); else root.removeAttribute('data-theme');
    document.body.setAttribute('data-live', state.live ? '1' : '0');
    document.body.setAttribute('data-twitch', state.twitch);
    document.body.setAttribute('data-obs', state.obs);
    var air = CC.$('#mh-air'); if (!air) return;
    air.innerHTML = (state.live ? '<span class="stamp" title="The stream is live"><i class="dot"></i>On air</span><span class="fig"><b id="f-view">' + viewers() + '</b><small>viewers</small></span><span class="fig"><b id="f-up">' + uptime() + '</b><small>uptime</small></span>' :
      '<span class="stamp off" title="The stream is offline"><i class="dot"></i>Offline</span><span class="fig"><b>—</b><small>viewers</small></span><span class="fig"><b>—</b><small>uptime</small></span>');
    var lab = { connected: 'connected', reconnecting: 'reconnecting', down: 'disconnected' };
    CC.$('#mh-links').innerHTML =
      '<div class="link ' + (state.twitch === 'down' ? 'is-down' : state.twitch === 'reconnecting' ? 'is-re' : '') + '" title="Twitch link (EventSub + Helix)">' + CC.reg(state.twitch) + '<span><b>Twitch</b><small>' + lab[state.twitch] + '</small></span></div>' +
      '<div class="link ' + (state.obs === 'down' ? 'is-down' : state.obs === 'reconnecting' ? 'is-re' : '') + '" title="OBS link (browser source feeds)">' + CC.reg(state.obs) + '<span><b>OBS</b><small>' + lab[state.obs] + '</small></span></div>';
    var c = CC.counts(), chip = CC.$('#mh-mod');
    chip.className = 'modchip' + (state.shield ? ' shield' : '');
    var t;
    if (c.armed && c.shadow) t = '<span class="seg on">' + CC.icon('armed') + 'Armed <b>' + c.armed + '</b></span><span class="seg pr">' + CC.icon('watch') + 'Watching <b>' + c.shadow + '</b></span>';
    else if (c.armed) t = '<span class="seg on">' + CC.icon('armed') + 'Armed <b>' + c.armed + '</b></span>';
    else t = '<span class="seg pr">' + CC.icon('watch') + 'Watching <b>' + c.shadow + '</b></span>';
    if (state.shield) t = '<span class="seg shieldseg">' + CC.icon('portcullis') + '<span class="t">Bridge up</span></span>' + t;
    chip.innerHTML = t;
    chip.title = state.shield ? 'Drawbridge up: Shield Mode is on, the room is locked down.' : 'Moderator: ' + c.armed + ' rules armed (they act), ' + c.shadow + ' watching (shadow: they say what they would do and change nothing). Open the Gatehouse.';
    chip.setAttribute('aria-label', chip.title);
    // banner
    var b = CC.$('#banner'), msg = '', cls = 'info';
    if (state.twitch !== 'connected') { cls = 'bad'; msg = '<b>Twitch ' + lab[state.twitch] + '</b> EventSub does not replay what it missed: chat, draws and tallies pause until the link is back, and missed events are not recovered.'; }
    else if (!state.live) { cls = 'info'; msg = '<b>Offline</b> Previews and drills only. Nothing reaches an audience, and live figures are paused.'; }
    else if (state.obs !== 'connected') { cls = 'warn'; msg = '<b>OBS ' + lab[state.obs] + '</b> Browser-source feeds still render at their URLs; scene control from here is off until OBS is back.'; }
    b.className = 'banner' + (msg ? ' show ' + cls : ''); b.innerHTML = msg;
    refreshFigs();
    // editor open state
    var sh = CC.$('#shell'), open = state.editor === null ? window.innerWidth >= 1600 : !!state.editor;
    sh.classList.toggle('editor-open', open);
    var be = CC.$('#btn-ed'); if (be) { be.setAttribute('aria-expanded', String(open)); be.classList.toggle('on', open); }
  }

  function refreshFigs() {
    if (!S) return;
    var f = CC.$('#f-view'); if (f && state.live) f.textContent = viewers();
    f = CC.$('#f-up'); if (f && state.live) f.textContent = uptime();
    var figs = {
      lottery: S.lottery.draws.length + ' draws · ' + S.lottery.draws[0].entries + ' lots',
      moderator: CC.heldPending().length + ' held · ' + CC.counts().shadow + ' watching',
      visuals: S.visuals.length + ' lit · ' + S.contributions.length + ' events',
      studio: S.studio.hexmap.cols + '×' + S.studio.hexmap.rows + ' hex · ' + (/hosted/.test(S.studio.hexmap.test_stage) ? 'muster' : 'sand table')
    };
    CC.$$('[data-fig]').forEach(function (e) { e.textContent = figs[e.getAttribute('data-fig')]; });
    var nb = CC.$('#nowblock');
    if (nb) nb.innerHTML = 'The hall now<br><b>' + S.channel.viewers + '</b> viewers · <b>' + S.channel.chatters_last_10min + '</b> chatters / 10 min<br>Tier <b>' + S.channel.room_tier + '</b> · moat <b>' + state.delay + ' s</b>';
  }
  CC.refreshFigs = refreshFigs;
  CC.every(function () { var f = CC.$('#f-view'); if (f && state.live) f.textContent = viewers(); f = CC.$('#f-up'); if (f && state.live) f.textContent = uptime(); }, 1000);

  CC.toggleSteward = function (force) {
    var open = typeof force === 'boolean' ? force : !CC.$('#shell').classList.contains('editor-open');
    CC.set({ editor: open });
  };

  /* ---------- crumbs / router ---------- */
  CC.crumbs = function (arr) {
    var c = CC.$('.folio .crumbs'); if (!c) return;
    c.innerHTML = (arr || []).map(function (a, i) { return '<span>›</span>' + (a.href ? '<a href="' + a.href + '">' + CC.esc(a.t) + '</a>' : '<b>' + CC.esc(a.t) + '</b>'); }).join('');
  };
  CC.router = function (views, onChange) {
    function parse() { var h = location.hash.replace(/^#/, ''); var p = h.split('/'); return { name: p[0] || 'main', arg: p[1] || null }; }
    function render() {
      var r = parse(); var name = views[r.name] ? r.name : 'main';
      Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
      onChange && onChange(name, r.arg);
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', render); render();
  };
  CC.go = function (h) { location.hash = h || ''; if (!h) { try { history.replaceState(null, '', location.pathname + location.search); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { } } };

  /* ---------- the Steward (co-pilot, optional): drafts a writ, you seal it ---------- */
  CC.steward = {
    cfg: null,
    setup: function (cfg) {
      this.cfg = cfg;
      var log = CC.$('#ed-log');
      log.innerHTML = '<div class="ed-note">' + CC.esc(cfg.intro || 'Ask in plain words, or pick one of these.') + '</div><div class="ed-chips">' +
        cfg.examples.map(function (e) { return '<button type="button">' + CC.esc(e) + '</button>'; }).join('') + '</div>';
      CC.$$('.ed-chips button', log).forEach(function (b) { b.addEventListener('click', function () { CC.steward.send(b.textContent); }); });
      var inp = CC.$('#ed-in');
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); CC.steward.send(inp.value); } });
      CC.$('#ed-send').addEventListener('click', function () { CC.steward.send(inp.value); });
    },
    send: function (text) {
      text = (text || '').trim(); if (!text || !this.cfg) return;
      var log = CC.$('#ed-log'), inp = CC.$('#ed-in'); inp.value = '';
      CC.toggleSteward(true);
      var me = document.createElement('div'); me.className = 'slip me'; me.textContent = '“' + text + '”'; log.appendChild(me);
      var th = document.createElement('div'); th.className = 'ed-note'; th.textContent = 'The Steward is drafting…'; log.appendChild(th);
      log.scrollTop = log.scrollHeight;
      var cfg = this.cfg;
      setTimeout(function () {
        th.remove();
        var p = null; try { p = cfg.propose(text); } catch (e) { console.error(e); }
        var slip = document.createElement('div'); slip.className = 'slip';
        if (!p) {
          slip.innerHTML = '<h5>No writ drafted</h5><div class="redline"><div>Forgive me, I could not turn that into a change in this chamber. Try: <i>' + CC.esc(cfg.examples[0]) + '</i></div></div>';
        } else {
          slip.innerHTML = '<h5><span>' + CC.esc(p.title) + '</span><span class="mk">' + CC.icon('quill') + '</span></h5><div class="redline">' +
            p.lines.map(function (l) { return '<div>' + (l.op === 'ins' ? '<ins>' + CC.esc(l.s) + '</ins>' : l.op === 'del' ? '<del>' + CC.esc(l.s) + '</del>' : CC.esc(l.s)) + '</div>'; }).join('') + '</div>' +
            (p.note ? '<p class="hint" style="margin-top:8px">' + CC.esc(p.note) + '</p>' : '') +
            '<div class="acts"><button class="btn primary sm" data-a="ok">' + CC.icon('seal') + 'Seal it</button><button class="btn ghost sm" data-a="no">' + CC.icon('tear') + 'Tear it up</button></div>';
          var done = function (okk) {
            var acts = CC.$('.acts', slip); if (acts) acts.remove();
            var st = document.createElement('div'); st.className = 'state' + (okk ? '' : ' torn'); st.textContent = okk ? 'Sealed · in force' : 'Torn up · nothing changed'; slip.appendChild(st); slip.classList.add('done');
            if (okk) { try { p.apply(); } catch (e) { console.error(e); } CC.toast(p.toast || 'Sealed. It is done.'); }
          };
          CC.$('[data-a=ok]', slip).addEventListener('click', function () { done(true); });
          CC.$('[data-a=no]', slip).addEventListener('click', function () { done(false); });
        }
        log.appendChild(slip); log.scrollTop = log.scrollHeight;
      }, 520);
    }
  };

  /* ---------- boot ---------- */
  function boot() {
    if (!S) {
      document.body.innerHTML = '<div style="padding:40px;font:16px system-ui"><h1>Sample data not found</h1><p>Expected <code>../data/sample.js</code> (or <code>sample.copy.js</code>) beside this folder.</p></div>';
      return;
    }
    mountShell();
    if (typeof CC.ready === 'function') CC.ready();
    CC.on(function () { refreshFigs(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
