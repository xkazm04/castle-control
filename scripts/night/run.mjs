#!/usr/bin/env node
// Night runner: runs the end-to-end lanes once (one iteration), reruns failures to
// separate flaky from broken, appends results to <out>/runs.jsonl and regenerates
// <out>/MORNING.md. Call it repeatedly through the night; it never pushes, commits
// or touches live Twitch. Usage:
//   node scripts/night/run.mjs --out <dir> [--lanes gate,e2e,core,obs,tauri] [--tauri-root <dir>]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const OUT = path.resolve(args.out ?? path.join('C:/t/night', new Date().toISOString().slice(0, 10)));
const TAURI_ROOT = path.resolve(args['tauri-root'] ?? ROOT);
const wanted = (args.lanes ?? 'gate,e2e,site,core,obs,tauri-build,tauri').split(',');
const LANE_TIMEOUT_MS = Number(args['lane-timeout-min'] ?? 45) * 60_000;
const RERUNS = 2;
fs.mkdirSync(OUT, { recursive: true });

// Forbidden flags never reach a child, whatever the parent shell has set.
const env = { ...process.env, CI: '1', CC_E2E_PORT: process.env.CC_E2E_PORT ?? '5274' };
for (const k of ['CC_LIVE_TWITCH', 'CC_LIVE_OBS', 'CC_LIVE_FLOOR']) delete env[k];

const pw = (config, cwd = ROOT) => ({
  cwd, playwright: true,
  cmd: ['pnpm', '--config.verify-deps-before-run=false', 'exec', 'playwright', 'test', '-c', config],
});
const LANES = {
  gate: { cwd: ROOT, cmd: ['pnpm', '--config.verify-deps-before-run=false', 'gate'] },
  e2e: pw('e2e/playwright.config.ts'),
  site: pw('e2e/site.config.ts'),
  core: { ...pw('e2e/night.config.ts'), needs: 'e2e/night.config.ts' },
  obs: { cwd: ROOT, cmd: ['node', 'scripts/night/obs.mjs'], needs: 'scripts/night/obs.mjs' },
  'tauri-build': { cwd: TAURI_ROOT, cmd: ['node', 'e2e/tauri/build.ts'], needs: 'e2e/tauri/build.ts' },
  tauri: { ...pw('e2e/tauri.config.ts', TAURI_ROOT), needs: 'e2e/tauri.config.ts' },
};

const iter = (() => {
  const f = path.join(OUT, 'runs.jsonl');
  if (!fs.existsSync(f)) return 1;
  const its = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).iter);
  return Math.max(0, ...its) + 1;
})();

function killTree(pid) { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); }

function run(lane, extra, logFile, laneEnv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const out = fs.openSync(logFile, 'a');
    const p = spawn(lane.cmd[0], [...lane.cmd.slice(1), ...extra], { cwd: lane.cwd, env: laneEnv, shell: true, stdio: ['ignore', out, out], windowsHide: true });
    const timer = setTimeout(() => { fs.appendFileSync(logFile, `\n[night] TIMEOUT after ${LANE_TIMEOUT_MS / 60000} min, killing tree\n`); killTree(p.pid); }, LANE_TIMEOUT_MS);
    p.on('close', (code) => { clearTimeout(timer); fs.closeSync(out); resolve({ code: code ?? -1, ms: Date.now() - t0 }); });
  });
}

function failedTests(jsonFile) {
  try {
    const r = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const bad = [];
    const walk = (s, trail) => {
      for (const sp of s.specs ?? []) for (const t of sp.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        if (last && !['passed', 'skipped'].includes(last.status)) bad.push(`${t.projectName} > ${[...trail, sp.title].join(' > ')}`);
      }
      for (const c of s.suites ?? []) walk(c, [...trail, c.title]);
    };
    for (const s of r.suites ?? []) walk(s, [s.title]);
    return { bad, stats: r.stats ?? null };
  } catch { return { bad: null, stats: null }; }
}

// Early records carry a mis-encoded separator; show them like new ones.
const MISENCODED = String.fromCharCode(0xe2, 0x20ac, 0x15f);
const clean = (t) => t.split(MISENCODED).join('>');

