import { invoke } from '@castle-control/contract';
import type { ErrorCode, StatusResult } from '@castle-control/contract';
import { afterEach, expect, test, vi } from 'vitest';
import { createDesktopClient } from './client.js';
import { createReadModel } from './model.js';
import type { Source } from './model.js';
import { simulatedRead } from './simulated.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});

class TestSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn(() => { this.onclose?.({} as CloseEvent); });
  emit(kind: string, seq: number) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ kind, seq, at: '2026-10-25T12:00:00Z' }) }));
  }
}

function harness() {
  let status: StatusResult = { ...simulatedRead(1).status, simulated: false };
  const errors = new Map<string, ErrorCode>();
  const sockets: TestSocket[] = [];
  const socket = vi.fn(() => { const next = new TestSocket(); sockets.push(next); return next; });
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const method = String(init?.body).includes('"status.get"') ? 'status.get' : 'bridge.status.get';
    const code = errors.get(method);
    const data = code ? { code, message: 'unavailable' } : method === 'status.get' ? status : { state: 'connected' };
    return new Response(JSON.stringify(data), { status: code ? 400 : 200 });
  });
  vi.stubGlobal('fetch', fetch);
  const config = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
  const client = createDesktopClient(config, { socket, rpc: invoke });
  return { client, sockets, socket, fetch, config,
    fail: (method: 'status.get' | 'bridge.status.get', code: ErrorCode) => { errors.set(method, code); },
    setStatus: (next: StatusResult) => { status = next; } };
}

test('an unavailable bridge leaves the authoritative core status ready and bridge unknown', async () => {
  const h = harness();
  h.fail('bridge.status.get', 'unavailable');
  cleanup.push(h.client.start());
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  expect(h.client.getSnapshot().status).toEqual({ ...simulatedRead(1).status, simulated: false });
  expect(h.client.getSnapshot().bridge).toBeUndefined();
  expect(h.client.getSnapshot()).not.toHaveProperty('bridge');
  expect(h.client.getSnapshot()).not.toHaveProperty('message');
});

test.each([
  ['bridge.status.get', 'upstream'], ['bridge.status.get', 'unauthorized'],
  ['status.get', 'unavailable'], ['status.get', 'upstream'],
] as const)('%s failure %s still gives the generic core error', async (method, code) => {
  const h = harness();
  h.fail(method, code);
  cleanup.push(h.client.start());
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('error'); });
  expect(h.client.getSnapshot()).toEqual({ mode: 'core', phase: 'error',
    message: 'Core status unavailable. Retrying on connection or event.' });
});

test.each(['before', 'after'] as const)('initial socket open %s the load finishes does not duplicate RPC reads', async timing => {
  const h = harness();
  cleanup.push(h.client.start());
  if (timing === 'after') await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  h.sockets[0]?.onopen?.(new Event('open'));
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  expect(h.fetch.mock.calls.map(([, options]) => options?.body)).toEqual([
    '{"method":"status.get","params":{}}', '{"method":"bridge.status.get","params":{}}',
  ]);
});

test('RPC and WebSocket use the injected capability without putting it in URLs', async () => {
  const h = harness();
  cleanup.push(h.client.start());
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  const [url, init] = h.fetch.mock.calls[0] ?? [];
  expect(String(url)).toBe('http://127.0.0.1:3210/rpc');
  expect(init?.method).toBe('POST');
  expect(init?.headers).toEqual({ 'content-type': 'application/json', authorization: `Bearer ${h.config.session_token}` });
  expect(h.fetch.mock.calls.map(([, options]) => options?.body)).toEqual([
    '{"method":"status.get","params":{}}', '{"method":"bridge.status.get","params":{}}',
  ]);
  expect(h.socket).toHaveBeenCalledWith('ws://127.0.0.1:3210/events?since_seq=0', ['cc-events', `cc-session.${h.config.session_token}`]);
  expect(String(url)).not.toContain(h.config.session_token);
});

test('each invalidation and resync refetch authoritative reads, including a lower resync cursor', async () => {
  const h = harness();
  cleanup.push(h.client.start());
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  const socket = h.sockets[0];
  expect(socket).toBeDefined();
  let count = h.fetch.mock.calls.length;
  for (const [kind, seq] of [['bridge.status', 8], ['gatehouse.room', 9], ['resync', 2], ['obs.status', 3]] as const) {
    h.setStatus({ ...simulatedRead(1).status, stream: { live: false }, simulated: false, gatehouse: { armed_rules: 1, shadow_rules: 2, shield: true } });
    socket?.emit(kind, seq);
    count += 2;
    await vi.waitFor(() => { expect(h.fetch).toHaveBeenCalledTimes(count); });
    await vi.waitFor(() => { expect(h.client.getSnapshot().status?.stream?.live).toBe(false); });
  }
  expect(h.client.getSnapshot().status?.gatehouse?.shield).toBe(true);
  socket?.emit('bridge.status', 3);
  expect(h.fetch).toHaveBeenCalledTimes(count);
});

