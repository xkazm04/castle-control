#!/usr/bin/env node
// Night OBS lane: isolate, launch a separate OBS, run e2e/night/obs.spec.ts against
// it, then always tear down and restore. Prints `skipped: <reason>` and exits 0 when
// the lane cannot run safely; exits 1 on a failure, 0 on a pass.
//
// Isolation: never touches the owner's OBS (skips if obs64 is running), never port
// 4455, never reads or prints the owner's websocket password. The owner's
// global.ini and user.ini are backed up byte-for-byte and restored and verified,
// even on failure. Only the profile and scene collection named CastleControl-Test
// are created, and only those are removed.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ObsSocket } from '../../e2e/night/obs-ws.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.env.NIGHT_OUT ?? path.join(ROOT, 'e2e', 'night-results', 'obs'));
const NAME = 'CastleControl-Test';
const PORT = 4466;
const OBS_BIN = 'C:/Program Files/obs-studio/bin/64bit';
const OBS_EXE = path.join(OBS_BIN, 'obs64.exe');
const CONFIG = path.join(process.env.APPDATA ?? '', 'obs-studio');
const OWNED = ['global.ini', 'user.ini'];
const PROFILE = path.join(CONFIG, 'basic', 'profiles', NAME);
const COLLECTION = path.join(CONFIG, 'basic', 'scenes', `${NAME}.json`);
// A killed run (the night runner's lane timeout) restores here on the next start.
const PENDING = path.join(ROOT, 'target', 'night-obs-pending.json');
const BACKUP = path.join(OUT, 'obs-backup');
const summary = { lane: 'obs', started: new Date().toISOString(), outcome: 'fail', reason: '', steps: [] };

fs.mkdirSync(OUT, { recursive: true });
const step = (text) => { summary.steps.push(`${new Date().toISOString()} ${text}`); console.log(`[obs lane] ${text}`); };
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const killTree = (pid) => spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });

function obsRunning() {
  const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true });
  return /"obs64\.exe"/i.test(result.stdout ?? '');
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** Names, sizes and mtimes only: the owner's profiles may hold a stream key, so contents are never read. */
function ownerInventory() {
  const rows = [];
  for (const folder of [path.join(CONFIG, 'basic', 'profiles'), path.join(CONFIG, 'basic', 'scenes')]) {
    if (!fs.existsSync(folder)) continue;
    for (const entry of fs.readdirSync(folder, { recursive: true })) {
      const name = String(entry);
      if (name === NAME || name.startsWith(`${NAME}${path.sep}`) || name.startsWith(`${NAME}.json`)) continue;
      const stat = fs.statSync(path.join(folder, name));
      rows.push(`${path.relative(CONFIG, path.join(folder, name))}|${stat.isDirectory() ? 'dir' : stat.size}|${stat.mtimeMs}`);
    }
  }
  return rows.sort();
}

const sentinels = () => (fs.existsSync(path.join(CONFIG, '.sentinel')) ? fs.readdirSync(path.join(CONFIG, '.sentinel')) : []);

function backup() {
  fs.mkdirSync(BACKUP, { recursive: true });
  const files = {};
  for (const name of OWNED) {
    const source = path.join(CONFIG, name);
    if (!fs.existsSync(source)) { files[name] = null; continue; }
    fs.copyFileSync(source, path.join(BACKUP, name));
    files[name] = sha(source);
    if (sha(path.join(BACKUP, name)) !== files[name]) throw new Error(`backup of ${name} does not match`);
  }
  return files;
}

/** Restore byte-for-byte and verify by hash. Returns the names that failed. */
function restore(manifest) {
  const failed = [];
  for (const [name, hash] of Object.entries(manifest.files)) {
    const target = path.join(CONFIG, name);
    try {
      if (hash === null) { fs.rmSync(target, { force: true }); continue; }
      fs.copyFileSync(path.join(manifest.backup, name), target);
      if (sha(target) !== hash) failed.push(name);
    } catch (error) {
      failed.push(`${name} (${error.code ?? error.message})`);
    }
  }
  return failed;
}

function removeTestProfile() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  for (const file of [COLLECTION, `${COLLECTION}.bak`]) fs.rmSync(file, { force: true });
}

