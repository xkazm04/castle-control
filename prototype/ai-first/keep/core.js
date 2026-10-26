/* Castle Control prototype core: the four chambers' rules over the sample data, and the
   SIMULATED Steward. No network, no model: replies come from the rules below.
   Every figure is derived from ../data/sample.js (illustrative, fictional channel). */
(function (W) {
  'use strict';
  var S = W.SAMPLE;
  var C = (W.CORE = { S: S });

  /* ---------- SHA-256 (real; used to seal the roll and to recompute the writ) ---------- */
  function sha256(ascii) {
    ascii = unescape(encodeURIComponent(ascii));
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, mw = mp(2, 32), i, j, res = '', words = [], bl = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {};
    for (var cand = 2; pc < 64; cand++) {
      if (!comp[cand]) { for (i = 0; i < 313; i += cand) comp[i] = cand; hash[pc] = (mp(cand, .5) * mw) | 0; k[pc++] = (mp(cand, 1 / 3) * mw) | 0; }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((bl / mw) | 0); words[words.length] = bl;
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
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; res += ((b < 16) ? 0 : '') + b.toString(16); }
    return res;
  }
  C.sha256 = sha256;
  C.h32 = function (s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- viewers ---------- */
  var VI = {}; S.viewers.forEach(function (v) { VI[v.login] = v; });
  C.viewer = function (l) { return VI[l] || { login: l, follower: false, sub_tier: 0, account_age_days: 0, raid_cohort: false }; };
  C.viewerLine = function (l) {
    if (/^free-join-/.test(l)) return 'entered by the free !join path (outside the 140 sampled viewers)';
    var v = C.viewer(l), bits = [];
    bits.push(v.account_age_days < 7 ? 'account ' + v.account_age_days + ' days old' : 'account ' + (v.account_age_days >= 365 ? Math.round(v.account_age_days / 365 * 10) / 10 + ' yr' : v.account_age_days + ' days'));
    bits.push(v.follower ? 'follower' : 'not a follower');
    if (v.sub_tier) bits.push('tier ' + v.sub_tier + ' sub');
    if (v.raid_cohort) bits.push('came in with the raid');
    return bits.join(' · ');
  };

  /* ---------- the channel clock (simulated) ---------- */
  C.channel = S.channel;
  C.uptimeStart = Date.now() - (47 * 60 + 41) * 1000;
  C.uptime = function () { var s = Math.floor((Date.now() - C.uptimeStart) / 1000); function p(n) { return (n < 10 ? '0' : '') + n; } return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60); };

  /* ---------- Gatehouse ---------- */
  var M = S.moderator;
  C.mod = M;
  C.rules = M.rules.map(function (r) { return { id: r.id, match: r.match, action: r.action, mode: r.mode }; });
  C.verdicts = S.chat.reduce(function (a, c) { a[c.verdict] = (a[c.verdict] || 0) + 1; return a; }, {});
  C.heldAll = S.chat.filter(function (c) { return c.verdict === 'held'; });
  C.holdReason = function (c) {
    var v = C.viewer(c.login);
    if (v.raid_cohort) return 'raid cohort: first lines are held while the raid settles';
    if (v.account_age_days < 7) return 'account ' + v.account_age_days + ' days old (new-account watch)';
    if (/(\b\w+\b)( \1){1,}/.test(c.text)) return 'repeated emote (unique-chat order, room tier ' + S.channel.room_tier + ')';
    if (!v.follower) return 'not a follower, slow-mode overflow';
    return 'slow mode 5 s overflow (room tier ' + S.channel.room_tier + ')';
  };
  C.holdAdvice = function (c) {
    var v = C.viewer(c.login);
    if (/link/.test(c.text)) return { verdict: 'bar', why: 'a link from a new account; matches the new-account rule' };
    if (c.direction === 'question') return { verdict: 'pass', why: 'a fair question; worth answering on stream' };
    if (v.raid_cohort) return { verdict: 'pass', why: 'a harmless map call from a raider' };
    return { verdict: 'pass', why: 'harmless; the hold was caution, not a breach' };
  };
  C.queue = C.heldAll.slice(-3).map(function (c, i) { return { id: 'h' + i, line: c, reason: C.holdReason(c), advice: C.holdAdvice(c), state: 'held' }; });
  C.banPending = M.decisions.filter(function (d) { return d.kind === 'ban-pending'; })[0];
  C.consensus = S.consensus;
  C.dirs = [['go-left', 'Left door', 'var(--gules)'], ['skip-boss', 'Skip the boss', 'var(--azure)'], ['hype', 'Hype', 'var(--or)'], ['go-right', 'Right door', 'var(--key)']];
  C.lead = function () { var m = S.consensus[S.consensus.length - 1], best = null; C.dirs.forEach(function (d) { if (!best || m[d[0]] > m[best[0]]) best = d; }); return { key: best[0], label: best[1], pct: m[best[0]], minute: m.minute, ink: best[2] }; };
  C.tier = function (t) { return M.tiers.filter(function (x) { return x.tier === t; })[0]; };

  /* ---------- Lot Chamber ---------- */
  var L = S.lottery;
  C.past = L.past;
  C.nextRound = L.past[L.past.length - 1].beacon_round + 28800;
  var cooldownOut = {}; L.past.slice(-3).forEach(function (p) { p.winners.forEach(function (w) { cooldownOut[w] = p.id; }); });
  C.cooldownOut = cooldownOut;
  C.draws = L.draws;
  function poolFor(d) {
    var by = S.viewers.slice().sort(function (a, b) { return C.h32(d.id + a.login) - C.h32(d.id + b.login); });
    if (d.id === 'urn-questions') {
      var ask = {}; S.chat.forEach(function (c) { if (c.direction === 'question') ask[c.login] = 1; });
      var list = Object.keys(ask).sort();
      by.forEach(function (v) { if (list.length < d.entries && !ask[v.login]) list.push(v.login); });
      return list.slice(0, d.entries);
    }
    if (d.id === 'sub-thanks') {
      var l2 = S.viewers.map(function (v) { return v.login; });
      for (var i = l2.length; i < d.entries; i++) l2.push('free-join-' + ('00' + (i - 139)).slice(-3));
      return l2;
    }
    return S.viewers.map(function (v) { return v.login; }).slice(0, d.entries);
  }
  C.drawById = function (id) { return L.draws.filter(function (x) { return x.id === id; })[0] || L.draws[0]; };
  C.newWrit = function (id) {
    var d = C.drawById(id);
    var winners = typeof d.winners === 'number' ? d.winners : ({ S: 3, M: 7, L: 7, XL: 15 })[S.channel.room_tier] || 7;
    var w = {
      id: d.id, name: d.name, pool: d.pool, winners: winners, weights: d.weights,
      cap: d.cohort_cap || 'none', cooldown: d.cooldown || 'none', prize: d.prize,
      visual: d.visual, warning: d.warning || null, rulesTpl: d.rules_template || null,
      entrants: poolFor(d), status: 'draft', rev: 1
    };
    if (w.prize) w.disclaimer = 'No purchase necessary. The free !join path has equal odds. Not affiliated with or endorsed by Twitch.';
    return w;
  };
  C.eligible = function (w) { return w.entrants.filter(function (l) { return !(w.cooldown !== 'none' && cooldownOut[l]) && !(w.cap === 'raiders excluded' && C.viewer(l).raid_cohort); }); };
  C.excluded = function (w) { return w.cooldown === 'none' ? [] : w.entrants.filter(function (l) { return cooldownOut[l]; }); };
  C.raiders = function (w) { return w.entrants.filter(function (l) { return C.viewer(l).raid_cohort; }).length; };
  C.writText = function (w) { return JSON.stringify({ draw: w.id, winners: w.winners, weights: w.weights, cap: w.cap, cooldown: w.cooldown, prize: w.prize, entrants: C.eligible(w).slice().sort() }); };
  C.seal = function (w) { w.entriesHash = sha256(C.writText(w)); w.round = C.nextRound; w.status = 'sealed'; return w; };
  C.roundRandomness = function (round) { return sha256('simulated-public-round:' + round); };
  C.cast = function (w) {
    var el = C.eligible(w).slice().sort(), rnd = C.roundRandomness(w.round), out = [], raid = 0,
      cap = /1\/3/.test(w.cap) ? Math.max(1, Math.floor(w.winners / 3)) : /excluded/.test(w.cap) ? 0 : 1e9, k = 0;
    while (out.length < Math.min(w.winners, el.length) && k < 5000) {
      var hx = sha256(rnd + ':' + w.entriesHash + ':' + k++), idx = parseInt(hx.slice(0, 8), 16) % el.length, who = el[idx];
      if (out.indexOf(who) >= 0) continue;
      if (C.viewer(who).raid_cohort) { if (raid >= cap) continue; raid++; }
      out.push(who);
    }
    w.result = out; w.randomness = rnd; w.status = 'cast';
    return out;
  };
  C.recompute = function (w) { var copy = JSON.parse(JSON.stringify(w)); var h = sha256(C.writText(copy)); copy.entriesHash = h; var r = C.cast(copy); return { hashOk: h === w.entriesHash, same: r.join() === (w.result || []).join(), result: r, hash: h }; };

  /* ---------- Beacons ---------- */
  C.visuals = S.visuals;
  C.contrib = S.contributions;
  C.nowT = 2880; /* seconds into the stream for the sample contributions */
  C.GIFT_BITS = 100; /* illustrative weighting: one gifted sub feeds the altar like 100 bits */
  C.altarFuel = function (extra) {
    var f = 0; S.contributions.forEach(function (c) {
      var amt = c.kind === 'bits' ? c.amount : c.kind === 'gift' ? c.amount * C.GIFT_BITS : 0;
      f += amt * Math.pow(0.5, (C.nowT - c.t) / 300);
    });
    return Math.round(f + (extra || 0));
  };
  C.frameCount = function (extra) { return S.contributions.reduce(function (a, c) { return a + (c.kind === 'sub' || c.kind === 'gift' ? c.amount : 0); }, 0) + (extra || 0); };
  C.hypeLevel = function (extra) { var h = S.contributions.filter(function (c) { return c.kind === 'hype_train'; }); return (h.length ? h[h.length - 1].amount : 0) + (extra || 0); };
  C.look = function (vis, value) {
    var r = vis.ranges, hit = r[0];
    r.forEach(function (x) { if (x.level != null ? value >= x.level : value >= x.from) hit = x; });
    return hit;
  };
  C.blaze = function (vis, value) { /* 0..1 within the visual's whole range */
    var r = vis.ranges; if (r[0].level != null) return Math.min(1, value / 5);
    var top = r[r.length - 1].to; return Math.max(0, Math.min(1, Math.log(1 + value) / Math.log(1 + top)));
  };
  C.valueFor = function (id, extra) { return id === 'altar' ? C.altarFuel(extra && extra.fuel) : id === 'cam-frame' ? C.frameCount(extra && extra.count) : C.hypeLevel(extra && extra.level); };
  C.totals = S.contributions.reduce(function (a, c) { a[c.kind] = (a[c.kind] || 0) + c.amount; return a; }, {});
  C.lastGift = S.contributions.filter(function (c) { return c.kind === 'gift'; }).slice(-1)[0];

  /* ---------- Map Room ---------- */
  var H = S.studio.hexmap;
  C.hex = H;
  C.HOUSES = [{ name: H.sides[0], ink: 'var(--gules)', short: 'Quill' }, { name: H.sides[1], ink: 'var(--or)', short: 'Tallow' }, { name: H.sides[2], ink: 'var(--azure)', short: 'Sable' }];
  C.tiles = (function () {
    var t = [], seeds = [[1, 1, 0], [7, 1, 1], [4, 5, 2]];
    for (var r = 0; r < H.rows; r++) for (var c = 0; c < H.cols; c++) {
      var best = -1, bd = 1e9, second = 1e9;
      seeds.forEach(function (s, i) { var d = Math.hypot(c - s[0], (r - s[1]) * 1.15); if (d < bd) { second = bd; bd = d; best = i; } else if (d < second) second = d; });
      var owner = (second - bd) < 0.9 ? null : best;
      t.push({ id: String.fromCharCode(65 + c) + (r + 1), c: c, r: r, owner: owner, votes: [0, 0, 0] });
    }
    S.chat.slice(-140).forEach(function (m) { var i = C.h32(m.login + 'tile') % t.length; t[i].votes[C.h32(m.login) % 3]++; });
    return t;
  })();
  C.tile = function (id) { return C.tiles.filter(function (t) { return t.id === id; })[0]; };
  C.mapProposal = function () {
    var cand = C.tiles.filter(function (x) { return x.owner === null; }).map(function (x) { var tot = x.votes[0] + x.votes[1] + x.votes[2], top = x.votes.indexOf(Math.max.apply(null, x.votes)); return { tile: x, house: top, votes: x.votes[top], total: tot }; });
    cand.sort(function (a, b) { return b.votes - a.votes || b.total - a.total; });
    return cand[0] || null;
  };
  C.allowlist = S.viewers.filter(function (v) { return v.sub_tier > 0 && v.account_age_days >= 120; }).slice(0, 12).map(function (v) { return v.login; });

  /* ---------- the simulated Steward: rule-based intent parsing ---------- */
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function num(s) { if (s == null) return null; s = String(s).toLowerCase(); return NUM[s] != null ? NUM[s] : parseInt(s, 10); }
  C.chamberOf = function (t) {
    if (/\b(draws?|lott\w*|raffle|giveaway|urn|jury|lots?|writ|winners?|prize|wheel|ledger)\b/.test(t)) return 'lot';
    if (/\b(gate\w*|mod\w*|hold|held|ban|timeout|portcullis|shield|drawbridge|raid|moat|rules?|caps|spam|drill|chat)\b/.test(t)) return 'gate';
    if (/\b(beacons?|altar|fire|frame|border|gifts?|bits|blaze|visuals?|hype)\b/.test(t)) return 'beacon';
    if (/\b(map|hex|tiles?|house|extension|turn|muster|sand|quill|tallow|sable|war)\b/.test(t)) return 'map';
    return null;
  };
  C.parse = function (raw) {
    var t = String(raw || '').toLowerCase().trim(), m, out = { raw: raw, chamber: C.chamberOf(t), intent: 'unknown', args: {} };
    if (!t) return out;
    if (/^(help|\?|what can you do)/.test(t)) { out.intent = 'help'; return out; }
    if (/^(home|back|keep|overview|leave|close|esc)\b/.test(t)) { out.intent = 'home'; return out; }
    if (/^(yes|yep|ok|okay|do it|seal( it)?|approve( it)?|confirm|proclaim( it)?)\W*$/.test(t)) { out.intent = 'confirm'; return out; }
    if (/^(no|nope|tear( it)?( up)?|cancel|scrap( it)?|discard|reject|deny)\W*$/.test(t)) { out.intent = 'reject'; return out; }
    if (/\b(undo|recall|take (it|that) back)\b/.test(t)) { out.intent = 'undo'; return out; }
    if (/\b(status|brief|how('s| is) (it|the stream|everything) going|what('s| is) happening|catch me up|summary)\b/.test(t)) { out.intent = 'brief'; return out; }
    /* lot */
    if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+winners?\b/)) || (m = t.match(/\bwinners?\s+(?:to\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/))) { out.chamber = 'lot'; out.intent = 'lot.winners'; out.args.n = num(m[1]); }
    if (/\b(draft|make|start|new|set up|setup|run|open|prepare|create)\b.*\b(draw|lottery|raffle|giveaway|jury|urn)\b|\b(question|thank-you|thank you|jury|monthly)\b.*\bdraw\b|^draw\b/.test(t)) {
      out.chamber = 'lot'; out.intent = 'lot.draft';
      out.args.id = /thank|monthly|print|prize|sub/.test(t) ? 'sub-thanks' : /jury/.test(t) ? 'jury' : 'urn-questions';
    }
    if (/\b(sub(scriber)?s?)\b.*\b(double|x2|twice|extra|weight|more)\b|\b(double|weight)\b.*\bsub/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.paidweight'; }
    if (/\braid(ers?)?\b/.test(t) && /\b(no|none|exclude|out|zero|without|keep)\b/.test(t) && /\b(draw|winners?|lots?|cap)\b|^no raid|^exclude raid|^without raid/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.cap'; out.args.cap = 'raiders excluded'; }
    if (/\b(no cap|remove (the )?cap|lift (the )?cap)\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.cap'; out.args.cap = 'none'; }
    if (/\b(allow repeats?|no cooldown|drop (the )?cooldown|let (past )?winners)\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.cooldown'; out.args.cooldown = 'none'; }
    if (/\b(keep|add|restore) (the )?cooldown\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.cooldown'; out.args.cooldown = 'no repeat for 3 draws'; }
    if ((m = t.match(/\bprize\s*(?:is|of|:|=)?\s*(.+)$/)) && !/\bno prize\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.prize'; out.args.prize = m[1].replace(/[.!]+$/, ''); }
    if (/\bno prize\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.prize'; out.args.prize = null; }
    if (/\b(cast( it| the lots)?|roll|pick (the )?winners?|draw (it )?now|reveal)\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.cast'; }
    if (/\b(recompute|verify|check (the )?(proof|writ)|rigged)\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.verify'; }
    if (/\b(past|history|last) (draws?|writs?)\b/.test(t)) { out.chamber = 'lot'; out.intent = 'lot.past'; }
    if (out.chamber === 'lot' && out.intent !== 'unknown') return out;
    /* gate */
    if (/\b(pass|release|let .* through)\b/.test(t)) { out.chamber = 'gate'; out.intent = 'gate.pass'; out.args.all = /\b(all|every|them|everything|rest)\b/.test(t); out.args.who = (t.match(/\b([a-z]+\d+)\b/) || [])[1]; }
    if (/\b(bar|remove|delete|block)\b/.test(t)) { out.chamber = 'gate'; out.intent = 'gate.bar'; out.args.who = (t.match(/\b([a-z]+\d+)\b/) || [])[1]; out.args.all = /\ball\b/.test(t); }
    if (/\b(shield|drawbridge|lock ?down|raise the bridge)\b/.test(t)) { out.chamber = 'gate'; out.intent = /\b(lower|drop|off|down)\b/.test(t) && !/lock ?down/.test(t) ? 'gate.shieldoff' : 'gate.shield'; }
    if ((m = t.match(/\b(arm|watch|shadow)\b\s+(?:the\s+)?(caps|spam|links?|new[- ]?acc\w*|harass\w*|llm[- ]harass|slurs?)/))) { out.chamber = 'gate'; out.intent = 'gate.mode'; out.args.mode = m[1] === 'arm' ? 'armed' : 'shadow'; out.args.rule = /cap/.test(m[2]) ? 'caps' : /spam/.test(m[2]) ? 'spam' : /link/.test(m[2]) ? 'links' : /new/.test(m[2]) ? 'new-acct' : /harass/.test(m[2]) ? 'llm-harass' : 'slurs'; }
    if (/\bban\b/.test(t)) { out.chamber = 'gate'; out.intent = 'gate.ban'; }
    if ((m = t.match(/\b(?:moat|delay)\b\D*(\d)/))) { out.chamber = 'gate'; out.intent = 'gate.moat'; out.args.s = num(m[1]); }
    if (/\b(drill|replay)\b/.test(t)) { out.chamber = 'gate'; out.intent = 'gate.drill'; }
    if (/\b(what('s| is| does)? chat|chat (want|say)s?|consensus|which door|left or right)\b/.test(t)) { out.chamber = 'gate'; out.intent = 'gate.consensus'; }
    if (out.chamber === 'gate' && out.intent !== 'unknown') return out;
    /* beacons */
    if (/\b(test( fire)?|preview|try|simulate)\b/.test(t) && (out.chamber === 'beacon' || out.chamber === null || /\b(gift|bits|bomb|altar|frame|border)\b/.test(t))) {
      out.chamber = 'beacon'; out.intent = 'beacon.test';
      var mm = t.match(/(\d+)\s*(gifts?|subs?|bits?)?/); out.args.n = mm ? num(mm[1]) : 50; out.args.kind = mm && /bit/.test(mm[2] || '') ? 'bits' : 'gift';
      out.args.vis = /frame|camera/.test(t) ? 'cam-frame' : /border|hype/.test(t) ? 'hype-border' : 'altar';
      return out;
    }
    if (/\b(dim|douse|lower|tone down|quieter|calm)\b/.test(t) && out.chamber === 'beacon') { out.intent = 'beacon.dim'; return out; }
    if (/\b(how|what|who)\b.*\b(lit|blaze|burning|altar|beacons?|gave|gifted)\b/.test(t)) { out.chamber = 'beacon'; out.intent = 'beacon.status'; return out; }
    /* map */
    if ((m = t.match(/\b(?:tile\s+)?([a-i][1-6])\b/)) && (out.chamber === 'map' || /\btile\b/.test(t) || /^[a-i][1-6]$/.test(t))) { out.chamber = 'map'; out.intent = 'map.tile'; out.args.tile = m[1].toUpperCase(); return out; }
    if (/\b(propose|next turn|what should|suggest|move|turn)\b/.test(t) && (out.chamber === 'map' || /\b(turn|tile|house)\b/.test(t))) { out.chamber = 'map'; out.intent = 'map.propose'; return out; }
    if (/\b(muster|hosted test|allowlist)\b/.test(t)) { out.chamber = 'map'; out.intent = 'map.muster'; return out; }
    if (out.intent === 'unknown' && out.chamber) out.intent = 'open';
    return out;
  };

  /* plain-language briefs, in the Steward's voice: courteous, brief, plain */
  C.brief = function () {
    var l = C.lead(), held = C.queue.filter(function (q) { return q.state === 'held'; }).length, alt = C.look(C.visuals[0], C.altarFuel()), p = C.mapProposal();
    return [
      { ch: 'gate', text: held + ' held at the portcullis (held for review). Chat pulls ' + l.label.toLowerCase() + ', ' + l.pct + '%.' },
      { ch: 'lot', text: 'No draw is open. The last writ, ' + C.past[C.past.length - 1].id + ', was recomputed and stands.' },
      { ch: 'beacon', text: C.lastGift.login + ' gifted ' + C.lastGift.amount + '. The altar burns as a ' + alt.look + '.' },
      { ch: 'map', text: p ? 'Malakor proposes ' + C.HOUSES[p.house].short + ' for ' + p.tile.id + ' (' + p.votes + ' calls).' : 'Every tile is held.' }
    ];
  };
})(window);