const results = [];
for (const name of wanted) {
  const lane = LANES[name];
  if (!lane) continue;
  const rec = { iter, lane: name, started: new Date().toISOString() };
  if (lane.needs && !fs.existsSync(path.join(lane.cwd, lane.needs))) {
    Object.assign(rec, { outcome: 'skipped', reason: `${lane.needs} not present yet` });
  } else {
    const dir = path.join(OUT, `iter-${String(iter).padStart(3, '0')}`, name);
    fs.mkdirSync(dir, { recursive: true });
    const jsonFile = path.join(dir, 'report.json');
    const laneEnv = { ...env, NIGHT_OUT: dir, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile, PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(dir, 'html'), PLAYWRIGHT_HTML_REPORT: path.join(dir, 'html'), PLAYWRIGHT_HTML_OPEN: 'never' };
    const reporter = lane.playwright ? ['--reporter=list,json,html'] : [];
    const first = await run(lane, reporter, path.join(dir, 'run.log'), laneEnv);
    const firstFail = lane.playwright ? failedTests(jsonFile) : { bad: null, stats: null };
    rec.exit = first.code; rec.ms = first.ms; rec.stats = firstFail.stats;
    const skippedByLane = !lane.playwright && first.code === 0 && /^skipped:/m.test(fs.readFileSync(path.join(dir, 'run.log'), 'utf8'));
    if (first.code === 0) rec.outcome = skippedByLane ? 'skipped' : 'pass';
    else {
      rec.failedFirst = firstFail.bad;
      // Preserve the first failure before a rerun clears Playwright's output.
      const nightResults = path.join(dir, 'test-results');
      const traces = fs.existsSync(nightResults) ? nightResults : path.join(lane.cwd, 'e2e', 'test-results');
      if (fs.existsSync(traces)) fs.cpSync(traces, path.join(dir, 'first-failure'), { recursive: true });
      let still = first.code, attempt = 0, lastBad = firstFail.bad;
      while (still !== 0 && attempt < RERUNS) {
        attempt++;
        const again = lane.playwright ? ['--last-failed', ...reporter] : [];
        const r = await run(lane, again, path.join(dir, `rerun-${attempt}.log`), laneEnv);
        still = r.code;
        if (lane.playwright) lastBad = failedTests(jsonFile).bad;
      }
      rec.reruns = attempt;
      rec.outcome = still === 0 ? 'flaky' : 'broken';
      rec.failedFinal = still === 0 ? [] : lastBad;
    }
    if (rec.outcome === 'pass' && fs.existsSync(path.join(dir, 'html'))) fs.rmSync(path.join(dir, 'html'), { recursive: true, force: true });
  }
  rec.finished = new Date().toISOString();
  results.push(rec);
  fs.appendFileSync(path.join(OUT, 'runs.jsonl'), JSON.stringify(rec) + '\n');
  writeMorning();
  console.log(`[night] iter ${iter} ${name}: ${rec.outcome}${rec.ms ? ` in ${Math.round(rec.ms / 1000)} s` : ''}${rec.reason ? ` (${rec.reason})` : ''}`);
}

function writeMorning() {
  const all = fs.readFileSync(path.join(OUT, 'runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const lanes = [...new Set(all.map((r) => r.lane))];
  const rows = lanes.map((l) => {
    const rs = all.filter((r) => r.lane === l);
    const c = (o) => rs.filter((r) => r.outcome === o).length;
    const last = rs[rs.length - 1];
    return `| ${l} | ${rs.length} | ${c('pass')} | ${c('flaky')} | ${c('broken')} | ${c('skipped')} | ${last.outcome}${last.reason ? ` (${last.reason})` : ''} |`;
  });
  const flaky = new Map(), broken = new Map();
  for (const r of all) {
    if (r.outcome === 'flaky') for (const t of (r.failedFirst ?? [`(${r.lane} lane)`]).map(clean)) flaky.set(t, (flaky.get(t) ?? 0) + 1);
    if (r.outcome === 'broken') for (const t of (r.failedFinal ?? [`(${r.lane} lane)`]).map(clean)) broken.set(`${r.lane}: ${t}`, `iter ${r.iter}`);
  }
  const head = git(['log', '--oneline', '-1']);
  const md = [
    `# Night run, ${path.basename(OUT)}`, '',
    `Branch head: \`${head}\`. Iterations so far: ${Math.max(...all.map((r) => r.iter))}. Last update: ${new Date().toLocaleString()}.`, '',
    '| Lane | Runs | Pass | Flaky | Broken | Skipped | Last |', '|---|---|---|---|---|---|---|', ...rows, '',
    '## Broken (failed after 2 reruns)', ...(broken.size ? [...broken].map(([t, w]) => `- ${t} (last seen ${w})`) : ['- none']), '',
    '## Flaky (failed, then passed on rerun)', ...(flaky.size ? [...flaky].sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${n}x`) : ['- none']), '',
    'Logs, JSON and HTML reports, traces and screenshots of failures are under `iter-NNN/<lane>/`.',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'MORNING.md'), md + '\n');
}

function git(a) { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }); return (r.stdout ?? '').trim(); }
const bad = results.filter((r) => r.outcome === 'broken').map((r) => r.lane);
console.log(`[night] iter ${iter} done: ${results.map((r) => `${r.lane}=${r.outcome}`).join(' ')}; report ${path.join(OUT, 'MORNING.md')}`);
process.exit(bad.length ? 1 : 0);