function createTestProfile() {
  // Leftovers can only be this lane's own (the name is reserved for it); replace them.
  if (fs.existsSync(PROFILE) || fs.existsSync(COLLECTION)) { step('replacing a leftover CastleControl-Test profile'); removeTestProfile(); }
  fs.mkdirSync(PROFILE);
  fs.writeFileSync(path.join(PROFILE, 'basic.ini'), [
    '[General]', `Name=${NAME}`, '', '[Video]', 'BaseCX=1280', 'BaseCY=720', 'OutputCX=1280', 'OutputCY=720',
    'FPSType=0', 'FPSCommon=30', '', '[Output]', 'Mode=Simple', '',
  ].join('\r\n'), { flag: 'wx' });
  const scene = { id: 'scene', versioned_id: 'scene', name: 'Scene', uuid: randomUUID(),
    settings: { items: [], id_counter: 0, custom_size: false }, enabled: true, flags: 0, mixers: 0, volume: 1.0 };
  fs.writeFileSync(COLLECTION, JSON.stringify({ name: NAME, current_scene: 'Scene', current_program_scene: 'Scene',
    scene_order: [{ name: 'Scene' }], sources: [scene], groups: [], transitions: [], current_transition: 'Fade',
    transition_duration: 300 }, null, 2), { flag: 'wx' });
}

async function waitForWebsocket(child, password) {
  const deadline = Date.now() + 90_000;
  let exited;
  child.once('exit', (code) => { exited = code; });
  while (Date.now() < deadline) {
    if (exited !== undefined) throw new Error(`OBS exited before its websocket listened (exit code ${exited})`);
    try {
      const socket = await ObsSocket.connect(PORT, password, 3_000);
      const version = await socket.request('GetVersion');
      socket.close();
      return version;
    } catch (error) {
      if (/closed \(4009\)|Authentication/i.test(String(error))) throw new Error('OBS refused the per-run websocket password', { cause: error });
      await sleep(1_000);
    }
  }
  throw new Error(`no obs-websocket on ${PORT} within 90 s (OBS ignored --websocket_port or its server is disabled)`);
}

async function sweepSources(password) {
  const socket = await ObsSocket.connect(PORT, password, 5_000);
  try {
    const items = await socket.request('GetSceneItemList', { sceneName: 'Scene' });
    const ours = (items.sceneItems ?? []).map((item) => String(item.sourceName)).filter((name) => name.startsWith('Castle Control · '));
    for (const name of ours) await socket.request('RemoveInput', { inputName: name });
    const after = await socket.request('GetSceneItemList', { sceneName: 'Scene' });
    const left = (after.sceneItems ?? []).length;
    step(`removed ${ours.length} test source(s); ${left} item(s) left in Scene`);
    if (left !== 0) throw new Error(`${left} scene item(s) remain after the sweep`);
  } finally { socket.close(); }
}

async function closeObs(child) {
  if (child.exitCode !== null) return;
  // Graceful close first (WM_CLOSE), then force the tree within a bounded wait.
  spawnSync('taskkill', ['/PID', String(child.pid), '/T'], { stdio: 'ignore', windowsHide: true });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (await Promise.race([exited.then(() => true), sleep(20_000).then(() => false)])) { step('OBS closed'); return; }
  killTree(child.pid);
  await Promise.race([exited, sleep(10_000)]);
  step(child.exitCode === null ? 'OBS did not exit after a forced kill' : 'OBS force-closed');
}

