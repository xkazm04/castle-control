import { parseJson } from '@castle-control/contract/door';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { INSTRUCTIONS, serveMcp, SERVER_NAME } from './mcp.ts';
import { parseFrame } from './mcp-frame.ts';
import { openSession, type CallOutcome, type Session } from './session.ts';
import { TOOLS } from './tools.ts';
import { startFakeCore, type FakeCore } from './test/fake-core.ts';

type Reply = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
type ToolReply = { content: { type: string; text: string }[]; isError: boolean };

let core: FakeCore;
let launches: number;
let sessions: Session[];
const fast = { idleMs: 100, timeoutMs: 3000 };

beforeEach(async () => {
  core = await startFakeCore();
  launches = 0;
  sessions = [];
});
afterEach(() => core.close());

const fakeSession = async (): Promise<Session> => {
  launches++;
  const session = openSession(core.handoff, { stream: fast });
  sessions.push(session);
  return session;
};

const INIT = { jsonrpc: '2.0', id: 0, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'SIMULATED-client', version: '0' } } };
const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (id: number, name: string, args?: unknown) =>
  ({ jsonrpc: '2.0', id, method: 'tools/call', params: args === undefined ? { name } : { name, arguments: args } });

/** Feed lines, wait for the server to finish, and return its replies by id. */
async function serve(input: readonly (object | string)[], open: () => Promise<Session> = fakeSession) {
  const frames: string[] = [];
  let stderr = '';
  async function* lines() {
    for (const line of input) yield typeof line === 'string' ? line : JSON.stringify(line);
  }
  await serveMcp({ lines: lines(), write: frame => frames.push(frame), log: text => { stderr += text; },
    openSession: open, version: '0.1.0' }).done;
  // The capability never appears in any frame or diagnostic.
  for (const frame of frames) {
    expect(frame).not.toContain(core.handoff.token);
    expect(frame).not.toContain('\n');
  }
  expect(stderr).not.toContain(core.handoff.token);
  const replies = frames.map(frame => parseJson(frame) as Reply);
  const byId = (id: number | null) => {
    const found = replies.filter(reply => reply.id === id);
    expect(found).toHaveLength(1);
    return found[0] as Reply;
  };
  const tool = (id: number) => byId(id).result as ToolReply;
  return { frames, replies, stderr, byId, tool };
}

const payload = (reply: ToolReply): unknown => parseJson(reply.content[0]?.text ?? '');

test('initialize echoes a supported version, falls back to the newest, and needs no core', async () => {
  const { byId, replies } = await serve([
    { ...INIT, params: { ...INIT.params, protocolVersion: '2025-03-26' } },
    INITIALIZED,
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
    { jsonrpc: '2.0', id: 3, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 4, method: 'ping' },
  ]);
  expect(byId(0).result).toEqual({
    protocolVersion: '2025-03-26',
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: '0.1.0' },
    instructions: INSTRUCTIONS,
  });
  expect(byId(1).result).toMatchObject({ protocolVersion: '2024-11-05' });
  expect(byId(2).result).toMatchObject({ protocolVersion: '2025-06-18' });
  expect(byId(3).result).toMatchObject({ protocolVersion: '2025-06-18' });
  expect(byId(4).result).toEqual({});
  expect(replies).toHaveLength(5);
  expect(INSTRUCTIONS).toMatch(/SIMULATED.*no Twitch login, no OBS connection and no real viewers/);
  expect(launches).toBe(0);
});

test('tools/list is the tool table, before any core starts', async () => {
  const { byId } = await serve([INIT, INITIALIZED, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }]);
  expect(byId(1).result).toEqual({
    tools: TOOLS.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
  });
  expect(launches).toBe(0);
});

test('requests before initialize get -32002; ping is always answered', async () => {
  const { byId } = await serve([
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    call(2, 'status_get'),
    { jsonrpc: '2.0', id: 3, method: 'ping' },
  ]);
  expect(byId(1).error).toEqual({ code: -32002, message: 'Server not initialized: send initialize first' });
  expect(byId(2).error).toMatchObject({ code: -32002 });
  expect(byId(3).result).toEqual({});
  expect(launches).toBe(0);
});

