import { spawnSync } from 'node:child_process';
import { parseJson } from '@castle-control/contract/door';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { EXIT, main, parseScript, type CliDeps } from './cli.ts';
import { CoreLaunchError, startCore } from './core.ts';
import { openSession } from './session.ts';
import { startFakeCore, type FakeCore } from './test/fake-core.ts';

let core: FakeCore;
let launches: number;
beforeEach(async () => {
  core = await startFakeCore();
  launches = 0;
});
afterEach(() => core.close());

const fast = { idleMs: 100, timeoutMs: 3000 };
const deps = (): CliDeps => ({ startCore: async () => {
  launches++;
  return openSession(core.handoff, { stream: fast });
} });

async function cc(argv: string[], stdin = '', dependencies = deps()) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, { stdout: text => { stdout += text; }, stderr: text => { stderr += text; },
    stdin: Readable.from([stdin]) }, dependencies);
  // The capability never appears in anything the CLI prints.
  expect(stdout).not.toContain(core.handoff.token);
  expect(stderr).not.toContain(core.handoff.token);
  return { code, stdout, stderr };
}

test('tools prints the table without starting a core', async () => {
  const { code, stdout } = await cc(['tools']);
  expect(code).toBe(EXIT.ok);
  expect(stdout).toMatch(/^rehearsal_scenario_run\s+simulated\s+Run one generated scenario/m);
  expect(stdout.trim().split('\n')).toHaveLength(27);
  expect(launches).toBe(0);
});

test('call prints pretty JSON; dotted names work; envelopes exit 1', async () => {
  const ok = await cc(['call', 'rehearsal.start']);
  expect(ok.code).toBe(EXIT.ok);
  expect(parseJson(ok.stdout)).toMatchObject({ active: true, obs: { connected: false } });
  expect(ok.stdout).toContain('\n  "active": true');
  const refused = await cc(['call', 'gatehouse_chat_list', '{"limit":5}']);
  expect(refused.code).toBe(EXIT.error);
  expect(parseJson(refused.stdout)).toMatchObject({ error: { code: 'unavailable' } });
});

test('unknown or armed tool exits 2 with the list, before any launch', async () => {
  for (const name of ['nope', 'auth_twitch_start', 'store.purgeAll']) {
    const { code, stderr } = await cc(['call', name]);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain(`unknown tool: ${name}`);
    expect(stderr).toContain('available: status_get, settings_get');
  }
  expect((await cc(['call', 'status_get', '{bad'])).code).toBe(EXIT.usage);
  expect((await cc(['frobnicate'])).code).toBe(EXIT.usage);
  expect((await cc(['call'])).code).toBe(EXIT.usage);
  expect((await cc(['--nope', 'tools'])).code).toBe(EXIT.usage);
  expect(launches).toBe(0);
});

test('run streams NDJSON for happy and error lines, exit 1 if any failed', async () => {
  const script = [
    '{"tool":"rehearsal_start"}',
    '{"tool":"rehearsal.crowd.set","args":{"per_minute":120}}',
    '',
    '{"tool":"rehearsal_scenario_run","args":{"scenario":"vote_round"}}',
    '{"tool":"rehearsal_crowd_set","args":{"per_minute":9000}}',
    '{"tool":"events_since","args":{"since_seq":0}}',
  ].join('\n');
  const { code, stdout } = await cc(['run', '-'], script);
  expect(code).toBe(EXIT.error);
  const lines = stdout.trim().split('\n').map(line => parseJson(line) as { tool: string; ok: boolean });
  expect(lines.map(line => [line.tool, line.ok])).toEqual([['rehearsal_start', true], ['rehearsal_crowd_set', true],
    ['rehearsal_scenario_run', true], ['rehearsal_crowd_set', false], ['events_since', true]]);
  expect(lines[3]).toMatchObject({ error: { code: 'invalid' } });
  expect(lines[4]).toMatchObject({ result: { next_seq: 3 } });

  const happy = await cc(['run', '-'], '{"tool":"status_get"}\n{"tool":"obs_status_get","args":{}}\n');
  expect(happy.code).toBe(EXIT.ok);
  expect(happy.stdout.trim().split('\n')).toHaveLength(2);
});

