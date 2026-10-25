/* Map Room (Extension studio): the hex map canvas, pieces (components), orders (operator controls), spyglass (viewer preview), test status */
(function () {
  'use strict';
  var CC = window.CC, S = CC.S, $ = CC.$, $$ = CC.$$, esc = CC.esc;
  CC.ready = init;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var H, SIDES = ['var(--azure)', 'var(--gules)', 'var(--or)'], SIDETXT = ['var(--azure-text)', 'var(--gules-text)', 'var(--or-text)'], names = [], tiles = [];
  var TPL = {
    hex: { name: 'Hex map', note: 'Viewers pick a tile each turn', pieces: [['board', 'Board', 'hex map, 9×6', 'hex'], ['clock', 'Turn clock', 'counts down to the seal', 'clock'], ['menu', 'Move menu', 'three candidate tiles', 'ticket'], ['tally', 'Side tallies', 'sealed until the turn ends', 'frame'], ['standing', 'Standing meter', 'what a viewer has earned', 'star']] },
    choice: { name: 'Choice board', note: 'Pick one of four', pieces: [['q', 'Question', 'the closed prompt', 'scroll'], ['opts', 'Options', 'four authored choices', 'ticket'], ['clock', 'Timer', 'closes the vote', 'clock'], ['tally', 'Result bars', 'revealed at the close', 'frame']] },
    card: { name: 'Viewer card', note: 'A card for each viewer', pieces: [['avatar', 'Portrait', 'drawn by the viewer\'s emote', 'bubble'], ['name', 'Name banner', 'handle only', 'flag'], ['badges', 'Badges', 'earned, never bought', 'star'], ['standing', 'Standing', 'next rung shown', 'bolt']] },
    draw: { name: 'Cast of lots', note: 'Shows a Lot Chamber cast on the Extension', pieces: [['urn', 'Urn', 'the cast\'s visual shape', 'seal'], ['seats', 'Seat rail', 'handles drawn', 'ticket'], ['receipt', 'Writ strip', 'the seal and the public round', 'scroll']] },
    meter: { name: 'Contribution meter', note: 'A goal that fills', pieces: [['meter', 'Meter', 'fills with contributions', 'bolt'], ['goal', 'Goal', 'a number to reach', 'star'], ['feed', 'Recent', 'last three, newest first', 'gift']] }
  };
  var st = {
    tool: 'select', sel: null, tpl: 'hex', pieces: {}, driver: 'both', can: { vote: true, pick: true, join: true }, cadence: 90, sealed: true, device: 'desk', menu: ['F3', 'E4', 'D2'],
    turn: { n: 7, running: false, left: 0, total: 10, side: 1, counts: [0, 0, 0], revealed: false, win: null, sealedN: 0 }, testTurns: 0, allow: [], stage: 'hosted', submitted: false, aiPending: true, picked: null, perLim: 1
  };
  var CHECKS = ['The shell is reviewed once: you edit data, never code', 'No iframes inside the Extension', 'Audio is off by default, with volume controls', 'Every URL the Extension fetches is listed', 'No ads or sponsorship', 'Bits never fund betting on outcomes or random loot'];

  /* ---------- hex geometry ---------- */
  var HS = 36, SQ = Math.sqrt(3);
  function ctr(c, r) { return [HS * SQ * (c + (r % 2 ? .5 : 0)) + HS * SQ / 2 + 4, HS * 1.5 * r + HS + 4]; }
  function poly(x, y, s) { var p = []; for (var i = 0; i < 6; i++) { var a = (60 * i - 30) * Math.PI / 180; p.push((x + s * Math.cos(a)).toFixed(1) + ',' + (y + s * Math.sin(a)).toFixed(1)); } return p.join(' '); }
  function tname(c, r) { return String.fromCharCode(65 + c) + (r + 1); }
  function buildTiles() {
    var seeds = [[1, 3], [7, 1], [6, 5]].map(function (p) { var q = ctr(p[0], p[1]); return q; });
    tiles = [];
    for (var r = 0; r < H.rows; r++) for (var c = 0; c < H.cols; c++) {
      var q = ctr(c, r), d = seeds.map(function (s) { return Math.hypot(q[0] - s[0], q[1] - s[1]) / (HS * SQ); }), idx = [0, 1, 2].sort(function (a, b) { return d[a] - d[b]; });
      var own = d[idx[0]] < 3.1 ? idx[0] : -1, sec = own >= 0 && d[idx[1]] - d[idx[0]] < .85 && d[idx[1]] < 3.6 ? idx[1] : -1;
      tiles.push({ c: c, r: r, owner: own, second: sec, name: tname(c, r) });
    }
  }
  function tile(name) { return tiles.filter(function (t) { return t.name === name; })[0]; }

  /* ---------- canvases ---------- */
  function renderTools() {
    var tl = [['select', 'Select'], ['0', names[0]], ['1', names[1]], ['2', names[2]], ['fog', 'Fog'], ['menu', 'Menu']];
    $('#tb').innerHTML = '<span class="kicker" style="margin-right:2px">The map table · ' + esc(TPL[st.tpl].name) + '</span>' + (st.tpl === 'hex' ? '<span class="chips" role="group" aria-label="Tool">' + tl.map(function (t, i) { var sw = i >= 1 && i <= 3 ? '<span class="sw" style="width:11px;height:11px;border:0;background:' + SIDES[i - 1] + ';display:inline-block;border-radius:50%;margin-right:2px;mix-blend-mode:var(--blend)"></span>' : ''; return '<button class="chip" data-t="' + t[0] + '" aria-pressed="' + (st.tool === t[0]) + '" style="text-transform:none;font-size:12.5px">' + sw + esc(t[1]) + '</button>'; }).join('') + '</span><span class="hint" style="margin-left:auto">' + (st.tool === 'select' ? 'Click a tile to inspect it' : st.tool === 'menu' ? 'Click up to three tiles for the move menu' : 'Click tiles to repaint them') + '</span>' : '<span class="hint" style="margin-left:auto">Template preview · switch back to Hex map for the full canvas</span>');
    $$('#tb button').forEach(function (b) { b.addEventListener('click', function () { st.tool = b.getAttribute('data-t'); renderTools(); }); });
  }
  function renderCanvas() {
    var el = $('#canvas');
    if (st.tpl !== 'hex') { el.innerHTML = otherCanvas(); $('#inspect').innerHTML = '<span class="serif">' + esc(TPL[st.tpl].note) + '. Same shell, different data.</span>'; $('#turnbar').innerHTML = ''; return; }
    var W = HS * SQ * (H.cols + .5) + 10, Hh = HS * 1.5 * (H.rows) + HS * .5 + 10, h = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + Hh.toFixed(0) + '" role="group" aria-label="Hex map, ' + H.cols + ' by ' + H.rows + '"><defs><pattern id="fog" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="var(--ink)" opacity=".4"/></pattern></defs>';
    tiles.forEach(function (t) {
      var q = ctr(t.c, t.r), isSel = st.sel === t.name, isMenu = st.menu.indexOf(t.name) >= 0, fill = t.owner >= 0 ? SIDES[t.owner] : 'url(#fog)';
      h += '<g class="hexg" data-n="' + t.name + '" tabindex="0" role="button" aria-label="Tile ' + t.name + ', ' + (t.owner >= 0 ? names[t.owner] : 'unclaimed fog') + (isMenu ? ', on the move menu' : '') + '">';
      h += '<polygon class="base" points="' + poly(q[0], q[1], HS - 1.5) + '" fill="var(--paper)" stroke="var(--ink)" stroke-width="' + (isSel ? 3.4 : 1.6) + '"/>';
      h += '<polygon points="' + poly(q[0], q[1], HS - 1.5) + '" fill="' + fill + '" opacity="' + (t.owner >= 0 ? '.82' : '1') + '" style="mix-blend-mode:var(--blend)"/>';
      if (t.second >= 0) h += '<polygon points="' + poly(q[0] + 4, q[1] + 3, HS * .6) + '" fill="' + SIDES[t.second] + '" opacity=".85" style="mix-blend-mode:var(--blend)"/>';
      if (isMenu) h += '<polygon points="' + poly(q[0], q[1], HS - 7) + '" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-dasharray="4 3"/><text x="' + q[0] + '" y="' + (q[1] - 15) + '" text-anchor="middle" font-size="9.5" font-weight="800" font-family="var(--font-ui)" fill="var(--ink)">' + (st.menu.indexOf(t.name) + 1) + '</text>';
      h += '<text x="' + q[0] + '" y="' + (q[1] + 4) + '" text-anchor="middle" font-size="12" font-weight="700" font-family="var(--font-num)" fill="var(--ink)">' + t.name + '</text>';
      if (isSel) h += '<polygon points="' + poly(q[0], q[1], HS + 1) + '" fill="none" stroke="var(--gules)" stroke-width="2" stroke-dasharray="3 3"/>';
      h += '</g>';
    });
    el.innerHTML = h + '</svg>';
    $$('#canvas .hexg').forEach(function (g) { g.addEventListener('click', function () { tileAct(g.getAttribute('data-n')); }); g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tileAct(g.getAttribute('data-n')); } }); });
    renderInspect(); renderTurn();
  }
  function otherCanvas() {
    var t = st.tpl;
    var w = '<svg viewBox="0 0 640 330" role="img" aria-label="Template preview, stylised"><rect width="640" height="330" fill="var(--paper-2)"/>';
    if (t === 'choice') { ['A', 'B', 'C', 'D'].forEach(function (l, i) { var x = 40 + (i % 2) * 300, y = 80 + Math.floor(i / 2) * 110; w += '<rect x="' + x + '" y="' + y + '" width="270" height="92" fill="var(--paper)" stroke="var(--ink)" stroke-width="2.5"/><rect x="' + x + '" y="' + y + '" width="' + [160, 90, 210, 60][i] + '" height="92" fill="' + SIDES[i % 3] + '" opacity=".6" style="mix-blend-mode:var(--blend)"/><text x="' + (x + 16) + '" y="' + (y + 54) + '" font-size="30" font-weight="800" font-family="var(--font-display)" fill="var(--ink)">' + l + '</text>'; }); w += '<text x="40" y="52" font-size="24" font-weight="800" font-family="var(--font-display)" fill="var(--ink)" letter-spacing="1">WHICH DOOR DO WE TAKE?</text>'; }
    if (t === 'card') { w += '<rect x="170" y="30" width="300" height="270" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><circle cx="320" cy="110" r="46" fill="var(--or)" style="mix-blend-mode:var(--blend)"/><circle cx="332" cy="116" r="46" fill="var(--azure)" style="mix-blend-mode:var(--blend)"/><text x="320" y="204" text-anchor="middle" font-size="22" font-weight="800" font-family="var(--font-display)" fill="var(--ink)" letter-spacing="1">VIEWER HANDLE</text><path d="M200 222h240M200 244h160" stroke="var(--ink)" stroke-width="3"/><g fill="var(--gules)"><circle cx="220" cy="272" r="9"/><circle cx="250" cy="272" r="9"/><circle cx="280" cy="272" r="9"/></g>'; }
    if (t === 'draw') { w += '<circle cx="320" cy="120" r="76" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><g style="mix-blend-mode:var(--blend)"><rect x="268" y="96" width="52" height="30" fill="var(--gules)" transform="rotate(-14 294 111)"/><rect x="316" y="118" width="52" height="30" fill="var(--or)" transform="rotate(10 342 133)"/></g>'; for (var i = 0; i < 3; i++) w += '<rect x="' + (170 + i * 110) + '" y="250" width="100" height="50" fill="var(--paper)" stroke="var(--ink)" stroke-width="2.5"/><text x="' + (220 + i * 110) + '" y="282" text-anchor="middle" font-size="13" font-family="var(--font-num)" fill="var(--ink)">seat ' + (i + 1) + '</text>'; }
    if (t === 'meter') { w += '<rect x="80" y="130" width="480" height="60" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><rect x="80" y="130" width="320" height="60" fill="var(--or)" opacity=".8" style="mix-blend-mode:var(--blend)"/><rect x="80" y="130" width="210" height="60" fill="var(--gules)" opacity=".7" style="mix-blend-mode:var(--blend)"/><text x="320" y="110" text-anchor="middle" font-size="26" font-weight="800" font-family="var(--font-display)" letter-spacing="2" fill="var(--ink)">66% OF THE GOAL</text><text x="80" y="228" font-size="14" font-family="var(--font-num)" fill="var(--ink-2)">last three: 250 bits · 1 sub · 10 gifts</text>'; }
    return w + '</svg>';
  }
  function tileAct(n) {
    var t = tile(n), tool = st.tool;
    if (tool === 'select') { st.sel = n; }
    else if (tool === 'menu') { var i = st.menu.indexOf(n); if (i >= 0) st.menu.splice(i, 1); else { if (st.menu.length >= 3) st.menu.shift(); st.menu.push(n); } renderPV(); }
    else { t.owner = tool === 'fog' ? -1 : +tool; t.second = -1; renderPV(); }
    renderCanvas();
  }
  function renderInspect() {
    var el = $('#inspect'), t = st.sel ? tile(st.sel) : null;
    if (!t) { el.innerHTML = '<span class="serif">No tile in hand: choose one on the map.</span><span class="hint">' + names.map(function (n, i) { return '<span style="color:' + SIDETXT[i] + ';font-weight:700">' + esc(n) + '</span> ' + tiles.filter(function (x) { return x.owner === i; }).length; }).join(' · ') + ' · fog ' + tiles.filter(function (x) { return x.owner < 0; }).length + (tiles.filter(function (x) { return x.owner < 0; }).length === 1 ? ' tile' : ' tiles') + '</span>'; return; }
    var nb = tiles.filter(function (x) { return Math.abs(x.c - t.c) <= 1 && Math.abs(x.r - t.r) <= 1 && x !== t; });
    el.innerHTML = '<b class="t">' + t.name + '</b><span class="chip ' + (t.owner === 0 ? 'azure' : t.owner === 1 ? 'gules' : t.owner === 2 ? 'or' : 'dash') + '">' + (t.owner >= 0 ? esc(names[t.owner]) : 'unclaimed fog') + '</span>' + (t.second >= 0 ? '<span class="chip warn">contested by ' + esc(names[t.second]) + '</span>' : '') + (st.menu.indexOf(t.name) >= 0 ? '<span class="chip solid">on the move menu · ' + (st.menu.indexOf(t.name) + 1) + '</span>' : '') + '<span class="hint">borders ' + nb.length + ' tiles · ' + nb.filter(function (x) { return x.owner !== t.owner; }).length + ' of another side</span>';
  }
  /* ---------- turn ---------- */
  var tmr = null;
  function renderTurn() {
    var T = st.turn, el = $('#turnbar');
    var tal = st.menu.map(function (n, i) { var v = T.counts[i], pct = T.revealed ? v / Math.max(1, T.counts.reduce(function (a, b) { return a + b; }, 0)) * 100 : (T.running ? 100 : 0); return '<div><small>' + (i + 1) + ' · ' + n + (T.revealed ? ' · ' + v : '') + '</small><div class="bar ' + (T.running && st.sealed ? 'sealed' : '') + '"><i style="width:' + (T.revealed ? pct : 0) + '%;background:' + (T.win === i ? 'var(--ink)' : SIDES[i]) + '"></i></div></div>'; }).join('');
    el.innerHTML = '<div><div class="kicker">Turn ' + T.n + ' · ' + esc(names[T.side]) + ' moves</div><div class="clock">' + (T.running ? CC.fmt.ms(T.left) : T.revealed ? 'SEALED' : CC.fmt.ms(st.cadence)) + '</div></div><div class="tal">' + tal + '</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><button class="btn plate" id="run-turn"' + (T.running ? ' disabled' : '') + '>' + CC.icon('play') + 'Run a test turn</button><span class="hint">' + (T.running ? 'Picks sealed: <b class="num">' + T.sealedN + '/' + st.allow.length + '</b>' : 'Fast test: ' + T.total + ' s, not ' + st.cadence + ' s') + '</span></div>';
    $('#run-turn').addEventListener('click', runTurn);
  }
  function runTurn() {
    var T = st.turn; if (T.running) return; if (CC.state.twitch !== 'connected') { CC.toast('Twitch is not connected: a muster (hosted test) needs the link'); return; }
    T.running = true; T.revealed = false; T.left = T.total; T.counts = [0, 0, 0]; T.win = null; T.sealedN = 0; var rng = CC.mulberry(CC.hashInt('turn' + T.n)), picks = [];
    st.allow.forEach(function () { var r = rng(); picks.push(r < .46 ? 0 : r < .8 ? 1 : 2); });
    clearInterval(tmr);
    tmr = setInterval(function () {
      T.left--; T.sealedN = Math.min(st.allow.length, Math.round((T.total - T.left) / T.total * st.allow.length * 1.15));
      if (T.left <= 0) { clearInterval(tmr); T.running = false; T.revealed = true; picks.slice(0, st.allow.length).forEach(function (p) { T.counts[p]++; }); var best = 0; T.counts.forEach(function (c, i) { if (c > T.counts[best]) best = i; }); T.win = best; var t = tile(st.menu[best]); if (t) { t.owner = T.side; t.second = -1; } st.testTurns++; T.n++; T.side = (T.side + 1) % 3; renderCanvas(); renderPV(); renderLadder(); CC.toast('Sealed. ' + st.menu[best] + ' falls to ' + names[(T.side + 2) % 3]); CC.flash($('#canvas')); return; }
      renderTurn(); renderPV();
    }, 1000); renderTurn(); renderPV();
  }

  /* ---------- pieces (components) ---------- */
  function renderPieces() {
    var list = TPL[st.tpl].pieces;
    $('#pieces').innerHTML = list.map(function (f) {
      var on = st.pieces[st.tpl + f[0]] !== false;
      return '<li><span>' + CC.icon(f[3]) + '</span><span><b>' + f[1] + '</b><small>' + f[2] + '</small></span><button class="sw2" role="switch" aria-checked="' + on + '" aria-pressed="' + on + '" data-k="' + f[0] + '" aria-label="Show ' + f[1] + ' to viewers"></button></li>';
    }).join('');
    $('#pieces-meta').textContent = list.filter(function (f) { return st.pieces[st.tpl + f[0]] !== false; }).length + ' of ' + list.length + ' on';
    $$('#pieces .sw2').forEach(function (b) { b.addEventListener('click', function () { var k = st.tpl + b.getAttribute('data-k'); st.pieces[k] = st.pieces[k] === false; renderPieces(); renderPV(); }); });
  }
  function fon(k) { return st.pieces[st.tpl + k] !== false; }

  /* ---------- orders (operator controls) ---------- */
  function renderOrders() {
    var d = st.driver;
    var h = '<div class="f"><span class="f-l">Who drives</span><div class="seg2" id="drv" style="display:flex" role="group" aria-label="Who drives">' + [['human', 'Human'], ['ai', 'AI streamer'], ['both', 'Both']].map(function (x) { return '<button style="flex:1" data-d="' + x[0] + '" aria-pressed="' + (d === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div><p class="hint" style="margin-top:4px">' + (d === 'both' ? esc(H.operator) + ' (sample setting)' : d === 'ai' ? 'The AI streamer runs turns on its own. A human can still recall a turn before the seal.' : 'You choose the moves and run the turn.') + '</p></div>';
    h += '<div class="f"><span class="f-l">Viewers can</span>' + [['vote', 'Vote'], ['pick', 'Pick a tile'], ['join', 'Join a side']].map(function (x) { return '<label class="chk"><input type="checkbox" data-c="' + x[0] + '"' + (st.can[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</div>';
    h += '<label class="f"><span>Cadence <b class="num" id="cad-v">each ' + st.cadence + ' s</b></span><input type="range" id="cad" min="30" max="180" step="15" value="' + st.cadence + '" aria-label="Seconds per turn"></label>';
    h += '<label class="chk"><input type="checkbox" id="seal"' + (st.sealed ? ' checked' : '') + '><span>Sealed until the turn ends <span class="muted">(' + esc(H.turn) + ')</span></span></label>';
    h += '<label class="f"><span>Limit</span><select id="lim"><option value="1">One pick per viewer per turn</option><option value="2">Two picks per viewer per turn</option></select></label>';
    if (d !== 'human') h += '<div class="ai-card" id="aicard"></div>';
    $('#orders').innerHTML = h;
    $('#lim').value = String(st.perLim);
    $$('#drv button').forEach(function (b) { b.addEventListener('click', function () { st.driver = b.getAttribute('data-d'); renderOrders(); renderPV(); }); });
    $$('#orders [data-c]').forEach(function (c) { c.addEventListener('change', function () { st.can[c.getAttribute('data-c')] = c.checked; renderPV(); }); });
    $('#cad').addEventListener('input', function (e) { st.cadence = +e.target.value; $('#cad-v').textContent = 'each ' + st.cadence + ' s'; renderTurn(); });
    $('#seal').addEventListener('change', function (e) { st.sealed = e.target.checked; renderTurn(); renderPV(); });
    $('#lim').addEventListener('change', function (e) { st.perLim = +e.target.value; });
    renderAI();
  }
  function renderAI() {
    var el = $('#aicard'); if (!el) return;
    if (st.aiPending) {
      el.innerHTML = '<div class="kicker">The AI proposes</div><div class="redline" style="font-size:13.5px"><div><ins>Move menu: F3, E4, D2</ins></div><div class="muted" style="padding-top:0">reason: three contested borders between sides</div></div><div style="display:flex;gap:6px"><button class="btn sm primary" id="ai-ok">' + CC.icon('check') + 'Approve</button><button class="btn sm ghost" id="ai-no">Skip</button></div>';
      $('#ai-ok').addEventListener('click', function () { st.menu = ['F3', 'E4', 'D2']; st.aiPending = false; renderAI(); renderCanvas(); renderPV(); CC.toast('Approved: the move menu is set'); });
      $('#ai-no').addEventListener('click', function () { st.aiPending = false; renderAI(); });
    } else el.innerHTML = '<div class="kicker">The AI proposes</div><p class="hint">No orders waiting. It proposes a new menu each turn; the human approves.</p><button class="btn sm ghost" id="ai-more">Ask for a new proposal</button>';
    var m = $('#ai-more'); if (m) m.addEventListener('click', function () { st.aiPending = true; renderAI(); });
  }

  /* ---------- spyglass (viewer preview) ---------- */
  function miniBoard() {
    var s = 7.4, W = s * SQ * (H.cols + .5) + 6, Hh = s * 1.5 * H.rows + s * .5 + 6, h = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + Hh.toFixed(0) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
    tiles.forEach(function (t) { var x = s * SQ * (t.c + (t.r % 2 ? .5 : 0)) + s * SQ / 2 + 3, y = s * 1.5 * t.r + s + 3, m = st.menu.indexOf(t.name); h += '<polygon points="' + poly(x, y, s - .6) + '" fill="' + (t.owner >= 0 ? SIDES[t.owner] : 'var(--paper)') + '" opacity="' + (t.owner >= 0 ? .85 : 1) + '" stroke="var(--ink)" stroke-width="' + (m >= 0 ? 1.8 : .7) + '"/>'; if (m >= 0) h += '<text x="' + x + '" y="' + (y + 2.6) + '" text-anchor="middle" font-size="7" font-weight="800" font-family="var(--font-ui)" fill="var(--ink)">' + (m + 1) + '</text>'; });
    return h + '</svg>';
  }
  /* empty state: a bare map table (trestle table, one rolled map, a pennant marker) */
  function emptyTable() {
    return '<div class="pv-empty"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 34h44M12 34l-3 14M44 34l3 14M10.5 42h35"/><rect x="14" y="27" width="24" height="7" rx="3.5"/><path d="M17.5 27v7"/><path d="M43 34V18l7 3.5-7 3.5"/></svg><b>The map table is bare</b><span>Switch a piece on (4.1) and viewers see it here.</span></div>';
  }
  function renderPV() {
    var mob = st.device === 'mob', T = st.turn, h = '<div class="pvbox ' + (mob ? 'mob' : 'desk') + '" id="pvframe"><div class="pv-stream"></div>' + (mob ? '<div style="position:absolute;left:0;right:0;top:0;height:34%;display:grid;place-items:center;font:700 12px var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">stream</div>' : '<div style="position:absolute;left:10px;top:8px;font:700 12px var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">stream</div>');
    h += '<div class="pv-ext"><div class="hd"><span>' + (st.tpl === 'hex' ? 'Video component' : TPL[st.tpl].name) + '</span><span>' + (T.running ? 'turn ' + T.n + ' · ' + CC.fmt.ms(T.left) : 'test') + '</span></div><div class="bd">';
    var shown = TPL[st.tpl].pieces.filter(function (f) { return fon(f[0]); });
    if (!shown.length) h += emptyTable();
    else if (st.tpl === 'hex') {
      if (fon('board')) h += miniBoard();
      if (fon('clock')) h += '<div class="pv-status"><span>' + esc(names[T.side]) + ' moves</span><span class="num">' + (T.running ? CC.fmt.ms(T.left) : '--:--') + '</span></div>';
      if (fon('menu')) h += '<div class="pv-menu">' + st.menu.map(function (n, i) { var can = st.can.pick; return '<button data-p="' + i + '" aria-pressed="' + (st.picked === i) + '"' + (can ? '' : ' disabled') + '><span>' + (i + 1) + ' · Take ' + n + '</span><span>' + (st.picked === i ? (T.running && st.sealed ? 'sealed ✓' : 'picked') : '') + '</span></button>'; }).join('') + '</div>';
      if (fon('tally')) h += '<div class="pv-status" style="color:var(--muted)"><span>tallies</span><span>' + (T.revealed ? T.counts.join(' · ') : st.sealed ? 'sealed' : 'live') + '</span></div>';
      if (fon('standing')) h += '<div class="pv-status"><span>banners 3 · standing 12</span><span class="muted">next rung 25</span></div>';
    } else h += '<div style="flex:1;display:grid;place-items:center;font:italic 13px var(--font-serif);color:var(--muted);text-align:center">' + esc(TPL[st.tpl].name) + '<br>' + shown.map(function (f) { return f[1]; }).join(' · ') + '</div>';
    if (st.tpl === 'hex' && st.can.join) h += '<div class="pv-status" style="color:var(--muted)"><span>join a side: ' + esc(names[0]) + ' · ' + esc(names[1]) + ' · ' + esc(names[2]) + '</span></div>';
    h += '</div></div></div>';
    $('#pv').innerHTML = h;
    $$('#pv [data-p]').forEach(function (b) { b.addEventListener('click', function () { st.picked = +b.getAttribute('data-p'); renderPV(); }); });
    $$('#pv-dev button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-d') === st.device)); });
  }

  /* ---------- test ladder (a table: Sand table · local test -> Muster · hosted test -> Proclaimed · released) ---------- */
  var RUNGS = { sand: { name: 'Sand table', fn: 'local test' }, muster: { name: 'Muster', fn: 'hosted test' }, proclaimed: { name: 'Proclaimed', fn: 'released after Twitch review' } };
  function rung(id, cls, mark, body) { var r = RUNGS[id]; return '<div class="rg ' + cls + '"><div class="n">' + mark + '</div><div><div class="rh"><b>' + r.name + '</b><span class="pl">· ' + r.fn + '</span></div>' + body + '</div></div>'; }
  function renderLadder() {
    var ready = st.testTurns >= 1;
    var h = rung('sand', 'done', '✓', '<p>Runs on this machine only. Board loads, picks seal, tallies reveal.</p>');
    h += rung('muster', 'now', '2', '<p>Hosted for the accounts on the muster roll, on your own channel. Only they, and a few Twitch staff, can see it. <b>' + esc(H.test_stage) + '</b> (sample).</p><div class="acct" id="acct" aria-label="Allowlisted accounts"></div><div style="display:flex;gap:6px;margin-top:8px"><label class="f" style="flex:1"><span class="sr">Add an account to the allowlist</span><input type="text" id="acc-in" placeholder="add a handle" style="height:28px" aria-label="Add an account to the allowlist"></label><button class="btn sm" id="acc-add">Add</button></div><p class="hint" style="margin-top:6px">Test turns run: <b class="num">' + st.testTurns + '</b></p>');
    h += rung('proclaimed', st.submitted ? 'now' : 'lock', st.submitted ? CC.icon('clock') : '3', '<p>Twitch reviews every release: <b>8 to 14 days</b>, one version at a time. Resubmitting resets your place in the queue. A rejection revokes the client ID for good, so hold a full muster first.</p><ul class="checks">' + CHECKS.map(function (c) { return '<li>' + CC.icon('check') + '<span>' + c + '</span></li>'; }).join('') + '</ul>' +
      (st.submitted ? '<div class="chip warn" style="margin-top:8px">In review · 8 to 14 days (sample)</div> <button class="btn sm ghost" id="withdraw" style="margin-top:6px">Withdraw</button>' : '<button class="btn sm ' + (ready ? 'primary' : '') + '" id="submit" style="margin-top:10px"' + (ready ? '' : ' disabled') + '>Submit for review</button>' + (ready ? '' : ' <span class="hint">Run a test turn first.</span>')));
    $('#ladder').innerHTML = h;
    var ac = $('#acct'); ac.innerHTML = st.allow.map(function (a, i) { return '<button class="chip dash" data-i="' + i + '" title="Remove from the allowlist" style="text-transform:none">' + esc(a) + ' ×</button>'; }).join('') || '<span class="hint">The muster roll is empty: nobody can see the test.</span>';
    $$('#acct button').forEach(function (b) { b.addEventListener('click', function () { st.allow.splice(+b.getAttribute('data-i'), 1); renderLadder(); renderTurn(); }); });
    $('#acc-add').addEventListener('click', function () { var v = $('#acc-in').value.trim().replace(/[^\w]/g, '').toLowerCase(); if (!v) return; if (st.allow.length >= 40) { CC.toast('The roll is full: 40 is plenty for a muster'); return; } st.allow.push(v); renderLadder(); renderTurn(); });
    $('#acc-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#acc-add').click(); });
    var s = $('#submit'); if (s) s.addEventListener('click', function () { st.submitted = true; renderLadder(); CC.toast('Submitted (prototype: nothing is sent to Twitch)'); });
    var w = $('#withdraw'); if (w) w.addEventListener('click', function () { st.submitted = false; renderLadder(); });
  }

  /* ---------- templates ---------- */
  function renderTpl() {
    var th = { hex: '<g fill="none" stroke="var(--ink)" stroke-width="2"><polygon points="30,32 40,26 50,32 50,44 40,50 30,44"/><polygon points="50,32 60,26 70,32 70,44 60,50 50,44" fill="var(--azure)" opacity=".6"/><polygon points="40,50 50,44 60,50 60,62 50,68 40,62" fill="var(--gules)" opacity=".6"/></g>', choice: '<g stroke="var(--ink)" stroke-width="2" fill="var(--paper)"><rect x="14" y="10" width="42" height="20"/><rect x="64" y="10" width="42" height="20"/><rect x="14" y="36" width="42" height="20"/><rect x="64" y="36" width="42" height="20"/></g><rect x="14" y="10" width="28" height="20" fill="var(--or)" opacity=".7"/>', card: '<rect x="30" y="6" width="60" height="52" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/><circle cx="60" cy="24" r="10" fill="var(--gules)" opacity=".7"/><path d="M40 42h40M40 48h26" stroke="var(--ink)" stroke-width="2"/>', draw: '<circle cx="60" cy="28" r="18" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/><rect x="48" y="24" width="14" height="8" fill="var(--gules)" opacity=".7"/><g stroke="var(--ink)" stroke-width="2" fill="var(--paper)"><rect x="22" y="50" width="22" height="10"/><rect x="49" y="50" width="22" height="10"/><rect x="76" y="50" width="22" height="10"/></g>', meter: '<rect x="14" y="24" width="92" height="16" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/><rect x="14" y="24" width="60" height="16" fill="var(--or)" opacity=".8"/><rect x="14" y="24" width="38" height="16" fill="var(--gules)" opacity=".6"/>' };
    $('#tpl').innerHTML = Object.keys(TPL).map(function (k) { return '<button data-k="' + k + '" aria-pressed="' + (st.tpl === k) + '"><svg viewBox="0 0 120 64" aria-hidden="true">' + th[k] + '</svg><b>' + TPL[k].name + '</b><small>' + TPL[k].note + '</small></button>'; }).join('');
    $$('#tpl button').forEach(function (b) { b.addEventListener('click', function () { st.tpl = b.getAttribute('data-k'); st.sel = null; if (st.tpl !== 'hex') st.tool = 'select'; renderAll(); }); });
  }
  function renderAll() { renderTools(); renderCanvas(); renderPieces(); renderPV(); renderTpl(); }

  /* ---------- steward ---------- */
  function propose(text) {
    var s = text.toLowerCase(), lines = [], acts = [];
    var tm = { 'choice board': 'choice', choice: 'choice', 'viewer card': 'card', card: 'card', 'contribution meter': 'meter', meter: 'meter', 'cast of lots': 'draw', 'the draw': 'draw', lots: 'draw', hex: 'hex', map: 'hex' };
    Object.keys(tm).some(function (k) { if (s.indexOf(k) >= 0 && /add|switch|use|make|show|template|build/.test(s)) { var to = tm[k]; if (to !== st.tpl) { lines.push({ op: 'del', s: 'Template: ' + TPL[st.tpl].name }); lines.push({ op: 'ins', s: 'Template: ' + TPL[to].name }); acts.push(function () { st.tpl = to; st.sel = null; st.tool = 'select'; renderAll(); }); } return true; } return false; });
    var cad = s.match(/(\d{2,3})\s*(s|sec|seconds)\b/); if (cad && /every|each|cadence|turn/.test(s)) { var cv = Math.max(30, Math.min(180, Math.round(+cad[1] / 15) * 15)); lines.push({ op: 'del', s: 'Cadence: each ' + st.cadence + ' s' }); lines.push({ op: 'ins', s: 'Cadence: each ' + cv + ' s' }); acts.push(function () { st.cadence = cv; renderOrders(); renderTurn(); }); }
    if (/ai (drive|streamer|run)|let the ai/.test(s)) { lines.push({ op: 'del', s: 'Who drives: ' + st.driver }); lines.push({ op: 'ins', s: 'Who drives: ai (a human can still recall a turn)' }); acts.push(function () { st.driver = 'ai'; renderOrders(); renderPV(); }); }
    else if (/human (only|drive)|i drive|myself/.test(s)) { lines.push({ op: 'del', s: 'Who drives: ' + st.driver }); lines.push({ op: 'ins', s: 'Who drives: human' }); acts.push(function () { st.driver = 'human'; renderOrders(); renderPV(); }); }
    if (/mobile|phone/.test(s)) { lines.push({ op: 'ins', s: 'Spyglass (viewer preview): mobile' }); acts.push(function () { st.device = 'mob'; renderPV(); }); }
    var paint = s.match(/(?:paint|claim|give)\s+(?:tile\s+)?([a-i][1-6])\s+(?:for|to)\s+(quill|tallow|sable)/);
    if (paint) { var t = tile(paint[1].toUpperCase()), si = ['quill', 'tallow', 'sable'].indexOf(paint[2]); if (t) { lines.push({ op: 'del', s: 'Tile ' + t.name + ': ' + (t.owner >= 0 ? names[t.owner] : 'fog') }); lines.push({ op: 'ins', s: 'Tile ' + t.name + ': ' + names[si] }); acts.push(function () { t.owner = si; t.second = -1; st.sel = t.name; renderAll(); }); } }
    if (!acts.length) return null;
    return { title: 'Draft writ · map and orders', lines: lines, note: 'Only the data changes, never the code: the shell stays the one Twitch reviewed. Nothing moves until you seal it.', toast: 'Sealed: the map is redrawn', apply: function () { acts.forEach(function (f) { f(); }); CC.flash($('#hero')); } };
  }

  function init() {
    H = S.studio.hexmap; names = H.sides.slice(); buildTiles();
    var seen = S.viewers.map(function (v) { return v.login; }).sort(); st.allow = seen.filter(function (x, i) { return i % 11 === 3; }).slice(0, 12);
    st.turn.side = 1;
    renderAll(); renderOrders(); renderLadder();
    $('#head-actions').innerHTML = '<span class="chip ' + (/hosted/.test(H.test_stage) ? 'solid-or' : 'dash') + '">Muster · hosted test</span><span class="chip dash">' + H.cols + '×' + H.rows + ' hex · ' + names.length + ' sides</span>';
    $$('#pv-dev button').forEach(function (b) { b.addEventListener('click', function () { st.device = b.getAttribute('data-d'); renderPV(); }); });
    CC.steward.setup({ intro: 'Tell me how the map should change and I will draft a writ. I touch data only, never code; nothing moves until you seal it.', examples: ['switch to a choice board', 'run it every 60 seconds, let the AI drive', 'claim tile E3 for Tallow, then show the mobile preview'], propose: propose });
    CC.on(function () { renderTurn(); });
  }
})();