test('tools/call runs against one lazily started core and returns pretty JSON', async () => {
  const { tool } = await serve([
    INIT, INITIALIZED,
    call(1, 'rehearsal_start'),
    call(2, 'rehearsal.crowd.set', { per_minute: 120 }),
    call(3, 'status_get', {}),
  ]);
  expect(tool(1).isError).toBe(false);
  expect(tool(1).content).toHaveLength(1);
  expect(tool(1).content[0]?.type).toBe('text');
  expect(tool(1).content[0]?.text).toContain('\n  "active": true');
  expect(payload(tool(2))).toMatchObject({ crowd_per_minute: 120 });
  expect(payload(tool(3))).toMatchObject({ simulated: true, obs_connected: false });
  expect(new Set(core.methods)).toEqual(new Set(['rehearsal.start', 'rehearsal.crowd.set', 'status.get']));
  expect(launches).toBe(1);
});

test('a core error envelope is an isError result, not a protocol error', async () => {
  const { tool, byId } = await serve([
    INIT,
    call(1, 'rehearsal_scenario_run', { scenario: 'vote_round' }),
    call(2, 'rehearsal_crowd_set', { per_minute: 9000 }),
  ]);
  expect(byId(1).error).toBeUndefined();
  expect(tool(1).isError).toBe(true);
  expect(payload(tool(1))).toEqual({ code: 'conflict', message: 'start a rehearsal first' });
  expect(payload(tool(2))).toEqual({ code: 'invalid', message: 'arguments do not match rehearsal.crowd.set params' });
  expect(core.methods).toEqual(['rehearsal.scenario.run']);
});

test('armed and unknown tool names are isError and never launch or reach a core', async () => {
  const names = ['gatehouse_ban_confirm', 'gatehouse.ban.confirm', 'auth_twitch_start', 'store_purgeAll',
    'beacons_art_status', 'nope'];
  const { tool } = await serve([INIT, ...names.map((name, index) => call(index + 1, name, {}))]);
  for (const [index, name] of names.entries()) {
    expect(tool(index + 1).isError).toBe(true);
    expect(tool(index + 1).content[0]?.text).toContain(`Unknown tool: ${name}`);
  }
  expect(launches).toBe(0);
  expect(core.methods).toEqual([]);
});

test('malformed, invalid and unknown frames get the right JSON-RPC errors', async () => {
  const { byId, replies } = await serve([
    INIT,
    '{not json',
    '[{"jsonrpc":"2.0","id":7,"method":"ping"}]',
    '{"id":8,"method":"ping"}',
    '{"jsonrpc":"2.0","id":9,"method":42}',
    '{"jsonrpc":"2.0","id":10,"method":"ping","params":"x"}',
    '{"jsonrpc":"2.0","id":null,"method":"ping"}',
    { jsonrpc: '2.0', id: 11, method: 'resources/list' },
    { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { arguments: {} } },
    { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'status_get', arguments: [] } },
    { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
    { jsonrpc: '2.0', id: 'client-1', result: {} },
    '',
  ]);
  const nulls = replies.filter(reply => reply.id === null).map(reply => reply.error?.code);
  expect(nulls.sort()).toEqual([-32700, -32600, -32600].sort());
  expect(byId(8).error?.code).toBe(-32600);
  expect(byId(9).error?.code).toBe(-32600);
  expect(byId(10).error?.code).toBe(-32600);
  expect(byId(11).error).toEqual({ code: -32601, message: 'Method not found: resources/list' });
  expect(byId(12).error?.code).toBe(-32602);
  expect(byId(13).error?.code).toBe(-32602);
  expect(replies).toHaveLength(10);
  expect(launches).toBe(0);
});

