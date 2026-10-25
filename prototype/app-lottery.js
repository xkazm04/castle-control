/* Lot Chamber (lottery manager): the roll of lots, setup, fairness, on-stream preview, past draws, writ sub-view (proof bundle) */
(function () {
  'use strict';
  var CC = window.CC, S = CC.S, $ = CC.$, $$ = CC.$$, esc = CC.esc;
  CC.ready = init;
  var D, st = {}, cfgs = {}, sel = 'urn-questions', universe = {}, timers = {}, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PRE = ['ash', 'bone', 'candle', 'cinder', 'crypt', 'dusk', 'ember', 'fog', 'grave', 'hollow', 'ink', 'lantern', 'ledger', 'moth', 'quill', 'rook', 'sable'];
  var SUF = ['bard', 'clerk', 'crow', 'elk', 'fox', 'hare', 'imp', 'knight', 'mage', 'monk', 'newt', 'owl', 'page', 'rat', 'scribe', 'smith', 'toad', 'warden', 'wisp', 'wolf'];
  var SHAPES = [['urn', 'Drum'], ['wheel', 'Wheel'], ['deck', 'Deck'], ['ballot', 'Ballot box']];
  var POOLS = [['chatters10', 'All chatters, last 10 min'], ['followers', 'Followers'], ['subs', 'Subscribers'], ['points', 'Channel-point redeemers'], ['keyword', 'People who typed a keyword']];
  var TIERWIN = { S: 3, M: 3, L: 7, XL: 15 };

  /* ---------- roll ---------- */
  function mk(login, v, i) { var age = v.account_age_days; return { no: 0, login: login, follower: !!v.follower, sub: v.sub_tier | 0, age: age, raid: !!v.raid_cohort, isnew: age < 7 }; }
  function buildUniverse(d) {
    var rng = CC.mulberry(CC.hashInt(d.id)), base = S.viewers.slice(), out = [], i;
    function shuffle(a) { for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)), t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
    if (d.id === 'jury') { out = base.map(function (v) { return mk(v.login, v); }); }
    else if (d.id === 'sub-thanks') {
      out = base.filter(function (v) { return v.follower; }).map(function (v) { return mk(v.login, v); });
      var seen = {}; out.forEach(function (e) { seen[e.login] = 1; });
      while (out.length < d.entries + 40) {
        var lg = PRE[Math.floor(rng() * PRE.length)] + SUF[Math.floor(rng() * SUF.length)] + Math.floor(rng() * 99 + 1);
        if (seen[lg]) continue; seen[lg] = 1;
        var r = rng();
        out.push({ no: 0, login: lg, follower: true, sub: rng() < .12 ? 1 + Math.floor(rng() * 2) : 0, age: [2, 5, 30, 120, 400, 900, 1500][Math.floor(rng() * 7)], raid: rng() < .04, isnew: false });
        out[out.length - 1].isnew = out[out.length - 1].age < 7;
      }
    } else { out = shuffle(base.map(function (v) { return mk(v.login, v); })); }
    out.forEach(function (e, k) { e.no = k + 1; });
    return out;
  }
  function origN(d) { return typeof d.entries === 'number' ? d.entries : 100; }
  function filterRoll(c) {
    var u = universe[c.id], d = byId(c.id), o = origCfg(d);
    var same = c.pool === o.pool && c.only === o.only;
    var list;
    if (same) list = u.slice(0, origN(d));
    else {
      var rng = CC.mulberry(CC.hashInt(c.id + c.pool));
      list = u.filter(function (e) {
        if (c.pool === 'followers' && !e.follower) return false;
        if (c.pool === 'subs' && !e.sub) return false;
        if (c.pool === 'points' && !(e.follower && (CC.hashInt(e.login + 'p') % 100) < 38)) return false;
        if (c.pool === 'keyword' && (CC.hashInt(e.login + c.keyword) % 100) > 61) return false;
        if (c.only === 'followers' && !e.follower) return false;
        if (c.only === 'subs' && !e.sub) return false;
        return true;
      });
    }
    return list.map(function (e, i) { var o2 = Object.assign({}, e); o2.no = i + 1; return o2; });
  }
  function byId(id) { return D.draws.filter(function (d) { return d.id === id; })[0]; }
  function origCfg(d) {
    var o = { id: d.id, name: d.name, content: 'question', pool: 'keyword', only: '', keyword: '!ask', freePath: false, weights: 'equal', winners: d.winners, cooldown: 0, cap: 'none', eur: '', prizeText: '', rules: false, disc: false, region: 'unset', shape: d.visual, timing: 6 };
    if (d.cohort_cap) o.cap = 'third';
    if (/no repeat for (\d+)/.test(d.cooldown || '')) o.cooldown = +RegExp.$1;
    if (d.id === 'sub-thanks') { o.content = 'prize'; o.pool = 'followers'; o.freePath = true; o.eur = 40; o.prizeText = 'signed print'; o.rules = true; o.disc = true; o.region = 'EU · 18+'; }
    if (d.id === 'jury') { o.content = 'jury'; o.pool = 'chatters10'; o.winners = 'tier'; }
    return o;
  }
  function cfgOf(id) { return cfgs[id]; }
  function winN(c) { return c.winners === 'tier' ? TIERWIN[S.channel.room_tier] || 7 : Math.max(1, +c.winners || 1); }
  function lastWinners(k) { var set = {}; D.past.slice(-k).forEach(function (p) { p.winners.forEach(function (w) { set[w] = 1; }); }); return set; }

  /* ---------- the cast (deterministic, recomputable) ---------- */
  function weightOf(e, mode) { if (mode === 'sub2') return e.sub ? 2 : 1; if (mode === 'age') return e.age >= 900 ? 1.5 : 1; return 1; }
  function cast(entries, value, seal, c) {
    var ex = c.cooldown ? lastWinners(c.cooldown) : {};
    var ranked = entries.map(function (e) {
      var h = CC.sha256(value + '|' + seal + '|' + e.login), u = (parseInt(h.slice(0, 13), 16) + 1) / (Math.pow(16, 13) + 1), w = weightOf(e, c.weights);
      return { e: e, h: h, key: -Math.log(u) / w, w: w, out: !!ex[e.login] };
    }).sort(function (a, b) { return a.key - b.key; });
    var n = winN(c), cap = c.cap === 'third' ? Math.floor(n / 3) : n, raid = 0, win = [];
    ranked.forEach(function (r) {
      if (win.length >= n) return;
      if (r.out) { r.note = 'cooldown'; return; }
      if (r.e.raid) { if (raid >= cap) { r.note = 'raider cap'; return; } raid++; }
      win.push(r); r.win = true;
    });
    return { ranked: ranked, winners: win, n: n, cap: cap };
  }
  var BASE_ROUND = 9267400 + 28800 * 10;
  function roundValue(r) { return CC.sha256('beacon:' + r); }
  function sealOf(entries) { return CC.sha256(entries.map(function (e) { return e.login; }).join('\n')); }
  function short(h, n) { return h.slice(0, n || 16) + '…'; }

  /* ---------- state per draw ---------- */
  function sget() { return st[sel]; }
  function initDraw(id) {
    var d = byId(id); universe[id] = buildUniverse(d);
    cfgs[id] = cfgs[id] || origCfg(d);
    st[id] = { shown: 0, entries: filterRoll(cfgs[id]), phase: 'open', sealed: null, round: null, value: null, eta: 0, result: null, intake: true, dry: false, filter: '' };
  }
  function selectDraw(id) {
    sel = id; if (!st[id]) initDraw(id); else st[id].shown = Math.min(st[id].shown, st[id].entries.length);
    fill(); renderAll();
  }
  function eligibleNote(s) { var c = cfgs[sel]; if (!c.cooldown) return ''; var ex = lastWinners(c.cooldown), k = s.entries.filter(function (e) { return ex[e.login]; }).length; return k ? k + ' held out by cooldown' : ''; }

  /* ---------- fill animation + live intake ---------- */
  function fill() {
    clearInterval(timers.fill); var s = sget();
    if (reduce) { s.shown = s.entries.length; renderHero(true); return; }
    s.shown = 0; var step = Math.max(2, Math.ceil(s.entries.length / 36));
    timers.fill = setInterval(function () { s.shown = Math.min(s.entries.length, s.shown + step); renderHero(true); if (s.shown >= s.entries.length) clearInterval(timers.fill); }, 38);
  }
  function intakeOk() { var s = sget(); return s.intake && s.phase === 'open' && CC.state.live && CC.state.twitch === 'connected' && sel !== 'jury'; }
  function trickle() {
    var s = sget(), c = cfgs[sel]; if (!intakeOk() || s.shown < s.entries.length) return;
    var u = universe[sel], cur = {}; s.entries.forEach(function (e) { cur[e.login] = 1; });
    var pool = filterAll(c).filter(function (e) { return !cur[e.login]; });
    if (!pool.length) return;
    var e = Object.assign({}, pool[0]); e.no = s.entries.length + 1; s.entries.push(e); s.shown = s.entries.length;
    addTicket(e, true); renderCount(); renderDots(); renderRollTable(); renderVerdict();
  }
  function filterAll(c) { var u = universe[c.id].slice(), d = byId(c.id), o = origCfg(d); var same = c.pool === o.pool && c.only === o.only; if (same) return u.slice(origN(d)); var keep = filterRoll(c); var have = {}; keep.forEach(function (e) { have[e.login] = e; }); return keep; }

  /* ---------- render: hero ---------- */
  var flagCol = { sub: 'var(--azure)', raid: 'var(--gules)', isnew: 'var(--or)' };
  function tkHTML(e, win) {
    return '<div class="tk' + (win ? ' win' : '') + '" data-no="' + e.no + '"><div class="stub"><b>' + String(e.no).padStart(4, '0') + '</b></div><div class="body"><span class="no">lot</span><span class="h">' + esc(e.login) + '</span><span class="fl">' +
      '<i style="background:' + (e.sub ? flagCol.sub : 'var(--hair-2)') + '"></i><i style="background:' + (e.isnew ? flagCol.isnew : 'var(--hair-2)') + '"></i><i style="background:' + (e.raid ? flagCol.raid : 'var(--hair-2)') + '"></i></span></div></div>';
  }
  function addTicket(e, animate) {
    var strip = $('#strip'); if (!strip) return;
    var w = 126; var div = document.createElement('div'); div.innerHTML = tkHTML(e); var t = div.firstChild; if (animate && !reduce) t.classList.add('new');
    strip.appendChild(t);
    while (strip.children.length > 14) strip.removeChild(strip.firstChild);
    if (animate && !reduce) { strip.style.transition = 'none'; strip.style.transform = 'translateX(' + w + 'px)'; void strip.offsetWidth; strip.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1)'; strip.style.transform = 'none'; }
  }
  function fillStrip() {
    var strip = $('#strip'), s = sget(); strip.innerHTML = '';
    s.entries.slice(Math.max(0, s.shown - 13), s.shown).forEach(function (e) { strip.insertAdjacentHTML('beforeend', tkHTML(e)); });
  }
  function counts(list) { var o = { all: list.length, fol: 0, sub: 0, raid: 0, nw: 0 }; list.forEach(function (e) { if (e.follower) o.fol++; if (e.sub) o.sub++; if (e.raid) o.raid++; if (e.isnew) o.nw++; }); return o; }
  function renderCount() {
    var s = sget(), b = $('#hr-big'); b.textContent = CC.fmt.n(s.shown); b.setAttribute('data-t', CC.fmt.n(s.shown));
  }
  function renderDots() {
    var s = sget(), svg = $('#dotmap'), list = s.entries, n = Math.max(list.length, 1);
    var W = 800, H = 104, gap = Math.max(11, Math.min(30, Math.floor(Math.sqrt((W - 16) * (H - 8) / n)))), r = gap * .3, cols = Math.floor((W - 16) / gap), rows = Math.ceil(n / cols);
    var winset = {}; if (s.result) s.result.winners.forEach(function (w) { winset[w.e.login] = 1; });
    var ex = cfgs[sel].cooldown ? lastWinners(cfgs[sel].cooldown) : {};
    var h = '';
    var oy = gap / 2 + 4;
    list.forEach(function (e, i) {
      if (i >= s.shown) { return; }
      var x = 8 + (i % cols) * gap + gap / 2, y = oy + Math.floor(i / cols) * gap;
      var g = '<g data-no="' + e.no + '">';
      g += '<circle cx="' + x + '" cy="' + y + '" r="' + (r * .72) + '" fill="var(--ink)" opacity="' + (ex[e.login] ? '.12' : '.34') + '"/>';
      if (e.sub) g += '<circle cx="' + (x - .6) + '" cy="' + y + '" r="' + (r + .6) + '" fill="var(--azure)" style="mix-blend-mode:var(--blend)" opacity=".92"/>';
      if (e.isnew) g += '<circle cx="' + (x + .9) + '" cy="' + (y - .4) + '" r="' + (r + .9) + '" fill="var(--or)" style="mix-blend-mode:var(--blend)" opacity=".95"/>';
      if (e.raid) g += '<circle cx="' + x + '" cy="' + (y + .9) + '" r="' + (r + .9) + '" fill="var(--gules)" style="mix-blend-mode:var(--blend)" opacity=".95"/>';
      if (winset[e.login]) g += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 4) + '" fill="none" stroke="var(--ink)" stroke-width="1.8"/><circle cx="' + x + '" cy="' + y + '" r="' + (r + 6.5) + '" fill="none" stroke="var(--gules)" stroke-width="1.4" stroke-dasharray="2 2"/>';
      g += '</g>'; h += g;
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.max(H, rows * gap + 12));
    svg.innerHTML = h;
    var c = counts(list.slice(0, s.shown));
    $('#legend').innerHTML = '<span><i style="background:var(--ink);opacity:.34"></i>' + c.all + ' lots</span><span><i style="background:var(--azure)"></i>' + c.sub + ' subscribers</span><span><i style="background:var(--or)"></i>' + c.nw + ' new accounts (&lt; 7 d)</span><span><i style="background:var(--gules)"></i>' + c.raid + ' raiders</span><span class="muted serif">overlaps blend into third colours</span>';
  }
  function poolText(c) {
    var p = POOLS.filter(function (x) { return x[0] === c.pool; })[0][1]; if (c.pool === 'keyword') p = 'People who typed ' + c.keyword;
    var o = c.only === 'followers' ? ' · followers only' : c.only === 'subs' ? ' · subscribers only' : ''; return p + o + (c.freePath ? ' + free !join path' : '');
  }
  /* seal button by phase: an open roll can be sealed; any later phase can only be voided */
  var SEAL_BTN = { open: { icon: 'seal', t: 'Seal the roll', cls: 'primary' }, sealed: { icon: 'unlock', t: 'Break the seal (void)', cls: 'ghost' } };
  function renderHero(light) {
    var s = sget(), c = cfgs[sel];
    renderCount(); $('#hr-draw').textContent = c.name; $('#hr-pool').textContent = poolText(c);
    var chips = s.phase === 'open' ? '<span class="chip gules">Roll open</span>' + (intakeOk() ? '<span class="chip dash">lots arriving · sample</span>' : '<span class="chip dash">intake paused</span>') : '<span class="chip solid">' + CC.icon('seal') + 'Roll sealed</span>';
    var note = eligibleNote(s); if (note) chips += '<span class="chip dash">' + note + '</span>';
    $('#hr-state').innerHTML = chips;
    var sb = SEAL_BTN[s.phase === 'open' ? 'open' : 'sealed'], seal = $('#btn-seal'); seal.innerHTML = CC.icon(sb.icon) + sb.t; seal.className = 'btn ' + sb.cls;
    var ib = $('#btn-intake'); ib.textContent = s.intake ? 'Pause intake' : 'Resume intake'; ib.setAttribute('aria-pressed', String(s.intake)); ib.disabled = s.phase !== 'open' || sel === 'jury';
    if (!light || s.shown === 0 || s.shown >= s.entries.length) fillStrip();
    renderDots();
  }
  function renderRollTable() {
    var s = sget(), q = (s.filter || '').toLowerCase(), tb = $('#rolltbl tbody'), rows = [], ex = cfgs[sel].cooldown ? lastWinners(cfgs[sel].cooldown) : {};
    var list = s.entries.slice(0, s.shown).slice().reverse();
    if (q) list = list.filter(function (e) { return e.login.indexOf(q) >= 0; });
    list.slice(0, 160).forEach(function (e) {
      var f = [];
      if (e.sub) f.push('<span class="chip azure">Sub ' + e.sub + '</span>'); if (e.isnew) f.push('<span class="chip or">New</span>'); if (e.raid) f.push('<span class="chip gules">Raid</span>'); if (ex[e.login]) f.push('<span class="chip dash">Cooldown</span>');
      rows.push('<tr><td class="n">' + String(e.no).padStart(4, '0') + '</td><td class="mono">' + esc(e.login) + '</td><td>' + (f.join(' ') || '<span class="muted">·</span>') + '</td></tr>');
    });
    if (!rows.length) rows.push('<tr><td colspan="3"><div class="empty" style="padding:14px"><b>' + (q ? 'Not on the roll' : 'No lots in the urn yet') + '</b><p>' + (q ? 'No handle matches “' + esc(q) + '” in this roll.' : 'The roll waits for its first lot. Entries arrive here as chat joins.') + '</p></div></td></tr>');
    tb.innerHTML = rows.join('');
  }

  /* ---------- render: draws list ---------- */
  function renderDrawList() {
    var h = '';
    D.draws.forEach(function (d) {
      var c = cfgs[d.id] || origCfg(d), prize = c.content === 'prize';
      var badges = prize ? '<span class="chip warn">Prize</span>' : '<span class="chip dash">no prize</span>';
      var blocked = d.id === 'sub-thanks';
      h += '<button class="drawrow" role="radio" aria-checked="' + (d.id === sel) + '" data-id="' + d.id + '">' + CC.icon(c.shape === 'wheel' ? 'star' : c.shape === 'deck' ? 'book' : c.shape === 'ballot' ? 'lock' : 'ticket') +
        '<span><b>' + esc(c.name) + '</b><small>' + esc(d.pool) + ' · ' + (d.winners) + ' ' + (d.winners === 1 ? 'winner' : 'winners') + '</small><span style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' + badges + (blocked ? '<span class="chip bad">Paid weight blocked</span>' : '') + '</span></span>' +
        '<span class="ct">' + CC.fmt.n(d.entries) + '<small>lots</small></span></button>';
    });
    $('#drawlist').innerHTML = h;
    $$('#drawlist .drawrow').forEach(function (b) { b.addEventListener('click', function () { selectDraw(b.getAttribute('data-id')); }); });
  }

  /* ---------- render: config form ---------- */
  function sel2(id, opts, val) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function seg(id, opts, val) { return '<div class="seg3" id="' + id + '" role="group">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === val) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function renderCfg() {
    var c = cfgs[sel], prize = c.content === 'prize', s = sget(), lockd = s.phase !== 'open';
    var h = '<label class="f"><span>Name</span><input type="text" id="c-name" value="' + esc(c.name) + '"></label>' +
      '<div class="f"><span class="f-l">Content · what is drawn</span>' + seg('c-content', [['question', 'A question'], ['idea', 'An idea'], ['prize', 'A prize'], ['jury', 'A jury seat']], c.content) + '</div>' +
      '<div class="rowf"><label class="f"><span>Pool · who can enter</span>' + sel2('c-pool', POOLS, c.pool) + '</label>' +
      (c.pool === 'keyword' ? '<label class="f"><span>Keyword</span><input type="text" id="c-kw" value="' + esc(c.keyword) + '"></label>' : '<label class="f"><span>Restrict to</span>' + sel2('c-only', [['', 'Anyone in the pool'], ['followers', 'Followers only'], ['subs', 'Subscribers only']], c.only) + '</label>') + '</div>' +
      (c.pool === 'keyword' ? '<div class="rowf"><label class="f"><span>Restrict to</span>' + sel2('c-only', [['', 'Anyone who typed it'], ['followers', 'Followers only'], ['subs', 'Subscribers only']], c.only) + '</label><div></div></div>' : '') +
      '<label class="chk"><input type="checkbox" id="c-free"' + (c.freePath ? ' checked' : '') + '><span><b>Free <code class="mono">!join</code> path, equal odds.</b> <span class="muted">Anyone can enter without paying.</span></span></label>' +
      '<div class="rowf three"><label class="f"><span>Entry weights</span>' + sel2('c-w', [['equal', 'Equal'], ['age', 'Longtime accounts ×1.5 (free)'], ['sub2', 'Subscribers ×2 (paid)']], c.weights) + '</label>' +
      '<label class="f"><span>Winners</span>' + (c.winners === 'tier' ? '<div class="seg3" style="height:32px"><button type="button" id="c-tier" aria-pressed="true" style="font-size:12px">' + winN(c) + ' · by room tier ' + S.channel.room_tier + '</button></div>' : '<input type="number" id="c-n" min="1" max="50" value="' + c.winners + '">') + '</label>' +
      '<label class="f"><span>Cooldown · no repeat</span>' + sel2('c-cd', [[0, 'None'], [1, 'For 1 draw'], [3, 'For 3 draws'], [5, 'For 5 draws']], c.cooldown) + '</label></div>' +
      '<div class="rowf"><label class="f"><span>Cohort cap</span>' + sel2('c-cap', [['none', 'No cap'], ['third', 'Raiders fill at most a third of the winners']], c.cap) + '</label>' +
      '<label class="f"><span>Draw winners</span>' + (c.winners === 'tier' ? '<button type="button" class="btn ghost" id="c-untier" style="justify-content:flex-start">Fix the count instead</button>' : '<button type="button" class="btn ghost" id="c-totier" style="justify-content:flex-start">3 / 7 / 15 by room tier</button>') + '</label></div>';
    if (prize) {
      h += '<div class="panel" style="display:flex;flex-direction:column;gap:12px"><div class="kicker t-or" style="color:var(--or-text)">Prize draw · required</div>' +
        '<div class="rowf"><label class="f"><span>Prize</span><input type="text" id="c-pt" value="' + esc(c.prizeText) + '" placeholder="e.g. signed print"></label><label class="f"><span>Prize value (EUR)</span><input type="number" id="c-eur" min="0" value="' + esc(c.eur) + '"></label></div>' +
        '<label class="f"><span>Region and age setting</span>' + sel2('c-reg', [['unset', 'Not set'], ['EU · 18+', 'EU · 18+'], ['Worldwide · 18+', 'Worldwide · 18+'], ['US · 18+', 'US · 18+']], c.region) + '</label>' +
        '<label class="chk"><input type="checkbox" id="c-rules"' + (c.rules ? ' checked' : '') + '><span>Official rules template confirmed</span></label>' +
        '<label class="chk"><input type="checkbox" id="c-disc"' + (c.disc ? ' checked' : '') + '><span>Show “Twitch does not sponsor this promotion” on stream</span></label></div>';
    }
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="c-save">Save draw</button><button class="btn ghost" id="c-reset">Reset to saved</button><span class="hint" style="align-self:center">Test before live: nothing here reaches chat until you seal the roll.</span></div>';
    var box = $('#cfg'); box.innerHTML = h;
    var dis = lockd; if (dis) { $$('input,select,.seg3 button', box).forEach(function (e) { if (e.id !== 'c-save') e.disabled = true; }); box.insertAdjacentHTML('afterbegin', '<div class="chip solid" style="align-self:flex-start">' + CC.icon('seal') + 'The roll is sealed: setup is frozen</div>'); }
    bindCfg();
  }
  function changed(refill) {
    var c = cfgs[sel], s = sget();
    s.entries = filterRoll(c); s.shown = Math.min(s.shown, s.entries.length);
    if (refill) { fill(); } renderHero(); renderRollTable(); renderVerdict(); renderDrawList(); renderShape();
  }
  function bindCfg() {
    var c = cfgs[sel];
    function on(id, ev, fn) { var e = $('#' + id); if (e) e.addEventListener(ev, fn); }
    on('c-name', 'input', function (e) { c.name = e.target.value; $('#hr-draw').textContent = c.name; });
    on('c-name', 'change', function () { renderDrawList(); });
    $$('#c-content button').forEach(function (b) { b.addEventListener('click', function () { c.content = b.getAttribute('data-v'); if (c.content === 'prize' && c.region === 'unset') { } renderCfg(); renderVerdict(); renderDrawList(); renderShape(); }); });
    on('c-pool', 'change', function (e) { c.pool = e.target.value; renderCfg(); changed(true); });
    on('c-only', 'change', function (e) { c.only = e.target.value; renderCfg(); changed(true); });
    on('c-kw', 'change', function (e) { c.keyword = e.target.value || '!ask'; changed(false); });
    on('c-free', 'change', function (e) { c.freePath = e.target.checked; renderHero(true); renderVerdict(); });
    on('c-w', 'change', function (e) { c.weights = e.target.value; renderVerdict(); });
    on('c-n', 'input', function (e) { c.winners = Math.max(1, Math.min(50, +e.target.value || 1)); renderVerdict(); });
    on('c-cd', 'change', function (e) { c.cooldown = +e.target.value; changed(false); });
    on('c-cap', 'change', function (e) { c.cap = e.target.value; renderVerdict(); });
    on('c-totier', 'click', function () { c.winners = 'tier'; renderCfg(); renderVerdict(); });
    on('c-untier', 'click', function () { c.winners = winN(c); renderCfg(); renderVerdict(); });
    on('c-pt', 'input', function (e) { c.prizeText = e.target.value; renderVerdict(); });
    on('c-eur', 'input', function (e) { c.eur = e.target.value; renderVerdict(); });
    on('c-reg', 'change', function (e) { c.region = e.target.value; renderVerdict(); });
    on('c-rules', 'change', function (e) { c.rules = e.target.checked; renderVerdict(); });
    on('c-disc', 'change', function (e) { c.disc = e.target.checked; renderVerdict(); renderShape(); });
    on('c-save', 'click', function () { CC.toast('Draw saved: ' + c.name); renderDrawList(); });
    on('c-reset', 'click', function () { cfgs[sel] = origCfg(byId(sel)); renderCfg(); changed(true); CC.toast('Back to the saved setup'); });
  }

  /* ---------- verdict: blocked / warnings / required ---------- */
  function issues() {
    var c = cfgs[sel], out = [], prize = c.content === 'prize', paidPool = c.pool === 'subs' || c.only === 'subs';
    if (prize && paidPool && !c.freePath) out.push({ lvl: 'block', t: 'Paid-only entry on a prize draw is blocked by default (subscribers, Bits, gift subs).', fix: 'Add the free path', fn: function () { c.freePath = true; c.only = c.only === 'subs' ? '' : c.only; if (c.pool === 'subs') c.pool = 'followers'; } });
    if (prize && c.weights === 'sub2') out.push({ lvl: 'block', t: 'Paid extra weight on a prize draw is blocked by default. A free path with equal odds is one click away.', fix: 'Equal odds', fn: function () { c.weights = 'equal'; } });
    if (!prize && paidPool) out.push({ lvl: 'warn', t: 'Subscriber-only entry puts a paid wall on this draw. Questions and ideas are free of friction, so consider a free path.', fix: 'Add free path', fn: function () { c.freePath = true; } });
    if (c.pool === 'points' && !c.freePath) out.push({ lvl: 'warn', t: 'Channel-point entry with no free path. Points are an Affiliate/Partner feature, and not every viewer can earn them.', fix: 'Add free path', fn: function () { c.freePath = true; } });
    if (prize) {
      if (!(+c.eur > 0) || !c.prizeText) out.push({ lvl: 'req', t: 'A prize needs a name and a value.' });
      if (!c.rules) out.push({ lvl: 'req', t: 'An official-rules template must be confirmed for a prize.', fix: 'Confirm template', fn: function () { c.rules = true; } });
      if (!c.disc) out.push({ lvl: 'req', t: 'The “Twitch does not sponsor this promotion” disclaimer must show on stream.', fix: 'Show it', fn: function () { c.disc = true; } });
      if (c.region === 'unset') out.push({ lvl: 'warn', t: 'No region and age setting. Prize rules differ by country.', fix: 'Set EU · 18+', fn: function () { c.region = 'EU · 18+'; } });
    }
    var s = sget(); if (!s.entries.length) out.push({ lvl: 'req', t: 'The roll is empty. There is nothing to seal yet.' });
    return out;
  }
  function renderVerdict() {
    var c = cfgs[sel], is = issues(), blocked = is.filter(function (i) { return i.lvl !== 'warn'; }), warns = is.filter(function (i) { return i.lvl === 'warn'; });
    var cls = blocked.length ? 'blocked' : warns.length ? 'warn' : 'ready';
    var title = blocked.length ? CC.icon('x') + 'Blocked · ' + blocked.length + (blocked.length === 1 ? ' item' : ' items') : warns.length ? CC.icon('hold') + 'Ready, with ' + warns.length + (warns.length === 1 ? ' warning' : ' warnings') : CC.icon('check') + 'Ready to seal';
    var li = is.map(function (i, k) { return '<li><span class="chip ' + (i.lvl === 'block' ? 'bad' : i.lvl === 'req' ? 'bad' : 'warn') + '">' + (i.lvl === 'block' ? 'Blocked' : i.lvl === 'req' ? 'Required' : 'Warning') + '</span><span>' + esc(i.t) + '</span>' + (i.fix ? '<button class="btn sm ghost" data-k="' + k + '">' + esc(i.fix) + '</button>' : '') + '</li>'; }).join('');
    if (c.id === 'sub-thanks' && c.weights === 'equal') li += '<li><span class="chip ok">Safe</span><span>Subscriber ×2 was blocked on this prize draw. Equal odds apply and the free <code class="mono">!join</code> path is open.</span></li>';
    $('#verdict').innerHTML = '<div class="verdict ' + cls + '" role="status"><h4>' + title + '</h4><ul>' + li + '</ul><p class="hint">Product research, not legal advice. Prize rules depend on where you and your viewers live.</p></div>';
    $$('#verdict button[data-k]').forEach(function (b) { b.addEventListener('click', function () { is[+b.getAttribute('data-k')].fn(); renderCfg(); changed(false); CC.flash($('#verdict')); }); });
    var seal = $('#btn-seal'); if (seal && sget().phase === 'open') seal.title = blocked.length ? 'Fix the blocked items first' : '';
  }

  /* ---------- fairness steps ---------- */
  /* step actions by phase: open has none (seal from the hero), then simulate, cast, and finally the writ */
  var STEP_ACTS = {
    sealed: '<button class="btn sm" id="s-sim">Simulate the round arriving</button>',
    arrived: '<button class="btn sm plate" id="s-cast">Cast the lots</button>',
    cast: '<button class="btn sm" id="s-dl">' + CC.icon('download') + 'Download the writ</button><button class="btn sm ghost" id="s-writ">' + CC.icon('scroll') + 'Read the writ</button>'
  };
  function renderSteps() {
    var s = sget(), c = cfgs[sel], h = '';
    function step(n, cls, title, body, extra) { return '<div class="step ' + cls + '"><div class="n">' + (cls === 'done' ? '✓' : n) + '</div><div><b>' + title + '</b><p>' + body + '</p>' + (extra || '') + '</div></div>'; }
    var imp = s.sealed ? s.sealed.seal : null;
    h += step(1, s.phase === 'open' ? 'now' : 'done', 'Seal the roll', s.sealed ? 'Sealed at ' + s.sealed.at + ': ' + s.sealed.entries.length + ' lots. The list can no longer change.' : 'Freeze the entry list. Its hash, the seal, is shown on stream before any lot is cast.', imp ? '<div class="hash"><span style="flex:1">' + imp + '</span><button class="btn sm ghost icon" data-copy="' + imp + '" aria-label="Copy the seal (entry hash)">' + CC.icon('copy') + '</button></div>' : '');
    var rcls = s.phase === 'open' ? '' : s.phase === 'sealed' ? 'now' : 'done';
    h += step(2, rcls, 'Public round announced', s.round ? 'Round ' + CC.fmt.n(s.round) + ' of a public randomness source (sample numbering). ' + (s.phase === 'sealed' ? 'It publishes in <b class="num" id="eta">' + CC.fmt.ms(s.eta) + '</b>; nobody, including you, can steer it.' : 'Published.') : 'A future round of a public randomness source such as drand, announced after the seal.');
    var acls = s.phase === 'arrived' || s.phase === 'cast' ? (s.phase === 'arrived' ? 'now' : 'done') : '';
    h += step(3, acls, 'The round arrives', s.value ? 'Its value is the only randomness. Test mode simulates it.' : 'The winners come from this value, not from the animation.', s.value ? '<div class="hash"><span style="flex:1">' + s.value + '</span></div>' : '');
    h += step(4, s.phase === 'cast' ? 'done' : '', 'Cast the lots', s.result ? n2w(s.result.winners.length) + ' drawn: ' + s.result.winners.map(function (w) { return '<b class="mono">' + esc(w.e.login) + '</b>'; }).join(', ') + '. Anyone can recompute this from the writ.' : 'Rank every lot by hash(value | seal | handle), apply weights, cohort cap and cooldown.');
    var acts = STEP_ACTS[s.phase] || '';
    $('#steps').innerHTML = h + (acts ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' + acts + '</div>' : '') + '<p class="hint" style="margin-top:8px">Test mode: the round value is simulated. On air it comes from the public round after your seal, so the result cannot be steered.</p>';
    $$('#steps [data-copy]').forEach(function (b) { b.addEventListener('click', function () { CC.copy(b.getAttribute('data-copy'), 'Seal copied (entry hash)'); }); });
    var e = $('#s-sim'); if (e) e.addEventListener('click', function () { arrive(); });
    e = $('#s-cast'); if (e) e.addEventListener('click', function () { doCast(false); });
    e = $('#s-dl'); if (e) e.addEventListener('click', downloadWrit);
    e = $('#s-writ'); if (e) e.addEventListener('click', function () { location.hash = 'writ/live'; });
  }
  function n2w(n) { return n === 1 ? 'One winner' : n + ' winners'; }
  function sealRoll() {
    var s = sget(), c = cfgs[sel];
    if (s.phase !== 'open') { s.phase = 'open'; s.sealed = null; s.round = null; s.value = null; s.result = null; s.dry = false; clearInterval(timers.eta); $('#tray').innerHTML = ''; renderAll(); CC.toast('Seal broken: the earlier roll is void'); return; }
    var blocked = issues().filter(function (i) { return i.lvl !== 'warn'; });
    if (blocked.length) { CC.toast('Fix the blocked items first'); CC.flash($('#verdict')); $('#verdict').scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); return; }
    var entries = s.entries.slice(0, s.shown || s.entries.length);
    s.sealed = { entries: entries, seal: sealOf(entries), at: new Date().toTimeString().slice(0, 8) };
    s.phase = 'sealed'; s.round = BASE_ROUND + 20; s.eta = 60; s.result = null; s.value = null;
    clearInterval(timers.eta); timers.eta = setInterval(function () { s.eta--; var e = $('#eta'); if (e) e.textContent = CC.fmt.ms(s.eta); if (s.eta <= 0) arrive(); }, 1000);
    renderAll(); CC.toast('Roll sealed: ' + entries.length + ' lots');
  }
  function arrive() { var s = sget(); if (s.phase !== 'sealed') return; clearInterval(timers.eta); s.phase = 'arrived'; s.value = roundValue(s.round); renderSteps(); renderHero(); renderStageBtn(); }
  function doCast(dry) {
    var s = sget(), c = cfgs[sel], entries, seal, value;
    if (dry) { entries = s.entries.slice(0, s.shown || s.entries.length); seal = sealOf(entries); value = roundValue('proof-' + sel + '-' + entries.length); }
    else { entries = s.sealed.entries; seal = s.sealed.seal; value = s.value; }
    var res = cast(entries, value, seal, c); s.result = res; s.dry = !!dry;
    if (!dry) s.phase = 'cast';
    animateCast(res, c);
    renderSteps(); renderStageBtn();
  }
  function downloadWrit() {
    var s = sget(), c = cfgs[sel]; if (!s.sealed) { CC.toast('Seal the roll first: the writ needs a frozen roll'); return; }
    var b = { note: 'Sample bundle from a prototype. Fictional handles. Not real Twitch data.', draw: c.name, id: c.id, seal: s.sealed.seal, algorithm: 'rank key = -ln(u) / weight, u = first 52 bits of SHA-256(value | seal | handle); cohort cap and cooldown applied in rank order', public_round: s.round, round_value_simulated: s.value, entries: s.sealed.entries.map(function (e) { return e.login; }), winners: s.result ? s.result.winners.map(function (w) { return w.e.login; }) : null };
    var blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'writ-' + c.id + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    CC.toast('Writ downloaded (proof bundle)');
  }

  /* ---------- on-stream preview ---------- */
  var SHAPESVG = {
    urn: '<svg class="shape" viewBox="0 0 200 170" aria-hidden="true"><g class="rot" style="transform-origin:100px 78px"><circle cx="100" cy="78" r="58" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><g stroke="var(--ink)" stroke-width="2" opacity=".55"><path d="M42 78h116M100 20v116M59 37l82 82M141 37l-82 82"/></g><g style="mix-blend-mode:var(--blend)"><rect x="70" y="60" width="26" height="16" rx="2" fill="var(--gules)" transform="rotate(-18 83 68)"/><rect x="100" y="78" width="26" height="16" rx="2" fill="var(--or)" transform="rotate(14 113 86)"/><rect x="82" y="88" width="24" height="15" rx="2" fill="var(--azure)" transform="rotate(-6 94 95)"/></g></g><path d="M66 140l-10 24M134 140l10 24M52 164h96" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="168" cy="78" r="6" fill="var(--or)" stroke="var(--ink)" stroke-width="2.5"/><path d="M158 78h-10" stroke="var(--ink)" stroke-width="3"/></svg>',
    wheel: '<svg class="shape" viewBox="0 0 200 170" aria-hidden="true"><g class="rot" style="transform-origin:100px 88px"><circle cx="100" cy="88" r="70" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><g style="mix-blend-mode:var(--blend)"><path d="M100 88L100 18A70 70 0 0 1 149.5 38.5Z" fill="var(--gules)"/><path d="M100 88L170 88A70 70 0 0 1 149.5 137.5Z" fill="var(--or)"/><path d="M100 88L100 158A70 70 0 0 1 50.5 137.5Z" fill="var(--azure)"/><path d="M100 88L30 88A70 70 0 0 1 50.5 38.5Z" fill="var(--or)"/></g><g stroke="var(--ink)" stroke-width="2.4"><path d="M100 18V158M30 88H170M50.5 38.5L149.5 137.5M149.5 38.5L50.5 137.5"/></g><circle cx="100" cy="88" r="9" fill="var(--ink)"/></g><path d="M100 6l-9 18h18z" fill="var(--ink)"/></svg>',
    deck: '<svg class="shape" viewBox="0 0 200 170" aria-hidden="true"><g class="rot" style="transform-origin:100px 150px"><g transform="rotate(-34 100 150)"><rect x="70" y="40" width="60" height="96" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/></g><g transform="rotate(-17 100 150)"><rect x="70" y="40" width="60" height="96" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/></g><g><rect x="70" y="40" width="60" height="96" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><g style="mix-blend-mode:var(--blend)"><circle cx="100" cy="88" r="20" fill="var(--gules)"/><circle cx="108" cy="92" r="20" fill="var(--or)"/></g></g><g transform="rotate(17 100 150)"><rect x="70" y="40" width="60" height="96" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/></g><g transform="rotate(34 100 150)"><rect x="70" y="40" width="60" height="96" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><path d="M82 60h20M82 70h30" stroke="var(--ink)" stroke-width="3"/></g></g></svg>',
    ballot: '<svg class="shape" viewBox="0 0 200 170" aria-hidden="true"><g class="rot" style="transform-origin:100px 100px"><path d="M40 70l30-22h100l-30 22z" fill="var(--or)" stroke="var(--ink)" stroke-width="3" style="mix-blend-mode:var(--blend)"/><rect x="40" y="70" width="100" height="78" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><path d="M140 70l30-22v78l-30 22z" fill="var(--gules)" stroke="var(--ink)" stroke-width="3" style="mix-blend-mode:var(--blend)"/><path d="M62 82h56" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/><rect x="74" y="40" width="30" height="40" rx="2" fill="var(--paper)" stroke="var(--ink)" stroke-width="2.5" transform="rotate(-8 89 60)"/></g></svg>'
  };
  function renderShape() {
    var c = cfgs[sel]; $('#shape').innerHTML = SHAPESVG[c.shape] || SHAPESVG.urn;
    $('#stage').classList.toggle('prize', c.content === 'prize' && c.disc);
    $('#shapesel').innerHTML = SHAPES.map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (x[0] === c.shape) + '">' + x[1] + '</button>'; }).join('');
    $$('#shapesel button').forEach(function (b) { b.addEventListener('click', function () { c.shape = b.getAttribute('data-v'); renderShape(); renderDrawList(); }); });
    $('#timing').value = c.timing; $('#timing-v').textContent = c.timing + ' s';
    renderStageBtn();
  }
  /* stage button by phase: trial cast while open, wait while sealed, cast when the round arrives, replay after */
  var STAGE_BTN = {
    open: { t: 'Cast a trial first', cls: 'btn plate', dry: true },
    sealed: { t: 'Waiting for the public round', cls: 'btn plate', off: true },
    arrived: { t: 'Cast the lots', cls: 'btn primary' },
    cast: { t: 'Replay the cast', cls: 'btn ghost', replay: true }
  };
  function renderStageBtn() {
    var s = sget(), b = $('#btn-cast'), m = STAGE_BTN[s.phase]; if (!b || !m) return;
    b.textContent = m.t; b.className = m.cls; b.disabled = !!m.off || (!!m.dry && !s.entries.length);
  }
  function animateCast(res, c) {
    var tray = $('#tray'), rot = $('#shape .rot'), T = c.timing * 1000, delay = reduce ? 0 : T * .6;
    tray.innerHTML = '';
    if (rot && !reduce) { rot.classList.remove('spin'); rot.style.setProperty('--spin', (T * .6 / 1000) + 's'); rot.style.setProperty('--turns', (c.shape === 'deck' ? 20 : 900) + 'deg'); void rot.getBoundingClientRect(); rot.classList.add('spin'); }
    clearTimeout(timers.reveal); var k = 0;
    function next() {
      if (k >= res.winners.length) { renderDots(); return; }
      var w = res.winners[k++]; tray.insertAdjacentHTML('beforeend', tkHTML(w.e, true).replace('class="tk win"', 'class="tk win new"'));
      renderDots(); timers.reveal = setTimeout(next, reduce ? 0 : Math.min(700, (T * .4) / res.winners.length));
    }
    timers.reveal = setTimeout(next, delay);
    if (res.winners.length === 0) tray.innerHTML = '<div class="chip bad">No eligible lots</div>';
  }

  /* ---------- past draws + the writ (proof bundle) ---------- */
  function renderPast() {
    var rows = D.past.map(function (p) {
      return '<tr><td class="mono">' + p.id + '</td><td class="mono">' + p.when + '</td><td>' + p.winners.map(function (w) { return '<span class="chip gules mono" style="text-transform:none">' + esc(w) + '</span>'; }).join('') + '</td><td class="mono">' + esc(p.entries_hash) + '</td><td class="n">' + CC.fmt.n(p.beacon_round) + '</td><td>' + (p.revealed ? '<span class="chip ok">' + CC.icon('check') + 'Revealed</span>' : '<span class="chip dash">Withheld</span>') + '</td><td style="text-align:right;white-space:nowrap"><a class="btn sm" href="#writ/' + p.id + '">' + CC.icon('scroll') + 'Writ</a> <button class="btn sm ghost icon" data-dl="' + p.id + '" aria-label="Download the writ for ' + p.id + '" title="Download the writ (proof bundle)">' + CC.icon('download') + '</button></td></tr>';
    });
    $('#pasttbl tbody').innerHTML = rows.join('');
    $$('#pasttbl [data-dl]').forEach(function (b) { b.addEventListener('click', function () { dlPast(b.getAttribute('data-dl')); }); });
  }
  function dlPast(id) {
    var p = D.past.filter(function (x) { return x.id === id; })[0];
    var b = { note: 'Sample record. The sample data carries the seal (truncated), round and winners but not the entries file.', draw: p.id, when: p.when, seal_truncated: p.entries_hash, public_round: p.beacon_round, winners: p.winners, revealed: p.revealed };
    var blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'writ-' + id + '.json'; document.body.appendChild(a); a.click(); a.remove(); CC.toast('Writ ' + id + ' downloaded');
  }
  var wr = { id: null, entries: [], base: [] };
  /* empty state: a rolled writ under a wax seal, 56x56 stroke drawing */
  var SCROLL_SVG = '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="8" width="36" height="7" rx="3.5"/><rect x="10" y="41" width="36" height="7" rx="3.5"/><path d="M14 15v26M42 15v26M19 21h18M19 26h12"/><path d="M33 36.5l-1.6 5.5M39 36.5l1.6 5.5"/><circle cx="36" cy="32" r="5" fill="var(--gules)"/></svg>';
  function renderWrit(arg) {
    var p = D.past.filter(function (x) { return x.id === arg; })[0] || D.past[3]; if (arg === 'live') p = null;
    var title = p ? 'Writ ' + p.id : 'Writ · this session';
    CC.crumbs([{ t: 'Past writs', href: '#' }, { t: title }]);
    wr.id = p ? p.id : 'live';
    $('#wrtk').innerHTML = '<div class="stubcol"><b>' + (p ? p.id : 'live') + '</b></div><div class="ribbon">Sample data</div><div class="kicker">The writ · proof bundle</div><h3 style="font:800 26px/1 var(--font-display);font-stretch:75%;letter-spacing:.03em;text-transform:uppercase;margin:4px 0 0">' + (p ? 'Draw ' + p.id : 'Current draw') + '</h3>' +
      (p ? '<dl><dt>When</dt><dd>' + p.when + '</dd><dt>Winners</dt><dd>' + p.winners.map(esc).join('<br>') + '</dd><dt>Seal</dt><dd>' + esc(p.entries_hash) + '</dd><dt>Public round</dt><dd>' + CC.fmt.n(p.beacon_round) + '</dd><dt>Revealed</dt><dd>' + (p.revealed ? 'yes' : 'no') + '</dd></dl>' :
        '<dl><dt>Draw</dt><dd>' + esc(cfgs[sel].name) + '</dd><dt>Seal</dt><dd>' + esc(sget().sealed ? sget().sealed.seal : 'roll not sealed yet') + '</dd><dt>Public round</dt><dd>' + (sget().round ? CC.fmt.n(sget().round) : '—') + '</dd></dl>');
    $('#wr-files').innerHTML = ['entries.txt|the sealed roll, one handle per line', 'seal.txt|SHA-256 of entries.txt', 'round.json|public round number and value', 'algorithm.md|the exact ranking rule', 'winners.json|the recorded cast'].map(function (x) { var a = x.split('|'); return '<li><span>' + a[0] + '</span><span>' + a[1] + '</span></li>'; }).join('');
    $('#wr-note').innerHTML = p ? 'The sample data records ' + p.id + '\'s winners, seal (truncated) and round, <b>but not its entries file</b>. So this recompute runs on a <b>demonstration roll</b> built from the sample viewers: the steps are real, the winners will not equal ' + p.id + '\'s. With a real bundle, entries and round give back the recorded winners, or the draw is void.' : 'Recompute the current session\'s cast from its sealed roll, or edit the roll to see how any change breaks the seal.';
    var useLive = !p && sget().sealed; wr.live = !!useLive; wr.base = useLive ? sget().sealed.entries.map(function (e) { return e.login; }) : S.viewers.map(function (v) { return v.login; }).sort(); wr.lookup = {}; if (useLive) sget().sealed.entries.forEach(function (e) { wr.lookup[e.login] = e; });
    wr.entries = wr.base.slice();
    $('#wr-entries').value = wr.entries.join('\n');
    $('#wr-round').value = p ? p.beacon_round : (sget().round || BASE_ROUND + 20);
    wrUpdate(); wrIdle();
  }
  function wrIdle() { $('#wr-out').innerHTML = '<div class="empty" style="padding:18px">' + SCROLL_SVG + '<b>The writ lies unread</b><p>Press “Recompute the cast” to rank the roll and check the result yourself.</p></div>'; }
  function wrEntries() { return $('#wr-entries').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function wrUpdate() {
    var list = wrEntries(), imp = CC.sha256(list.join('\n')), val = roundValue($('#wr-round').value);
    $('#wr-seal').textContent = imp; $('#wr-value').textContent = val;
    return { list: list, imp: imp, val: val };
  }
  function wrRun() {
    var u = wrUpdate(), ents = u.list.map(function (l, i) { var e; if (wr.live && wr.lookup[l]) e = Object.assign({}, wr.lookup[l]); else { var v = S.viewers.filter(function (x) { return x.login === l; })[0] || { follower: true, sub_tier: 0, account_age_days: 100, raid_cohort: false }; e = mk(l, v); } e.no = i + 1; return e; });
    var c = wr.live ? cfgs[sel] : { weights: 'equal', cooldown: 0, cap: 'third', winners: 3 };
    var r = cast(ents, u.val, u.imp, c), rows = r.ranked.slice(0, 12).map(function (x, i) { return '<tr class="' + (x.win ? 'rk' : '') + '"><td class="n">' + (i + 1) + '</td><td class="mono ' + (x.win ? 'win' : '') + '">' + esc(x.e.login) + '</td><td class="mono">' + x.h.slice(0, 20) + '…</td><td>' + (x.win ? '<span class="chip solid-or">Drawn</span>' : x.note ? '<span class="chip dash">' + x.note + '</span>' : '') + '</td></tr>'; }).join('');
    var match = !wr.live ? '<span class="chip dash">demonstration roll: no recorded entries to compare</span>' : (sget().result && !sget().dry ? (sget().result.winners.map(function (w) { return w.e.login; }).join() === r.winners.map(function (w) { return w.e.login; }).join() ? '<span class="chip ok">Matches the recorded cast</span>' : '<span class="chip bad">Does not match the recorded cast</span>') : '');
    $('#wr-out').innerHTML = '<div class="sec" style="margin-top:6px"><div class="sec-h"><h2>Ranking · top 12 of ' + ents.length + '</h2><span class="meta">' + match + '</span></div><div class="scroll"><table class="tbl rk"><thead><tr><th class="n">#</th><th>Handle</th><th>Hash (first 20 hex)</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="hint" style="margin-top:8px">' + (wr.live ? 'This is the draw\'s own setup: its weights, cooldown and cohort cap.' : 'Equal weights, raiders capped at a third of 3 winners.') + ' Change one letter in the roll and the seal, the ranking and the winners all change.</p></div>';
  }

  /* ---------- the Steward (co-pilot): drafts a writ for the setup, nothing changes until it is sealed ---------- */
  function propose(text) {
    var s = text.toLowerCase(), cur = cfgs[sel], nx = JSON.parse(JSON.stringify(cur)), lines = [];
    var num = s.match(/\b(\d{1,2})\b/); if (num) nx.winners = Math.max(1, Math.min(50, +num[1]));
    if (/jury|juror/.test(s)) { nx.content = 'jury'; if (!num) nx.winners = 'tier'; }
    else if (/question/.test(s)) nx.content = 'question'; else if (/\bidea/.test(s)) nx.content = 'idea'; else if (/prize|print|giveaway|signed|gift card/.test(s)) nx.content = 'prize';
    if (/subscriber|\bsubs?\b/.test(s)) { if (/question|idea|jury/.test(s)) { nx.pool = nx.pool === 'chatters10' ? 'keyword' : nx.pool; nx.only = 'subs'; if (nx.content === 'question') { nx.pool = 'keyword'; nx.keyword = '!ask'; } } else nx.pool = 'subs'; }
    else if (/follower/.test(s)) nx.pool = 'followers'; else if (/redeem|point/.test(s)) nx.pool = 'points'; else if (/everyone|chatters?|active/.test(s)) nx.pool = 'chatters10';
    if (/wheel/.test(s)) nx.shape = 'wheel'; else if (/deck|card/.test(s)) nx.shape = 'deck'; else if (/ballot|box/.test(s)) nx.shape = 'ballot'; else if (/urn|drum/.test(s)) nx.shape = 'urn';
    if (/raider/.test(s) && /(third|1\/3)/.test(s)) nx.cap = 'third';
    var rep = s.match(/no repeat.*?(\d)/); if (rep) nx.cooldown = +rep[1];
    if (JSON.stringify(nx) === JSON.stringify(cur)) return null;
    function line(label, a, b) { if (String(a) === String(b)) return; lines.push({ op: 'del', s: label + ': ' + a }); lines.push({ op: 'ins', s: label + ': ' + b }); }
    var pn = function (c) { return poolText(c); };
    line('Content', labelOf(cur.content), labelOf(nx.content)); line('Pool', pn(cur), pn(nx)); line('Winners', cur.winners === 'tier' ? 'by room tier' : cur.winners, nx.winners === 'tier' ? 'by room tier (' + winN(nx) + ')' : nx.winners); line('Shape', cur.shape, nx.shape); line('Cohort cap', cur.cap, nx.cap); line('Cooldown', cur.cooldown, nx.cooldown);
    lines.push({ op: '', s: 'Weights: ' + (nx.weights === 'equal' ? 'equal (kept)' : nx.weights) });
    var warn = nx.only === 'subs' && nx.content !== 'prize' ? 'A word of caution: subscriber-only entry will show as a warning (a paid wall on a free draw). Nothing is blocked.' : 'Sealing this writ changes the setup only. Nothing reaches chat until you seal the roll.';
    return { title: 'Draft writ · setup for “' + nx.name + '”', lines: lines, note: warn, toast: 'Writ sealed: the setup is changed', apply: function () { cfgs[sel] = nx; renderCfg(); changed(true); CC.flash($('#cfg')); CC.flash($('#verdict')); } };
  }
  function labelOf(x) { return { question: 'a question', idea: 'an idea', prize: 'a prize', jury: 'a jury seat' }[x] || x; }

  /* ---------- wiring ---------- */
  function renderAll() { renderDrawList(); renderHero(); renderRollTable(); renderCfg(); renderVerdict(); renderSteps(); renderShape(); renderPast(); }
  function init() {
    D = S.lottery;
    D.draws.forEach(function (d) { cfgs[d.id] = origCfg(d); });
    initDraw(sel); fill(); renderAll();
    $('#head-actions').innerHTML = '<a class="btn ghost" href="moderator.html" title="One verdict before everything: a message the Gatehouse (AI moderator) barred, that is removed, never counts toward a draw">' + CC.icon('watch') + 'Barred lines never count</a>';
    $('#btn-seal').addEventListener('click', sealRoll);
    $('#btn-intake').addEventListener('click', function () { var s = sget(); s.intake = !s.intake; renderHero(true); });
    $('#roll-find').addEventListener('input', function (e) { sget().filter = e.target.value; renderRollTable(); });
    $('#btn-cast').addEventListener('click', function () { var s = sget(), m = STAGE_BTN[s.phase]; if (!m || m.off) return; if (m.replay) animateCast(s.result, cfgs[sel]); else doCast(!!m.dry); });
    $('#btn-writ').addEventListener('click', downloadWrit);
    $('#btn-new').addEventListener('click', function () { var id = 'draft-' + (Object.keys(cfgs).length - 2); var base = D.draws[0]; var d = { id: id, name: 'New draw', pool: 'chatters who typed !ask', winners: 3, weights: 'equal', visual: 'urn', entries: 87 }; D.draws.push(d); cfgs[id] = origCfg(d); cfgs[id].name = 'New draw'; universe[id] = universe['urn-questions'] || (universe[id] = buildUniverse(base)); selectDraw(id); CC.toast('Draft created: set it up, then seal the roll'); });
    $('#timing').addEventListener('input', function (e) { cfgs[sel].timing = +e.target.value; $('#timing-v').textContent = e.target.value + ' s'; });
    $('#wr-back').addEventListener('click', function (e) { e.preventDefault(); CC.go(''); });
    $('#wr-entries').addEventListener('input', wrUpdate); $('#wr-round').addEventListener('input', wrUpdate);
    $('#wr-run').addEventListener('click', wrRun);
    $('#wr-tamper').addEventListener('click', function () { var l = wrEntries(); l.splice(Math.floor(l.length / 2), 1); $('#wr-entries').value = l.join('\n'); wrUpdate(); wrRun(); CC.toast('One lot dropped: the seal no longer matches'); });
    $('#wr-reset').addEventListener('click', function () { $('#wr-entries').value = wr.base.join('\n'); wrUpdate(); wrIdle(); });
    CC.steward.setup({ intro: 'Tell me what this draw should be and I will draft a writ for its setup. Nothing changes until you seal it.', examples: ['cast lots for subscribers\' questions, 3 winners', 'cast 1 lot among followers for the thank-you print, on the wheel', 'seat a jury of 7 from active chatters, raiders at most a third'], propose: propose });
    CC.router({ main: $('#v-main'), writ: $('#v-writ') }, function (name, arg) { if (name === 'writ') renderWrit(arg); else CC.crumbs([]); });
    setInterval(function () { if (!document.hidden && Math.random() < .32) trickle(); }, 2400);
    CC.on(function () { renderHero(true); });
  }
})();
