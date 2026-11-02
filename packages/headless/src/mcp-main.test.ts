import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from '@castle-control/contract/door';
import { expect, test } from 'vitest';
import { startCore } from './core.ts';
import { serveMcp } from './mcp.ts';
import { packageVersion } from './mcp-main.ts';
import { TOOLS } from './tools.ts';

type Reply = { id: number | null; result?: { isError?: boolean; content?: { text: string }[]; tools?: unknown[] };
  error?: { code: number } };

const launcher = fileURLToPath(new URL('./test/fake-launcher.ts', import.meta.url));
const lines = (...messages: object[]) => messages.map(message => `${JSON.stringify(message)}\n`).join('');
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } };

test('a spawned core is stopped and its temp root removed when input ends; core output never leaks', async () => {
  const roots = () => readdirSync(tmpdir()).filter(name => name.startsWith('cc-headless-'));
  const before = new Set(roots());
  let token = '';
  let root = '';
  const frames: string[] = [];
  let stderr = '';
  async function* input() {
    yield JSON.stringify(INIT);
    yield JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'rehearsal_start' } });
    yield JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'overlay_snapshot', arguments: { kind: 'gatehouse' } } });
  }
  await serveMcp({
    lines: input(),
    write: frame => frames.push(frame),
    log: text => { stderr += text; },
    openSession: async () => {
      const session = await startCore({ exe: process.execPath, launcherArgs: [launcher],
        stream: { idleMs: 100, timeoutMs: 3000 } });
      token = session.uiHandoff().token;
      root = roots().find(name => !before.has(name)) ?? '';
      return session;
    },
    version: packageVersion(),
  }).done;
  const replies = frames.map(frame => parseJson(frame) as Reply);
  expect(replies.map(reply => reply.result?.isError)).toEqual([undefined, false, false]);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(frames.join('\n')).not.toContain(token);
  expect(frames.join('\n')).not.toContain('leak-probe');
  expect(stderr).not.toContain(token);
  expect(root).not.toBe('');
  expect(existsSync(join(tmpdir(), root))).toBe(false);
}, 20_000);

test('the cc-mcp bin answers initialize and tools/list without a core, then exits 0 on stdin end', () => {
  const bin = fileURLToPath(new URL('./cc-mcp.mjs', import.meta.url));
  const missing = join(tmpdir(), 'cc-headless-no-such.exe');
  const run = spawnSync(process.execPath, [bin], {
    encoding: 'utf8',
    env: { ...process.env, CC_HEADLESS_EXE: missing },
    input: lines(
      INIT,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'status_get', arguments: {} } },
    ),
    timeout: 20_000,
  });
  expect(run.status).toBe(0);
  const frames = run.stdout.trim().split('\n');
  expect(frames).toHaveLength(3);
  const replies = frames.map(frame => parseJson(frame) as Reply);
  const byId = (id: number) => replies.find(reply => reply.id === id);
  expect(byId(1)?.result).toMatchObject({ protocolVersion: '2025-03-26',
    serverInfo: { name: 'castle-control-headless', version: packageVersion() } });
  expect(byId(2)?.result?.tools).toHaveLength(TOOLS.length);
  // CC_HEADLESS_EXE points at nothing: the launch fails as a tool result, never a crash.
  expect(byId(3)?.result?.isError).toBe(true);
  expect(byId(3)?.result?.content?.[0]?.text).toContain('Headless core launch failed');
  expect(run.stderr).toContain('cc-mcp: core launch failed');
}, 30_000);