test('disconnect clears stale state, reconnect resumes since_seq, stop cancels retry', async () => {
  vi.useFakeTimers();
  const h = harness();
  const stop = h.client.start(); cleanup.push(stop);
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  h.sockets[0]?.emit('bridge.status', 17);
  await vi.waitFor(() => { expect(h.fetch).toHaveBeenCalledTimes(4); });
  h.sockets[0]?.close();
  expect(h.client.getSnapshot().status).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.socket).toHaveBeenLastCalledWith('ws://127.0.0.1:3210/events?since_seq=17', expect.arrayContaining(['cc-events']));
  expect(h.fetch).toHaveBeenCalledTimes(4);
  h.setStatus({ ...simulatedRead(0).status, simulated: false });
  h.sockets[1]?.onopen?.(new Event('open'));
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('ready'); });
  expect(h.fetch).toHaveBeenCalledTimes(6);
  expect(h.client.getSnapshot().status?.stream?.live).toBe(false);
  stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.socket).toHaveBeenCalledTimes(2);
});

test('invalid response and invalid event never become displayed state', async () => {
  const h = harness();
  h.fetch.mockImplementation(async () => new Response('{"invented":true}', { status: 200 }));
  cleanup.push(h.client.start());
  await vi.waitFor(() => { expect(h.client.getSnapshot().phase).toBe('error'); });
  expect(h.client.getSnapshot().status).toBeUndefined();
  h.sockets[0]?.emit('invented.kind', 1);
  expect(h.sockets[0]?.close).toHaveBeenCalled();
  expect(h.client.getSnapshot().status).toBeUndefined();
});

test('fixture mode rejects core configuration and never touches network, even when supplied a transport', async () => {
  vi.useFakeTimers();
  const h = harness();
  expect(() => createDesktopClient({ ...h.config, mode: 'fixture' })).toThrow('Invalid shell launch');
  const client = createDesktopClient({ mode: 'fixture' }, { socket: h.socket, rpc: invoke });
  cleanup.push(client.start());
  await vi.waitFor(() => { expect(client.getSnapshot().status?.simulated).toBe(true); });
  expect(client.getSnapshot().status?.stream?.live).toBe(false);
  await vi.advanceTimersByTimeAsync(1500);
  await vi.waitFor(() => { expect(client.getSnapshot().status?.stream?.live).toBe(true); });
  expect(client.getSnapshot().bridge?.state).toBe('connected');
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.socket).not.toHaveBeenCalled();
});

test.each(['https://127.0.0.1:3210/', 'http://example.com/', 'http://localhost:3210/', 'http://127.0.0.1:3210/?capability=x'])('refuses non-core endpoint %s', endpoint => {
  expect(() => createDesktopClient({ mode: 'core', endpoint, session_token: 'a'.repeat(64) })).toThrow();
});

test('in-flight invalidations are drained and late responses after stop are ignored', async () => {
  let invalidate: () => void = () => undefined;
  let resolveRead: ((value: ReturnType<typeof simulatedRead>) => void) | undefined;
  const source: Source = {
    mode: 'fixture', read: vi.fn(() => new Promise<ReturnType<typeof simulatedRead>>(resolve => { resolveRead = resolve; })),
    listen: callback => { invalidate = callback; return () => undefined; },
  };
  const client = createReadModel(source);
  const stop = client.start(); cleanup.push(stop);
  invalidate(); invalidate();
  expect(source.read).toHaveBeenCalledTimes(1);
  resolveRead?.(simulatedRead(0));
  await vi.waitFor(() => { expect(source.read).toHaveBeenCalledTimes(2); });
  stop();
  const before = client.getSnapshot();
  resolveRead?.(simulatedRead(1));
  await Promise.resolve();
  expect(client.getSnapshot()).toBe(before);
});

test('a read completing after disconnect cannot turn stale data back into a live display', async () => {
  let unavailable: () => void = () => undefined;
  let resolveRead: ((value: ReturnType<typeof simulatedRead>) => void) | undefined;
  const client = createReadModel({
    mode: 'core', read: () => new Promise(resolve => { resolveRead = resolve; }),
    listen: (_invalidate, onUnavailable) => { unavailable = onUnavailable; return () => undefined; },
  });
  cleanup.push(client.start());
  unavailable();
  resolveRead?.(simulatedRead(1));
  await Promise.resolve();
  expect(client.getSnapshot().phase).toBe('connecting');
  expect(client.getSnapshot().status).toBeUndefined();
});