test('run checks the whole script before launching', async () => {
  const before = launches;
  const unknown = await cc(['run', '-'], '{"tool":"status_get"}\n{"tool":"gatehouse_ban_confirm","args":{}}\n');
  expect(unknown.code).toBe(EXIT.usage);
  expect(unknown.stderr).toContain('line 2: unknown tool gatehouse_ban_confirm');
  expect((await cc(['run', '-'], '{"tool":"status_get","extra":1}')).code).toBe(EXIT.usage);
  expect((await cc(['run', '-'], 'not json')).code).toBe(EXIT.usage);
  expect((await cc(['run', join(tmpdir(), 'cc-headless-missing.jsonl')])).code).toBe(EXIT.usage);
  expect(launches).toBe(before);
  expect(parseScript('{"tool":"status_get"}\r\n')).toMatchObject({ steps: [{ args: {} }] });
});

test('repl runs lines against one core', async () => {
  const { code, stdout, stderr } = await cc(['repl'], 'status_get\nrehearsal_crowd_set {"per_minute":30}\nnope\nexit\n');
  expect(code).toBe(EXIT.ok);
  expect(stdout).toContain('"simulated": true');
  expect(stdout).toContain('"crowd_per_minute": 30');
  expect(stderr).toContain('unknown tool: nope');
  expect(launches).toBe(1);
});

test('a core launch failure exits 3', async () => {
  const failing: CliDeps = { startCore: () => Promise.reject(new CoreLaunchError('headless core startup timed out')) };
  const { code, stderr } = await cc(['call', 'status_get'], '', failing);
  expect(code).toBe(EXIT.launch);
  expect(stderr).toBe('cc: headless core startup timed out\n');
});

const launcher = fileURLToPath(new URL('./test/fake-launcher.ts', import.meta.url));

test('startCore spawns a launcher, never forwards its output, and removes its temp root', async () => {
  const roots = () => readdirSync(tmpdir()).filter(name => name.startsWith('cc-headless-'));
  const before = new Set(roots());
  let token = '';
  let root = '';
  const spawned: CliDeps = { startCore: async options => {
    const session = await startCore({ ...options, exe: process.execPath, launcherArgs: [launcher], stream: fast });
    token = session.uiHandoff().token;
    root = roots().find(name => !before.has(name)) ?? '';
    return session;
  } };
  const script = join(mkdtempSync(join(tmpdir(), 'cc-test-')), 'steps.jsonl');
  writeFileSync(script, '{"tool":"rehearsal_start"}\n{"tool":"overlay_snapshot","args":{"kind":"gatehouse"}}\n');
  const { code, stdout, stderr } = await cc(['run', script], '', spawned);
  rmSync(join(script, '..'), { recursive: true, force: true });
  expect(code).toBe(EXIT.ok);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(stdout).not.toContain(token);
  expect(stderr).not.toContain(token);
  expect(stdout).not.toContain('leak-probe');
  expect(root).not.toBe('');
  expect(existsSync(join(tmpdir(), root))).toBe(false);
});

test('a kept data root survives close; a bad launcher is a launch error', async () => {
  const kept = mkdtempSync(join(tmpdir(), 'cc-kept-'));
  const session = await startCore({ exe: process.execPath, launcherArgs: [launcher], dataRoot: kept });
  await session.close();
  expect(existsSync(join(kept, 'SIMULATED-core-state.txt'))).toBe(true);
  rmSync(kept, { recursive: true, force: true });
  await expect(startCore({ exe: process.execPath, launcherArgs: ['-e', 'process.stdout.write("{}\\n")'] }))
    .rejects.toThrow('headless core returned an invalid handoff');
  await expect(startCore({ exe: join(tmpdir(), 'cc-headless-no-such.exe') })).rejects.toBeInstanceOf(CoreLaunchError);
});

test('the cc bin runs under plain node', () => {
  const bin = fileURLToPath(new URL('./cc.mjs', import.meta.url));
  const tools = spawnSync(process.execPath, [bin, 'tools'], { encoding: 'utf8' });
  expect(tools.status).toBe(EXIT.ok);
  expect(tools.stdout).toContain('overlay_snapshot');
  const unknown = spawnSync(process.execPath, [bin, 'call', 'auth_twitch_start'], { encoding: 'utf8' });
  expect(unknown.status).toBe(EXIT.usage);
  expect(unknown.stderr).toContain('unknown tool: auth_twitch_start');
}, 20_000);