function runSpec(password) {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const env = { ...process.env, NIGHT_OUT: OUT, CC_NIGHT_OBS_LANE: '1', CC_NIGHT_OBS_PORT: String(PORT), CC_NIGHT_OBS_PASSWORD: password };
  for (const key of ['CC_LIVE_TWITCH', 'CC_LIVE_OBS', 'CC_LIVE_FLOOR']) delete env[key];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', '-c', 'e2e/night.config.ts'], { cwd: ROOT, env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { step('spec timed out after 15 min'); killTree(child.pid); }, 15 * 60_000);
    child.once('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
}

function finish(outcome, reason) {
  Object.assign(summary, { outcome, reason, finished: new Date().toISOString() });
  fs.writeFileSync(path.join(OUT, 'obs-lane.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (outcome === 'skipped') console.log(`skipped: ${reason}`);
  else console.log(`[obs lane] ${outcome}${reason ? `: ${reason}` : ''}`);
  process.exitCode = outcome === 'fail' ? 1 : 0;
}

// A previous run killed before its teardown left a manifest: restore that first.
if (fs.existsSync(PENDING)) {
  const manifest = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  if (manifest.pid && obsRunning()) killTree(manifest.pid);
  const failed = restore(manifest);
  if (failed.length) { finish('fail', `could not restore a previous run's OBS config: ${failed.join(', ')}`); process.exit(); }
  removeTestProfile();
  fs.rmSync(PENDING, { force: true });
  step('restored the OBS config left by a previous interrupted run');
}

if (obsRunning()) { finish('skipped', 'an obs64 process is already running; the owner OBS is never touched'); process.exit(); }
if (!fs.existsSync(OBS_EXE)) { finish('skipped', `OBS is not installed at ${OBS_EXE}`); process.exit(); }
if (!fs.existsSync(path.join(CONFIG, 'global.ini'))) { finish('skipped', 'no OBS global.ini; OBS has never been set up on this machine'); process.exit(); }
if (!(await portFree(PORT))) { finish('skipped', `port ${PORT} is in use`); process.exit(); }

const password = randomBytes(24).toString('hex'); // Per run, memory and child environments only.
const inventory = ownerInventory();
const sentinelsBefore = new Set(sentinels());
const manifest = { backup: BACKUP, files: backup(), pid: null };
fs.mkdirSync(path.dirname(PENDING), { recursive: true });
fs.writeFileSync(PENDING, JSON.stringify(manifest));
step(`backed up ${Object.keys(manifest.files).join(' and ')}`);
let child;
let outcome = 'fail';
let reason = '';
try {
  createTestProfile();
  step(`created profile and scene collection ${NAME} with the scene "Scene"`);
  child = spawn(OBS_EXE, ['--multi', '--profile', NAME, '--collection', NAME, '--websocket_port', String(PORT),
    '--websocket_password', password, '--disable-shutdown-check', '--minimize-to-tray'],
  { cwd: OBS_BIN, stdio: 'ignore', windowsHide: false });
  manifest.pid = child.pid;
  fs.writeFileSync(PENDING, JSON.stringify(manifest));
  let version;
  try { version = await waitForWebsocket(child, password); }
  catch (error) { outcome = 'skipped'; reason = error.message; }
  if (version) {
    step(`OBS ${version.obsVersion} with obs-websocket ${version.obsWebSocketVersion} listening on ${PORT}`);
    const code = await runSpec(password);
    outcome = code === 0 ? 'pass' : 'fail';
    reason = code === 0 ? '' : `obs.spec.ts exited ${code}`;
  }
} catch (error) {
  outcome = 'fail'; reason = error.message;
} finally {
  if (child && child.exitCode === null) {
    await sweepSources(password).catch((error) => {
      step(`source sweep failed: ${error.message}`);
      if (outcome === 'pass') { outcome = 'fail'; reason = 'test sources could not be removed'; }
    });
    await closeObs(child);
  }
  const failed = restore(manifest);
  if (failed.length) { outcome = 'fail'; reason = `RESTORE FAILED for ${failed.join(', ')}; backups kept in ${BACKUP}`; }
  else {
    step('restored global.ini and user.ini; hashes match the backup');
    // The backups may hold the owner's websocket settings: keep them only while needed.
    fs.rmSync(BACKUP, { recursive: true, force: true });
    fs.rmSync(PENDING, { force: true });
  }
  removeTestProfile();
  for (const name of sentinels().filter((entry) => !sentinelsBefore.has(entry))) {
    fs.rmSync(path.join(CONFIG, '.sentinel', name), { recursive: true, force: true });
    step(`removed this run's OBS sentinel ${name}`);
  }
  // The per-run password must never reach a report, log or screenshot folder.
  const leaked = fs.readdirSync(OUT, { recursive: true }).map(String)
    .filter((name) => /\.(json|html|md|txt|log)$/i.test(name))
    .filter((name) => fs.readFileSync(path.join(OUT, name), 'latin1').includes(password));
  if (leaked.length) { outcome = 'fail'; reason = `${reason ? `${reason}; ` : ''}the per-run OBS password reached ${leaked.join(', ')}`; }
  const changed = JSON.stringify(ownerInventory()) !== JSON.stringify(inventory);
  if (changed) { outcome = 'fail'; reason = `${reason ? `${reason}; ` : ''}the owner's profile or scene inventory changed`; }
  else step('owner profiles and scene collections unchanged (names, sizes, mtimes)');
  finish(outcome, reason);
}
