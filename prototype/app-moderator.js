/* Gatehouse (AI moderator): the Herald's chart, the live room at the gate, gate rules, the room, the portcullis (held queue), gate log, the drill (replay) */
(function () {
  'use strict';
  var CC = window.CC, S = CC.S, $ = CC.$, $$ = CC.$$, esc = CC.esc;
  CC.ready = init;
  var M, chat, vmap = {}, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DIRS = [
    { k: 'go-left', cd: 'left', label: 'Go left', c: 'var(--azure)', tc: 'var(--azure-text)' },
    { k: 'hype', cd: 'hype', label: 'Hype', c: 'var(--or)', tc: 'var(--or-text)' },
    { k: 'skip-boss', cd: 'skip', label: 'Skip the boss', c: 'var(--gules)', tc: 'var(--gules-text)' },
    { k: 'go-right', cd: 'right', label: 'Go right', c: 'var(--ink)', tc: 'var(--ink)' }
  ];
  var FILTERS = [['all', 'All messages'], ['emotes', 'Emotes only'], ['text', 'Text only'], ['malaLeft', 'malaLeft'], ['malaRight', 'malaRight'], ['malaHype', 'malaHype'], ['malaSeal', 'malaSeal']];
  var flt = 'all', iso = null, hoverI = null, live = { on: true, shown: [], idx: 0 }, mk = 'all';
  var RULEN = { links: 'links', spam: 'spam', caps: 'caps', 'new-acct': 'new account', slurs: 'blocked terms', 'llm-harass': 'classifier' };
  var wall0 = 21 * 3600 + 13 * 60 + 20, wallT0 = Date.now();
  function wall() { return wall0 + (Date.now() - wallT0) / 1000; }
  function wallStr(s) { s = Math.floor(s); return CC.fmt.pad(Math.floor(s / 3600) % 24) + ':' + CC.fmt.pad(Math.floor(s / 60) % 60) + ':' + CC.fmt.pad(s % 60); }

  /* ---------- vocabulary tables (brand word, with the plain function beside it) ---------- */
  // per-rule mode: the state machine is shadow <-> armed; each state names itself and what it does
  var MODE = {
    shadow: { label: 'Watching', fn: 'shadow: says what it would do, changes nothing', short: 'shadow · changes nothing', icon: 'watch', cls: 'watch' },
    armed: { label: 'Armed', fn: 'acts on people', short: 'acts on people', icon: 'armed', cls: 'arm' }
  };
  var MODE_ORDER = ['shadow', 'armed'];
  // a mark on a chat line
  var MARK = {
    pass: { label: 'Pass', fn: 'let in', short: 'let in', icon: '' },
    hold: { label: 'Hold', fn: 'held for review, at the portcullis', short: 'held', icon: 'hold' },
    bar: { label: 'Bar', fn: 'removed', short: 'removed', icon: 'bar' }
  };
  var MARK_ORDER = ['pass', 'hold', 'bar'];
  // what a rule's action looks like as a mark
  var ACT_MARK = { hold: 'hold', warn: 'pass', remove: 'bar', timeout: 'bar', ban: 'bar' };
  // Shield Mode button: off -> confirm -> on -> off
  var SHIELD = {
    off: { label: 'Raise the drawbridge', cls: '' },
    confirm: { label: 'Confirm: raise the drawbridge', cls: ' armed' },
    on: { label: 'Bridge up · lower it', cls: ' armed' }
  };
  // room-size tiers, named for the part of the keep they would fill
  var TIERN = { S: 'Hearth', M: 'Hall', L: 'Courtyard', XL: 'Tourney field' };

  function modeToggle(mode, name, data) {
    return '<div class="toggle" role="group" aria-label="Mode for ' + esc(name) + '">' + MODE_ORDER.map(function (k) {
      var m = MODE[k];
      return '<button class="' + m.cls + '" aria-pressed="' + (mode === k) + '" ' + data + ' data-m="' + k + '" title="' + m.label + ': ' + m.fn + '">' + CC.icon(m.icon) + m.label + '</button>';
    }).join('') + '</div>';
  }
  function markHTML(k) { var m = MARK[k]; return '<span class="mk ' + k + '" title="' + m.label + ': ' + m.fn + '">' + (m.icon ? CC.icon(m.icon) : '') + m.label + '</span>'; }

  /* ---------- series ---------- */
  var EMOTE = /\bmala[A-Z][a-z]+/;
  function seriesAll() { return S.consensus.map(function (r) { return { m: r.minute, v: DIRS.map(function (d) { return r[d.k]; }) }; }); }
  function seriesFiltered(f) {
    var buckets = [], i, d;
    for (i = 0; i <= 6; i++) buckets.push({ tot: 0, c: [0, 0, 0, 0] });
    chat.forEach(function (m) {
      if (m.verdict === 'removed') return;
      var di = -1; DIRS.forEach(function (x, k) { if (x.cd === m.direction) di = k; }); if (di < 0) return;
      var b = buckets[Math.min(6, Math.floor(m.t / 60))]; b.tot++;
      var ok = f === 'emotes' ? EMOTE.test(m.text) : f === 'text' ? !EMOTE.test(m.text) : m.text.indexOf(f) >= 0;
      if (ok) b.c[di]++;
    });
    return buckets.map(function (b, i) { return { m: i, v: b.c.map(function (x) { return b.tot ? x / b.tot * 100 : 0; }) }; });
  }
  function series() { return flt === 'all' ? seriesAll() : seriesFiltered(flt); }

  /* ---------- the Herald's chart ---------- */
  function drawChart() {
    var svg = $('#chart'), W = Math.max(520, svg.clientWidth || 760), H = 210, L = 38, R = 156, T = 14, B = 26, pw = W - L - R, ph = H - T - B;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var data = series(), n = data.length, max = 0;
    data.forEach(function (r) { r.v.forEach(function (x) { if (x > max) max = x; }); });
    var ymax = flt === 'all' ? 60 : Math.max(20, Math.ceil(max / 10) * 10);
    function X(i) { return L + (n > 1 ? i / (n - 1) : 0) * pw; } function Y(v) { return T + ph - v / ymax * ph; }
    var h = '<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.15" fill="var(--ink)"/></pattern></defs>';
    for (var g = 0; g <= ymax; g += (ymax > 40 ? 20 : 10)) h += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="var(--hair)" stroke-width="1" stroke-dasharray="' + (g ? '2 4' : '0') + '"/><text x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end" font-size="12" font-family="var(--font-num)" fill="var(--muted)">' + g + '%</text>';
    var step = n > 8 ? 2 : 1;
    for (var i = 0; i < n; i += step) { var lab = flt === 'all' ? (i === n - 1 ? 'now' : '−' + (n - 1 - i) + ' min') : (i + ' min'); h += '<text x="' + X(i) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="12" font-family="var(--font-num)" fill="var(--muted)">' + lab + '</text>'; }
    var order = [2, 0, 1, 3]; // gules, azure, or, key
    order.forEach(function (di) {
      var d = DIRS[di], dim = iso !== null && iso !== di, pts = data.map(function (r, i) { return [X(i), Y(r.v[di])]; });
      var area = 'M' + pts[0][0] + ',' + Y(0) + ' ' + pts.map(function (p) { return 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + ' L' + pts[n - 1][0] + ',' + Y(0) + 'Z';
      var line = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
      var fill = di === 3 ? 'url(#ht)' : d.c;
      h += '<g opacity="' + (dim ? '.16' : '1') + '"><path d="' + area + '" fill="' + fill + '" opacity="' + (di === 3 ? '.7' : di === 0 ? '.6' : di === 2 ? '.55' : '.66') + '" style="mix-blend-mode:var(--blend)"/><path d="' + line + '" fill="none" stroke="' + (di === 3 ? 'var(--ink)' : d.c) + '" stroke-width="2.2" stroke-linejoin="round" ' + (di === 3 ? 'stroke-dasharray="1 0"' : '') + '/></g>';
    });
    // end labels with collision avoidance
    var lab2 = DIRS.map(function (d, di) { return { di: di, y: Math.max(T + 8, Y(data[n - 1].v[di])) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < lab2.length; k++) if (lab2[k].y - lab2[k - 1].y < 19) lab2[k].y = lab2[k - 1].y + 19;
    lab2.forEach(function (l) { var d = DIRS[l.di], v = data[n - 1].v[l.di], col = l.di === 3 ? 'var(--ink)' : d.c, ex = L + pw; h += '<path d="M' + ex + ',' + Y(v) + ' L' + (ex + 9) + ',' + Y(v) + ' L' + (ex + 15) + ',' + (l.y - 4) + ' L' + (ex + 20) + ',' + (l.y - 4) + '" fill="none" stroke="' + col + '" stroke-width="1.6"/><text x="' + (ex + 24) + '" y="' + l.y + '" font-size="12" font-weight="700" font-family="var(--font-ui)" fill="' + d.tc + '" style="letter-spacing:.04em;text-transform:uppercase">' + d.label + ' <tspan font-family="var(--font-num)" font-weight="600" fill="var(--ink-2)" style="letter-spacing:0">' + v.toFixed(1) + '%</tspan></text>'; });
    if (hoverI !== null) { var hx = X(hoverI); h += '<line x1="' + hx + '" x2="' + hx + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--ink)" stroke-width="1.2"/>'; DIRS.forEach(function (d, di) { h += '<circle cx="' + hx + '" cy="' + Y(data[hoverI].v[di]) + '" r="4" fill="var(--paper)" stroke="' + (di === 3 ? 'var(--ink)' : d.c) + '" stroke-width="2.5"/>'; }); }
    h += '<rect id="hit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    svg.innerHTML = h; svg._geo = { L: L, pw: pw, n: n, data: data, X: X };
    var hit = $('#hit'); if (hit) { hit.addEventListener('pointermove', onHover); hit.addEventListener('pointerleave', function () { hoverI = null; hideTip(); drawChart(); }); }
    renderDirs(data);
    $('#hero').setAttribute('data-filter', flt);
  }
  function onHover(e) {
    var svg = $('#chart'), g = svg._geo, r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (parseFloat(svg.getAttribute('viewBox').split(' ')[2]) / r.width);
    var i = Math.max(0, Math.min(g.n - 1, Math.round((x - g.L) / g.pw * (g.n - 1)))); if (i === hoverI) return; hoverI = i;
    drawChart(); var hero = $('#hero'), hr = hero.getBoundingClientRect(), tip = $('#tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; tip.className = 'tip'; hero.appendChild(tip); }
    var lab = flt === 'all' ? (i === g.n - 1 ? 'now' : '−' + (g.n - 1 - i) + ' min') : ('minute ' + i);
    tip.innerHTML = '<b>' + lab + '</b><br>' + DIRS.map(function (d, di) { return '<span style="color:' + d.tc + '">' + d.label + '</span> ' + g.data[i].v[di].toFixed(1) + '%'; }).join('<br>');
    var px = r.left - hr.left + g.X(i) * (r.width / parseFloat(svg.getAttribute('viewBox').split(' ')[2]));
    tip.style.left = Math.min(px + 14, hr.width - 150) + 'px'; tip.style.top = '40px';
  }
  function hideTip() { var t = $('#tip'); if (t) t.remove(); }
  function renderDirs(data) {
    var n = data.length, last = data[n - 1].v, prev = data[Math.max(0, n - 4)].v;
    $('#dirs').innerHTML = DIRS.map(function (d, i) {
      var dl = last[i] - prev[i], up = dl >= 0;
      return '<button class="dir" style="--dc:' + (i === 3 ? 'var(--ink)' : d.c) + '" data-i="' + i + '" aria-pressed="' + (iso === i) + '" title="Isolate ' + d.label + '"><div class="nm"><i></i>' + d.label + '</div><div class="v">' + last[i].toFixed(1) + '<span style="font-size:15px;color:var(--muted)">%</span></div><div class="d ' + (up ? 'up' : 'dn') + '">' + (up ? '▲ +' : '▼ −') + Math.abs(dl).toFixed(1) + ' <span class="muted" style="font-family:var(--font-ui)">/ 3 min</span></div></button>';
    }).join('');
    $$('#dirs .dir').forEach(function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-i'); iso = iso === i ? null : i; drawChart(); }); });
  }
  function renderFlt() {
    $('#flt').innerHTML = FILTERS.map(function (f) { return '<button class="chip" aria-pressed="' + (flt === f[0]) + '" data-f="' + f[0] + '" style="' + (f[0].indexOf('mala') === 0 ? 'text-transform:none' : '') + '">' + f[1] + '</button>'; }).join('') + (flt !== 'all' ? '<span class="chip dash" title="Barred lines never count toward a consensus">' + removedCount() + ' barred lines excluded · chat sample minutes 0–6</span>' : '');
    $$('#flt button').forEach(function (b) { b.addEventListener('click', function () { flt = b.getAttribute('data-f'); hoverI = null; hideTip(); renderFlt(); drawChart(); }); });
  }
  function removedCount() { return chat.filter(function (m) { return m.verdict === 'removed'; }).length; }

  /* ---------- the live room, at the gate ---------- */
  var heldKeys = {};
  function lineMark(m) {
    if (m.verdict === 'removed') return 'bar';
    if (m.verdict === 'held') { var k = 'h' + m.i; if (heldKeys[k]) { var r = CC.state.resolved[k]; return r === 'pass' ? 'pass' : r === 'bar' ? 'bar' : 'hold'; } return 'pass'; }
    return 'pass';
  }
  function tagOf(m) { if (/\[link removed\]/.test(m.text)) return 'link'; var l = m.text.replace(/[^A-Za-z]/g, ''); if (l.length > 8 && l === l.toUpperCase() && m.text.length > 12 && m.verdict === 'removed') return 'caps'; return ''; }
  var DIRLAB = { left: 'go left', skip: 'skip', hype: 'hype', right: 'go right', question: 'question', bait: 'bait' };
  function lineHTML(m) {
    var k = lineMark(m), tag = tagOf(m), who = m.login;
    return '<div class="ln ' + k + '" data-i="' + m.i + '"><span class="t">' + CC.fmt.ms(m.t) + '</span><span class="mkcol">' + markHTML(k) + '</span><span class="who" title="' + esc(who) + '">' + esc(who) + '</span><span class="tx">' + esc(m.text) + (tag ? ' <span class="chip dash" style="height:18px;font-size:12px">' + tag + '</span>' : '') + '</span><span class="dr">' + (DIRLAB[m.direction] || '') + '</span></div>';
  }
  function passes(m) {
    var d = $('#pf-dir').value, q = $('#pf-q').value.trim().toLowerCase();
    if (d && m.direction !== d) return false;
    if (mk !== 'all' && lineMark(m) !== mk) return false;
    if (q && (m.text.toLowerCase().indexOf(q) < 0 && m.login.toLowerCase().indexOf(q) < 0)) return false;
    return true;
  }
  function renderRoomLines(full) {
    var box = $('#plines'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    var rows = live.shown.slice(-260).filter(function (x) { return x === 'sep' || passes(chat[x]); });
    box.innerHTML = rows.length ? rows.map(function (x) { return x === 'sep' ? '<div class="ln sep">The sampled chat comes round to the gate again from the top</div>' : lineHTML(chat[x]); }).join('') : '<div class="empty"><b>No one at this gate</b><p>No line in the room fits that filter.</p></div>';
    if (atEnd || full) box.scrollTop = box.scrollHeight;
    $('#room-meta').textContent = 'sample chat · 420 lines · ' + chat.filter(function (m) { return lineMark(m) === 'bar'; }).length + ' barred · ' + chat.filter(function (m) { return lineMark(m) === 'hold'; }).length + ' held';
  }
  function renderMk() {
    var c = { all: chat.length, pass: 0, hold: 0, bar: 0 }; chat.forEach(function (m) { c[lineMark(m)]++; });
    $('#pf-mark').innerHTML = ['all'].concat(MARK_ORDER).map(function (k) {
      var m = MARK[k], lab = m ? m.label + ' <small>' + m.short + '</small>' : 'All';
      return '<button class="chip mkchip" aria-pressed="' + (mk === k) + '" data-m="' + k + '"' + (m ? ' title="' + m.label + ': ' + m.fn + '"' : '') + '>' + lab + ' <b class="mono" style="font-style:normal">' + c[k] + '</b></button>';
    }).join('');
    $$('#pf-mark button').forEach(function (b) { b.addEventListener('click', function () { mk = b.getAttribute('data-m'); renderMk(); renderRoomLines(true); }); });
  }
  function liveTick() {
    if (!live.on || document.hidden || !CC.state.live || CC.state.twitch !== 'connected') return;
    if (live.idx >= chat.length) { live.idx = 0; live.shown.push('sep'); }
    var i = live.idx++; live.shown.push(i); if (live.shown.length > 300) live.shown.shift();
    var box = $('#plines'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60, m = chat[i];
    if (passes(m)) { var d = document.createElement('div'); d.innerHTML = lineHTML(m); if (box.querySelector('.empty')) box.innerHTML = ''; box.appendChild(d.firstChild); while (box.children.length > 260) box.removeChild(box.firstChild); if (atEnd) box.scrollTop = box.scrollHeight; }
  }

  /* ---------- replay engine (the drill) ---------- */
  function engine(params, modes, extraTerms) {
    var seen = {}, out = [];
    var terms = (extraTerms || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    chat.forEach(function (m) {
      var v = vmap[m.login] || { follower: true, account_age_days: 400 }, hits = [];
      var link = /\[link removed\]|https?:\/\/|www\./i.test(m.text);
      if (link && (params.linksAll || !v.follower)) hits.push('links');
      var key = m.login + '|' + m.text.toLowerCase(), arr = (seen[key] = (seen[key] || []).filter(function (t) { return m.t - t <= params.spamWin; })); arr.push(m.t); seen[key] = arr; if (arr.length >= params.spamN) hits.push('spam');
      var letters = m.text.replace(/[^A-Za-z]/g, ''), caps = letters.replace(/[^A-Z]/g, ''); if (m.text.length >= params.capsMin && letters.length && caps.length / letters.length > params.capsPct / 100) hits.push('caps');
      if (link && v.account_age_days < params.newDays) hits.push('new-acct');
      if (terms.length && terms.some(function (t) { return m.text.toLowerCase().indexOf(t) >= 0; })) hits.push('slurs');
      var act = null, rank = { ban: 5, timeout: 4, remove: 3, hold: 2, warn: 1 };
      var amap = { links: 'remove', spam: 'timeout', caps: 'warn', 'new-acct': 'hold', slurs: 'ban', 'llm-harass': 'timeout' };
      hits.forEach(function (h) { var a = amap[h]; if (!act || rank[a] > rank[act]) act = a; });
      var armed = hits.some(function (h) { return modes[h] === 'armed' && amap[h] === act; });
      out.push({ m: m, hits: hits, act: act, armed: armed });
    });
    return out;
  }
  function histOf(m) { return m.verdict === 'removed' ? 'remove' : m.verdict === 'held' ? 'hold' : 'release'; }
  function differs(r) { var h = histOf(r.m), a = r.act || 'release'; var strong = { remove: 1, timeout: 1, ban: 1 }; if (h === 'remove') return !strong[a]; if (h === 'release') return !!strong[a] || a === 'hold'; if (h === 'hold') return a === 'release'; return false; }
  function hitsFor(id) { var p = CC.state.params, res = engine(p, CC.state.rules, ''); return res.filter(function (r) { return r.hits.indexOf(id) >= 0; }).length; }

  /* ---------- gate rules ---------- */
  function renderRules() {
    var st = CC.state, rows = M.rules.map(function (r) {
      var mode = st.rules[r.id], hits = r.id === 'llm-harass' ? null : hitsFor(r.id);
      var human = /human click/.test(r.action);
      return '<tr data-id="' + r.id + '"><td><b class="mono" style="font-size:13px">' + esc(RULEN[r.id] || r.id) + '</b></td><td>' + esc(r.match) + '</td><td class="act">' + esc(r.action.replace(' (needs a human click)', '')) + (human ? ' <span class="chip warn" title="A ban always waits for a human click">human click</span>' : '') + '</td><td class="n">' + (hits === null ? '<span class="muted" title="Needs your own engine">engine</span>' : hits) + '</td><td>' + modeToggle(mode, RULEN[r.id] || r.id, '') + '<div class="mfn">' + (MODE[mode] ? MODE[mode].short : '') + '</div></td></tr>';
    });
    $('#rules tbody').innerHTML = rows.join('');
    $$('#rules tr[data-id]').forEach(function (tr) { $$('button', tr).forEach(function (b) { b.addEventListener('click', function () { var id = tr.getAttribute('data-id'), m = b.getAttribute('data-m'); if (CC.state.rules[id] === m) return; CC.setRule(id, m); addLedger({ kind: m === 'armed' ? 'armed' : 'watching', who: 'you', rule: id, reason: 'rule moved to ' + (m === 'armed' ? 'Armed: it will act' : 'Watching: it will only say what it would do'), undo: false }); renderRules(); CC.toast(RULEN[id] + ': ' + MODE[m].label); }); }); });
  }

  /* ---------- the room: tier, garrison orders, the moat, the drawbridge ---------- */
  var orders = { slow: { on: true, label: 'Slow mode', val: '5 s', lease: wall0 + 200 }, unique: { on: true, label: 'Unique chat', val: 'on', lease: wall0 + 200 }, follower: { on: false, label: 'Followers-only', val: '10 min', lease: 0 }, emote: { on: false, label: 'Emote-only', val: 'on', lease: 0 } };
  var shieldConfirm = false;
  function shieldState() { return CC.state.shield ? 'on' : shieldConfirm ? 'confirm' : 'off'; }
  function renderRoom() {
    var cur = S.channel.room_tier, h = '<div class="ladder" role="img" aria-label="Room tiers, current ' + cur + '">' + M.tiers.map(function (t) { return '<div class="rung ' + (t.tier === cur ? 'cur' : '') + '"><div class="l">' + t.tier + '</div><div><div class="n">' + TIERN[t.tier] + ' · <span class="mono" style="letter-spacing:0">' + esc(t.chatters) + '</span></div><div class="c">' + (t.modes.length ? esc(t.modes.join(' · ')) : 'no orders') + '</div></div></div>'; }).join('') + '</div>';
    h += '<p class="hint" style="margin:6px 0 10px"><b class="mono">' + S.channel.chatters_last_10min + '</b> chatters in 10 min. The room filled the ' + TIERN[cur] + ' at 21:06:40 (151 or more) and stays there until it falls well below that: hysteresis, so orders do not flap.</p>';
    h += '<table class="tbl"><thead><tr><th>Garrison order</th><th>Now</th><th>Lease</th><th></th></tr></thead><tbody>';
    Object.keys(orders).forEach(function (k) {
      var g = orders[k], left = g.on && g.lease ? Math.max(0, g.lease - wall()) : 0;
      h += '<tr><td><b>' + g.label + '</b></td><td>' + (g.on ? '<span class="chip solid-azure">' + g.val + '</span>' : '<span class="chip dash">off</span>') + '</td><td class="lease" data-k="' + k + '">' + (g.on ? (g.lease ? CC.fmt.ms(left) : 'manual') : '—') + '</td><td style="text-align:right"><button class="btn sm ' + (g.on ? 'ghost' : '') + '" data-mg="' + k + '">' + (g.on ? 'Release' : 'Set 10 min') + '</button></td></tr>';
    });
    h += '</tbody></table><p class="hint" style="margin:6px 0 12px">An order is lent for a time and ends on its own. If a human changes a setting in Twitch, the governor yields.</p>';
    h += '<div class="f-l" style="margin-bottom:4px">The moat · chat delay for non-moderators</div><div class="seg2" id="delay" role="group" aria-label="The moat: chat delay">' + [2, 4, 6].map(function (s) { return '<button data-d="' + s + '" aria-pressed="' + (CC.state.delay === s) + '">' + s + ' s</button>'; }).join('') + '</div>';
    var sh = SHIELD[shieldState()];
    h += ' <button class="btn sm shield-btn' + sh.cls + '" id="shield" style="margin-left:8px" title="Twitch Shield Mode">' + CC.icon(CC.state.shield ? 'portcullis' : 'shield') + sh.label + '</button>';
    h += '<p class="hint" style="margin-top:6px">Raise the drawbridge is Twitch Shield Mode: your own overrides, applied at once. The moat buys the moderator seconds; it does not make deletion instant.</p>';
    $('#room').innerHTML = h;
    $$('#room [data-mg]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-mg'), g = orders[k]; g.on = !g.on; g.lease = g.on ? wall() + 600 : 0; addLedger({ kind: 'mode', who: 'you', rule: 'garrison orders', reason: g.label + (g.on ? ' set for 10 min' : ' released by hand'), undo: true }); renderRoom(); }); });
    $$('#delay button').forEach(function (b) { b.addEventListener('click', function () { CC.set({ delay: +b.getAttribute('data-d') }); addLedger({ kind: 'mode', who: 'you', rule: 'the moat', reason: 'chat delay set to ' + b.getAttribute('data-d') + ' s', undo: true }); renderRoom(); }); });
    $('#shield').addEventListener('click', function () {
      if (shieldState() === 'off') { shieldConfirm = true; renderRoom(); setTimeout(function () { if (shieldConfirm) { shieldConfirm = false; renderRoom(); } }, 3500); return; }
      shieldConfirm = false; CC.set({ shield: !CC.state.shield }); addLedger({ kind: 'mode', who: 'you', rule: 'drawbridge', reason: CC.state.shield ? 'Shield Mode on: the drawbridge is up' : 'Shield Mode off: the drawbridge is down', undo: true }); renderRoom();
    });
  }
  function tickLeases() {
    var changed = false;
    Object.keys(orders).forEach(function (k) {
      var g = orders[k]; if (g.on && g.lease) { var left = g.lease - wall(); var e = $('.lease[data-k=' + k + ']'); if (left <= 0) { g.on = false; g.lease = 0; changed = true; addLedger({ kind: 'mode', who: 'room', rule: 'governor', reason: g.label + ': lease ended on its own', undo: false }); } else if (e) e.textContent = CC.fmt.ms(left); }
    });
    if (changed) renderRoom();
  }

  /* ---------- at the portcullis (held queue) ---------- */
  var PORTCULLIS_CLEAR = '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 50h46"/><path d="M8 50V12h5v4h6v-4h6v4h6v-4h6v4h6v-4h5v38"/><path d="M17 50V30a11 11 0 0 1 22 0v20"/><path d="M22 21v12M28 19.5v13.5M34 21v12M19 24.5h18M17.6 29h20.8"/><path d="M28 39v7" stroke-dasharray="2 3"/></svg>';
  function renderHolds() {
    var pend = CC.heldPending();
    $('#h-count').textContent = pend.length ? pend.length + (pend.length === 1 ? ' hold' : ' holds') + ' waiting' : 'all clear';
    if (!pend.length) { $('#holds').innerHTML = '<div class="empty">' + PORTCULLIS_CLEAR + '<b>The portcullis is clear</b><p>Nothing is held at the gate. Nothing is waiting on you.</p></div>'; return; }
    $('#holds').innerHTML = pend.map(function (q) {
      var v = vmap[q.login] || {};
      return '<div class="qrow" data-k="' + q.key + '"><div><div class="txt">“' + esc(q.text) + '”</div><div class="meta"><span class="mono">' + esc(q.login) + '</span> · held by AutoMod (sample) · account ' + (v.account_age_days != null ? v.account_age_days + ' d' : '—') + ' · ' + CC.fmt.ms(q.t) + '</div></div><div class="btns"><button class="btn sm" data-a="pass" title="Pass (allow): let it in">' + CC.icon('pass') + 'Pass</button><button class="btn sm danger" data-a="bar" title="Bar (deny): it never appears">' + CC.icon('bar') + 'Bar</button></div></div>';
    }).join('') + '<p class="hint" style="margin-top:8px">Pass and Bar are Twitch AutoMod rulings (allow and deny): Twitch offers no undo for either, so each row says so in the Gate log.</p>';
    $$('#holds .qrow').forEach(function (r) { $$('button', r).forEach(function (b) { b.addEventListener('click', function () { resolve(r.getAttribute('data-k'), b.getAttribute('data-a')); }); }); });
  }
  function resolve(key, a) {
    var q = CC.heldAll().filter(function (x) { return x.key === key; })[0]; if (!q) return;
    CC.state.resolved[key] = a; CC.set({ resolved: CC.state.resolved });
    addLedger({ kind: a === 'pass' ? 'released' : 'removed', who: q.login, rule: 'automod hold', reason: 'a human ' + (a === 'pass' ? 'allowed' : 'denied') + ' it: “' + q.text + '”', undo: false });
    CC.toast(a === 'pass' ? 'Pass: ' + q.login + ' let in' : 'Bar: ' + q.login + ' removed'); renderHolds(); renderMk(); renderRoomLines(); CC.refreshFigs();
  }

  /* ---------- gate log ---------- */
  var KIND = { removed: ['Bar · removed', 'bad'], held: ['Hold · for review', 'warn'], released: ['Pass · let in', 'ok'], timeout: ['timeout', 'solid-gules'], mode: ['order', 'solid-azure'], 'would-warn': ['would warn', 'dash'], 'ban-pending': ['ban pending', 'bad'], ban: ['ban', 'solid-gules'], armed: ['Armed', 'solid-azure'], watching: ['Watching', 'azure'], undo: ['undo', 'dash'] };
  // what each gate-log operation says, and what its row reads afterwards
  var OPS = { ban: { msg: 'Ban confirmed by a human click', done: 'banned' }, tear: { msg: 'Torn up: nobody was banned', done: 'torn up' }, unban: { msg: 'Unbanned', done: 'unbanned' }, untimeout: { msg: 'Timeout lifted', done: 'lifted' }, revert: { msg: 'Reverted', done: 'reverted' } };
  function ledgerAll() {
    var base = M.decisions.map(function (d, i) { return { id: 'b' + i, t: d.t, kind: d.kind, who: d.who, rule: d.rule, reason: d.reason, base: true }; });
    return (CC.state.ledger || []).concat(base.slice().reverse());
  }
  function addLedger(e) { e.id = 'n' + Date.now() + Math.floor(Math.random() * 99); e.t = wallStr(wall()); var l = (CC.state.ledger || []).slice(); l.unshift(e); CC.set({ ledger: l.slice(0, 40) }, true); CC.save(); renderLedger(true); }
  function renderLedger(fresh) {
    var ops = CC.state.ledgerOps || {}, L = ledgerAll();
    $('#log-count').textContent = L.length + ' entries';
    $('#gatelog').innerHTML = L.map(function (d, i) {
      var k = KIND[d.kind] || [d.kind, 'dash'], op = ops[d.id], acts = '';
      if (d.kind === 'ban-pending' && !op) acts = '<button class="btn sm danger" data-op="ban" data-id="' + d.id + '">Confirm ban</button><button class="btn sm ghost" data-op="tear" data-id="' + d.id + '">' + CC.icon('tear') + 'Tear it up</button>';
      else if (op === 'ban') acts = '<button class="btn sm ghost" data-op="unban" data-id="' + d.id + '">' + CC.icon('undo') + 'Unban</button>';
      else if (op) acts = '<span class="chip dash">' + (OPS[op] ? OPS[op].done : op) + '</span>';
      else if (d.kind === 'timeout') acts = '<button class="btn sm ghost" data-op="untimeout" data-id="' + d.id + '">' + CC.icon('undo') + 'Undo</button>';
      else if (d.kind === 'mode' && d.undo !== false) acts = '<button class="btn sm ghost" data-op="revert" data-id="' + d.id + '">' + CC.icon('undo') + 'Revert</button>';
      else if (d.kind === 'removed' || d.kind === 'held' || d.kind === 'released') acts = '<span class="chip dash" title="Twitch has no un-delete and no un-deny">no undo on Twitch</span>';
      else if (d.kind === 'would-warn') acts = '<span class="chip dash" title="Watching: nothing happened">nothing happened</span>';
      return '<div class="led' + (fresh && i === 0 ? ' new' : '') + '"><span class="t">' + esc(d.t) + '</span><div><span class="chip ' + k[1] + '">' + k[0] + '</span> <b class="mono" style="font-size:13px">' + esc(d.who) + '</b> <span class="muted">· ' + esc(d.rule) + '</span><div class="why">' + esc(d.reason) + '</div></div><div class="acts">' + acts + '</div></div>';
    }).join('');
    $$('#gatelog [data-op]').forEach(function (b) { b.addEventListener('click', function () { ledgerOp(b.getAttribute('data-id'), b.getAttribute('data-op')); }); });
  }
  function ledgerOp(id, op) {
    var o = Object.assign({}, CC.state.ledgerOps || {}), row = ledgerAll().filter(function (x) { return x.id === id; })[0]; if (!row) return;
    o[id] = op; CC.set({ ledgerOps: o }, true); CC.save();
    addLedger({ kind: 'undo', who: row.who, rule: row.rule, reason: OPS[op].msg + ' (' + (row.kind) + ')', undo: false });
    CC.toast(OPS[op].msg);
  }

  /* ---------- the drill: card + nested view ---------- */
  function renderReplayCard() {
    var r = M.replay;
    $('#replay-card').innerHTML = '<div class="kicker">The drill · replay simulator</div><p style="margin:4px 0 0;font:italic 15px/1.35 var(--font-serif)">' + esc(r.stream) + ': ' + CC.fmt.n(r.messages) + ' messages through today\'s gate rules.</p><div class="big"><div><b>' + r.would_hold + '</b><small>held</small></div><div><b>' + r.would_remove + '</b><small>removed</small></div><div><b>' + r.would_timeout + '</b><small>timeouts</small></div><div><b>' + r.would_ban + '</b><small>bans</small></div><div><b>' + r.mode_switches + '</b><small>order switches</small></div><div><b>' + r.false_positive_review_sample + '</b><small>to review</small></div></div><a class="btn plate" href="#replay">' + CC.icon('play') + 'Run the drill</a><p class="hint" style="margin-top:8px">Change the rules, run it again, and only then arm anything. The drill replays your own recorded chat or a log you import.</p>';
  }
  var rp = { params: null, modes: null, terms: '', flt: 'acts' };
  function rpInit() { rp.params = Object.assign({}, CC.state.params); rp.modes = Object.assign({}, CC.state.rules); rp.terms = ''; }
  function renderReplay() {
    var r = M.replay, tot = [['messages', CC.fmt.n(r.messages)], ['held', r.would_hold], ['removed', r.would_remove], ['timeouts', r.would_timeout], ['bans', r.would_ban], ['switches', r.mode_switches]];
    $('#rp-tot').innerHTML = tot.map(function (t) { return '<div><b>' + t[1] + '</b><small>' + t[0] + ' · ep. 12</small></div>'; }).join('');
    var p = rp.params;
    var h = '';
    function modeTog(id) { return modeToggle(rp.modes[id], RULEN[id], 'data-rm="' + id + '"'); }
    h += '<div class="rp-rule"><div class="hd"><b>links</b><span class="muted">delete</span>' + modeTog('links') + '</div><div class="pm"><label class="chk"><input type="checkbox" id="rp-linksall"' + (p.linksAll ? ' checked' : '') + '><span>also followers, not only non-followers</span></label></div></div>';
    h += '<div class="rp-rule"><div class="hd"><b>spam</b><span class="muted">timeout 60 s</span>' + modeTog('spam') + '</div><div class="pm"><span>same line</span><input type="range" id="rp-spamn" min="2" max="6" value="' + p.spamN + '" aria-label="Repeats"><b class="mono" id="rp-spamn-v">' + p.spamN + '×</b><span>within</span><input type="range" id="rp-spamw" min="10" max="120" step="5" value="' + p.spamWin + '" aria-label="Window seconds" style="width:110px"><b class="mono" id="rp-spamw-v">' + p.spamWin + ' s</b></div></div>';
    h += '<div class="rp-rule"><div class="hd"><b>caps</b><span class="muted">warn</span>' + modeTog('caps') + '</div><div class="pm"><span>over</span><input type="range" id="rp-capsp" min="40" max="95" value="' + p.capsPct + '" aria-label="Percent capitals" style="width:110px"><b class="mono" id="rp-capsp-v">' + p.capsPct + '%</b><span>and at least</span><input type="range" id="rp-capsm" min="8" max="40" value="' + p.capsMin + '" aria-label="Minimum length" style="width:110px"><b class="mono" id="rp-capsm-v">' + p.capsMin + ' chars</b></div></div>';
    h += '<div class="rp-rule"><div class="hd"><b>new account</b><span class="muted">hold for review</span>' + modeTog('new-acct') + '</div><div class="pm"><span>account under</span><input type="range" id="rp-days" min="1" max="60" value="' + p.newDays + '" aria-label="Days" style="width:140px"><b class="mono" id="rp-days-v">' + p.newDays + ' d</b><span>posts a link</span></div></div>';
    h += '<div class="rp-rule"><div class="hd"><b>blocked terms</b><span class="muted">ban, needs a human click</span>' + modeTog('slurs') + '</div><div class="pm"><label class="f" style="flex:1"><span class="sr">Blocked terms</span><input type="text" id="rp-terms" value="' + esc(rp.terms) + '" placeholder="try a word from the chat, e.g. skip" aria-label="Blocked terms, comma separated"></label></div></div>';
    h += '<div class="rp-rule"><div class="hd"><b>classifier</b><span class="muted">targeted harassment</span><span class="chip dash" style="margin-left:auto">needs your own engine</span></div><p class="diffnote">Not run in this prototype: it stays Watching and marks nothing here.</p></div>';
    $('#rp-rules').innerHTML = h;
    $$('#rp-rules [data-rm]').forEach(function (b) { b.addEventListener('click', function () { rp.modes[b.getAttribute('data-rm')] = b.getAttribute('data-m'); renderReplay(); }); });
    function bind(id, key, suf) { var e = $('#' + id); e.addEventListener('input', function () { rp.params[key] = +e.value; $('#' + id + '-v').textContent = e.value + suf; renderReplayOut(); }); }
    bind('rp-spamn', 'spamN', '×'); bind('rp-spamw', 'spamWin', ' s'); bind('rp-capsp', 'capsPct', '%'); bind('rp-capsm', 'capsMin', ' chars'); bind('rp-days', 'newDays', ' d');
    $('#rp-linksall').addEventListener('change', function (e) { rp.params.linksAll = e.target.checked; renderReplayOut(); });
    $('#rp-terms').addEventListener('input', function (e) { rp.terms = e.target.value; renderReplayOut(); });
    renderReplayOut();
  }
  function renderReplayOut() {
    var res = engine(rp.params, rp.modes, rp.terms), c = { remove: 0, hold: 0, timeout: 0, warn: 0, ban: 0 }, diff = 0, acts = 0;
    res.forEach(function (r) { if (r.act) { c[r.act]++; acts++; } if (differs(r)) diff++; });
    $('#rp-sum').innerHTML = '<div class="chips">' + [['removed', c.remove, 'solid-gules'], ['held', c.hold, 'solid-or'], ['timeouts', c.timeout, 'solid-gules'], ['warnings', c.warn, 'azure'], ['bans (human click)', c.ban, 'bad']].map(function (x) { return '<span class="chip ' + x[2] + '"><b class="mono">' + x[1] + '</b> ' + x[0] + '</span>'; }).join('') + '<span class="chip ' + (diff ? 'warn' : 'ok') + '"><b class="mono">' + diff + '</b> differ from what happened</span></div><p class="hint" style="margin-top:6px">Lines the gate rules would act on that were let in, and lines that were barred that they would let through, are the ones to read before you arm anything.</p>';
    $('#rp-flt').innerHTML = [['acts', 'Acts'], ['diff', 'Differs'], ['all', 'All 420']].map(function (f) { return '<button class="chip" data-f="' + f[0] + '" aria-pressed="' + (rp.flt === f[0]) + '">' + f[1] + '</button>'; }).join('');
    $$('#rp-flt button').forEach(function (b) { b.addEventListener('click', function () { rp.flt = b.getAttribute('data-f'); renderReplayOut(); }); });
    var list = rp.flt === 'all' ? res : rp.flt === 'diff' ? res.filter(differs) : res.filter(function (r) { return !!r.act; });
    $('#rp-lines').innerHTML = list.length ? list.slice(0, 260).map(function (r) {
      var m = r.m, d = differs(r), was = histOf(m), k = r.act ? ACT_MARK[r.act] : 'pass';
      return '<div class="ln ' + k + '" style="grid-template-columns:50px 130px minmax(0,1fr) auto"><span class="t">' + CC.fmt.ms(m.t) + '</span><span class="who">' + esc(m.login) + '</span><span class="tx">' + esc(m.text) + '</span><span style="display:flex;gap:4px;align-items:center">' + r.hits.map(function (h) { return '<span class="chip azure" style="height:20px">' + esc(RULEN[h] || h) + '</span>'; }).join('') + (r.act ? '<span class="chip solid" title="' + (r.armed ? 'Armed: it would act' : 'Watching: it would only say so') + '">' + r.act + (r.armed ? '' : ' · watching') + '</span>' : '<span class="chip dash" title="' + MARK.pass.label + ': ' + MARK.pass.fn + '">pass</span>') + '<span class="chip ' + (d ? 'warn' : 'dash') + '" title="What happened on the night">was ' + was + '</span></span></div>';
    }).join('') : '<div class="empty"><b>The drill is quiet</b><p>' + (rp.flt === 'diff' ? 'Today\'s rules agree with what happened on the night.' : 'No line triggers a rule with these settings.') + '</p></div>';
  }

  /* ---------- the Steward ---------- */
  var RULE_WORDS = { links: /link/, spam: /spam|repeat/, caps: /caps|shout/, 'new-acct': /new acc|new-acc|newcomer/, slurs: /slur|blocked|term/, 'llm-harass': /harass|classifier/ };
  var TO_ARMED = /\barm(ed)?\b|enforce|\bact\b/, TO_WATCH = /watch|shadow|disarm|nothing|stand down/, REST = /everything|\ball\b|every|the rest|others/;
  function clauseMode(c) { var w = TO_WATCH.test(c), a = TO_ARMED.test(c); return w ? 'shadow' : a ? 'armed' : null; }
  function propose(text) {
    var s = text.toLowerCase(), lines = [], acts = [], plan = {}, rest = null;
    // each clause carries its own order: "arm spam, keep everything else watching"
    s.split(/[,;.]|\band\b|\bbut\b|\bthen\b/).forEach(function (c) {
      var mode = clauseMode(c); if (!mode) return;
      var ids = Object.keys(RULE_WORDS).filter(function (k) { return RULE_WORDS[k].test(c); });
      if (ids.length) ids.forEach(function (id) { plan[id] = mode; }); else if (REST.test(c)) rest = mode;
    });
    if (rest) M.rules.forEach(function (r) { if (!plan[r.id]) plan[r.id] = rest; });
    var change = {};
    M.rules.forEach(function (r) {
      var id = r.id, to = plan[id]; if (!to) return;
      var from = CC.state.rules[id], nm = RULEN[id] || id;
      if (from !== to) { change[id] = to; lines.push({ op: 'del', s: nm + ': ' + MODE[from === 'armed' ? 'armed' : 'shadow'].label }); lines.push({ op: 'ins', s: nm + ': ' + MODE[to].label }); }
      else lines.push({ op: '', s: nm + ' is already ' + MODE[to].label });
    });
    if (Object.keys(change).length) acts.push(function () { Object.keys(change).forEach(function (id) { CC.state.rules[id] = change[id]; }); CC.set({ rules: CC.state.rules }); renderRules(); });
    var delay = s.match(/(?:delay|moat).*?\b(2|4|6)\b|\b(2|4|6)\s*s(ec)?\b.*(?:delay|moat)/);
    if (delay) { var d = +(delay[1] || delay[2]); lines.push({ op: 'del', s: 'the moat: ' + CC.state.delay + ' s' }); lines.push({ op: 'ins', s: 'the moat: ' + d + ' s' }); acts.push(function () { CC.set({ delay: d }); renderRoom(); }); }
    if (/drawbridge|shield/.test(s)) { var on = !/\boff\b|lower|\bdown\b|release/.test(s); lines.push({ op: on ? 'ins' : 'del', s: 'Shield Mode (the drawbridge): ' + (on ? 'up' : 'down') }); acts.push(function () { CC.set({ shield: on }); renderRoom(); }); }
    if (!acts.length) return null;
    return { title: 'A writ for the gate', lines: lines, note: 'An Armed rule acts on real people. Watching first is the safer course; nothing changes until you seal it.', toast: 'Sealed. The gate has its orders.', apply: function () { acts.forEach(function (f) { f(); }); addLedger({ kind: 'mode', who: 'steward', rule: 'gate rules', reason: 'sealed by you: ' + text, undo: false }); } };
  }

  function init() {
    M = S.moderator; chat = S.chat; S.viewers.forEach(function (v) { vmap[v.login] = v; });
    CC.heldAll().forEach(function (q) { heldKeys[q.key] = 1; });
    CC.heldAll(); // ensure m.i indexes
    renderFlt(); drawChart(); renderMk();
    for (var i = 0; i < 70; i++) live.shown.push(live.idx++);
    renderRoomLines(true); renderRules(); renderRoom(); renderHolds(); renderLedger(); renderReplayCard();
    $('#head-actions').innerHTML = '<span class="chip" id="modnote"></span><a class="btn plate" href="#replay">' + CC.icon('play') + 'Run the drill</a>';
    function note() { var c = CC.counts(); $('#modnote').textContent = c.armed ? 'Armed ' + c.armed + ' · Watching ' + c.shadow : 'Watching only: nothing changes'; $('#modnote').className = 'chip ' + (c.armed ? 'solid-azure' : 'azure'); }
    note(); CC.on(note);
    $('#pf-dir').addEventListener('change', function () { renderRoomLines(true); }); $('#pf-q').addEventListener('input', function () { renderRoomLines(true); });
    $('#pf-live').addEventListener('click', function () { live.on = !live.on; this.textContent = live.on ? 'Pause live' : 'Resume live'; this.setAttribute('aria-pressed', String(live.on)); });
    $('#g-watch').addEventListener('click', function () { M.rules.forEach(function (r) { CC.state.rules[r.id] = 'shadow'; }); CC.set({ rules: CC.state.rules }); renderRules(); addLedger({ kind: 'watching', who: 'you', rule: 'all rules', reason: 'every rule moved to Watching', undo: false }); CC.toast('Every rule is Watching'); });
    $('#g-arm').addEventListener('click', function () { var b = this; if (!b._a) { b._a = true; b.textContent = 'Confirm: they will act'; b.classList.add('danger'); setTimeout(function () { b._a = false; b.textContent = 'Arm all…'; b.classList.remove('danger'); }, 3500); return; } b._a = false; b.textContent = 'Arm all…'; b.classList.remove('danger'); M.rules.forEach(function (r) { CC.state.rules[r.id] = 'armed'; }); CC.set({ rules: CC.state.rules }); renderRules(); addLedger({ kind: 'armed', who: 'you', rule: 'all rules', reason: 'every rule moved to Armed', undo: false }); CC.toast('Every rule is Armed'); });
    $('#rp-back').addEventListener('click', function (e) { e.preventDefault(); CC.go(''); });
    $('#rp-apply').addEventListener('click', function () { Object.assign(CC.state.rules, rp.modes); CC.set({ params: Object.assign({}, rp.params), rules: CC.state.rules }); renderRules(); addLedger({ kind: 'mode', who: 'you', rule: 'gate rules', reason: 'settings from the drill applied', undo: false }); CC.toast('Applied to the gate rules'); });
    $('#rp-reset').addEventListener('click', function () { rpInit(); renderReplay(); });
    CC.steward.setup({ intro: 'Tell me what the gate should do and I will draft a writ. Nothing changes until you seal it; arming and watching stay your call.', examples: ['arm the spam rule, keep everything else watching', 'set the moat to 4 s', 'watch everything'], propose: propose });
    rpInit();
    CC.router({ main: $('#v-main'), replay: $('#v-replay') }, function (name) { if (name === 'replay') { CC.crumbs([{ t: 'The drill' }]); rpInit(); renderReplay(); } else { CC.crumbs([]); drawChart(); } });
    setInterval(liveTick, 1100); setInterval(tickLeases, 1000);
    if (window.ResizeObserver) new ResizeObserver(function () { if ($('#v-main') && !$('#v-main').hidden) { drawChart(); } }).observe($('#hero'));
    CC.on(function () { renderMk(); renderRoomLines(); renderHolds(); renderRules(); });
  }
})();