test('the frame door classifies every shape', () => {
  expect(parseFrame('{"jsonrpc":"2.0","id":"a","method":"ping"}')).toEqual(
    { kind: 'request', id: 'a', method: 'ping', params: undefined });
  expect(parseFrame('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toMatchObject({ kind: 'notification' });
  expect(parseFrame('{"jsonrpc":"2.0","id":3,"error":{"code":1,"message":"m"}}')).toEqual({ kind: 'response' });
  expect(parseFrame(`"${'x'.repeat(1024 * 1024)}"`)).toMatchObject({ kind: 'error', id: null, code: -32700 });
});

test('a launch failure is an isError result and the next call retries', async () => {
  let attempts = 0;
  const flaky = () => ++attempts === 1 ? Promise.reject(new Error('headless core startup timed out')) : fakeSession();
  const first = await serve([INIT, call(1, 'status_get')], flaky);
  expect(first.tool(1)).toEqual({ isError: true, content: [{ type: 'text',
    text: 'Headless core launch failed: headless core startup timed out. The next tools/call retries the launch.' }] });
  expect(first.stderr).toContain('core launch failed');
  // Sequential calls in one server: the failed launch is not cached.
  let tries = 0;
  const later = () => ++tries === 1 ? Promise.reject(new Error('cargo build of cc-headless failed (101)'))
    : fakeSession();
  async function* slow() {
    yield JSON.stringify(INIT);
    yield JSON.stringify(call(1, 'status_get'));
    await new Promise(done => setTimeout(done, 50));
    yield JSON.stringify(call(2, 'status_get'));
  }
  const frames: string[] = [];
  await serveMcp({ lines: slow(), write: frame => frames.push(frame), log: () => undefined, openSession: later,
    version: '0.1.0' }).done;
  const results = frames.map(frame => parseJson(frame) as Reply).filter(reply => reply.id !== 0);
  expect(results.map(reply => (reply.result as ToolReply).isError)).toEqual([true, false]);
  expect(tries).toBe(2);
});

test('concurrent requests are each answered by id, in completion order', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(done => { release = done; });
  let closed = 0;
  const handoff = { endpoint: 'http://127.0.0.1:1/', token: 'ab'.repeat(32), overlay_origin: 'http://localhost:1' };
  const stub: Session = {
    endpoint: handoff.endpoint,
    overlayOrigin: handoff.overlay_origin,
    async call(name): Promise<CallOutcome> {
      if (name === 'status_get') await gate;
      else release();
      // A result that carried the capability is scrubbed before it is written.
      return { ok: true, result: { name, echo: handoff.token } };
    },
    eventsSince: () => Promise.reject(new Error('not used')),
    overlaySnapshot: () => Promise.reject(new Error('not used')),
    uiHandoff: () => handoff,
    close: async () => { closed++; },
  };
  const { frames, tool } = await serve([INIT, call(1, 'status_get'), call(2, 'obs_status_get')], async () => stub);
  const order = frames.map(frame => (parseJson(frame) as Reply).id);
  expect(order).toEqual([0, 2, 1]);
  expect(payload(tool(1))).toEqual({ name: 'status_get', echo: '[redacted]' });
  expect(frames.join('\n')).not.toContain(handoff.token);
  expect(closed).toBe(1);
});

test('input end closes the session; shutdown during a call still closes it', async () => {
  await serve([INIT, call(1, 'status_get')]);
  expect(sessions).toHaveLength(1);
  expect(await sessions[0]?.call('status_get')).toEqual({ ok: false,
    error: { code: 'unavailable', message: 'session is closed' } });

  let push: (line: string) => void = () => undefined;
  async function* open() {
    yield JSON.stringify(INIT);
    yield JSON.stringify(call(1, 'status_get'));
    yield await new Promise<string>(done => { push = done; });
  }
  const server = serveMcp({ lines: open(), write: () => undefined, log: () => undefined,
    openSession: fakeSession, version: '0.1.0' });
  await new Promise(done => setTimeout(done, 200));
  await server.shutdown();
  expect(sessions).toHaveLength(2);
  expect(await sessions[1]?.call('status_get')).toMatchObject({ ok: false, error: { message: 'session is closed' } });
  push('{"jsonrpc":"2.0","id":2,"method":"ping"}');
  await server.done;
});
