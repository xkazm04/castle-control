import { expect, test, vi } from 'vitest';
import { ERROR_CODES, EVENT_KINDS, RPC_METHODS, parseError, parseEvent, parseParams, parseResult, invoke } from './index.js';
import { statusGet, bridgeStatusGet, parseMethodParams, parseMethodResult, invokeMethod } from './index.js';

const status = { at: '2026-10-25T12:00:00Z', version: '0.1.0', uptime_ms: 42,
  twitch_connected: false, obs_connected: false, simulated: true };

test('generated inventory has 49 methods, 16 kinds and exactly ten error codes', () => {
  expect(new Set(RPC_METHODS).size).toBe(49);
  expect(new Set(EVENT_KINDS).size).toBe(16);
  expect(new Set(ERROR_CODES).size).toBe(10);
  expect(ERROR_CODES).toEqual(['invalid', 'not_found', 'conflict', 'unauthorized', 'rate_limited',
    'upstream', 'unavailable', 'blocked_by_policy', 'needs_human', 'internal']);
});

test('Ajv validates core shapes and rejects wrong casing, unknown keys and null', () => {
  expect(parseResult('status.get', JSON.stringify(status))).toEqual(status);
  expect(() => parseParams('status.get', { surprise: true })).toThrow();
  expect(() => parseResult('status.get', JSON.stringify({ ...status, uptime_ms: '42' }))).toThrow();
  expect(() => parseResult('status.get', JSON.stringify({ ...status, at: 'yesterday' }))).toThrow();
  expect(() => parseResult('status.get', JSON.stringify({ ...status, at: '2026-02-30T12:00:00Z' }))).toThrow();
  expect(() => parseResult('status.get', JSON.stringify({ ...status, uptime_ms: 1e20 }))).toThrow();
  expect(() => parseResult('status.get', JSON.stringify({ ...status, twitchConnected: false }))).toThrow();
  expect(parseError('{"code":"invalid","message":"simulated input"}')).toEqual({ code: 'invalid', message: 'simulated input' });
  for (const value of [{ retry_after_ms: null }, { detail: null }, { detail: { unknown: null } }, { code: 'invented' }]) {
    expect(() => parseError(JSON.stringify({ code: 'invalid', message: 'simulated', ...value }))).toThrow();
  }
});

test('later WP placeholders cannot accidentally accept a crossing', () => {
  for (const value of [{}, null, false, [], 'simulated']) {
    expect(() => parseParams('lots.cast', value)).toThrow();
    expect(() => parseResult('lots.cast', JSON.stringify(value))).toThrow();
  }
});

test('Twitch IDs stay strings and absent auth values are omitted', () => {
  const auth = { connected: false, pending: false, scopes: [] };
  expect(parseResult('auth.twitch.status', JSON.stringify(auth))).toEqual(auth);
  expect(parseResult('auth.twitch.status', JSON.stringify({ ...auth, user_id: '9007199254740993' })).user_id).toBe('9007199254740993');
  for (const user_id of [null, '', 'not-an-id', '123\n', 123]) {
    expect(() => parseResult('auth.twitch.status', JSON.stringify({ ...auth, user_id }))).toThrow();
  }
});

test('events require seq/at/kind and names from the closed registry', () => {
  for (const kind of EVENT_KINDS) {
    expect(parseEvent(JSON.stringify({ seq: 3, at: status.at, kind })).kind).toBe(kind);
  }
  expect(() => parseEvent('{"seq":1,"at":"2026-10-25T12:00:00Z","kind":"simulated.unknown"}')).toThrow();
  expect(() => parseEvent('{"kind":"resync"}')).toThrow();
});

test('invocation sends the capability, validates the result and never retries', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(status)));
  vi.stubGlobal('fetch', fetcher);
  try {
    expect(await invoke('http://127.0.0.1:1234', 'simulated-capability', 'status.get', {})).toEqual(status);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer simulated-capability' });
    fetcher.mockResolvedValue(new Response('{"code":"unavailable","message":"simulated"}', { status: 503 }));
    await expect(invoke('http://127.0.0.1:1234', 'simulated-capability', 'status.get', {})).rejects.toEqual({ code: 'unavailable', message: 'simulated' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});

test('selected method validators retain the generic door checks', () => {
  expect(parseMethodParams(statusGet, {})).toEqual(parseParams('status.get', {}));
  expect(parseMethodResult(statusGet, JSON.stringify(status))).toEqual(parseResult('status.get', JSON.stringify(status)));
  for (const value of [null, { surprise: true }, []]) {
    expect(() => parseMethodParams(statusGet, value)).toThrow();
  }
  for (const value of [null, {}, { ...status, surprise: true }, { ...status, at: '2026-02-30T00:00:00Z' },
    { ...status, uptime_ms: 1e20 }, { ...status, stream: { live: true, viewer_count: null } }]) {
    expect(() => parseMethodResult(statusGet, JSON.stringify(value))).toThrow();
  }
  expect(parseMethodResult(bridgeStatusGet, '{"state":"connected"}')).toEqual({ state: 'connected' });
  for (const text of ['{', 'null', '{"state":"invented"}', '{"state":"connected","surprise":true}']) {
    expect(() => parseMethodResult(bridgeStatusGet, text)).toThrow();
  }
});

test('selected invocation validates before sending and after receiving, including errors', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(status)));
  vi.stubGlobal('fetch', fetcher);
  try {
    // Simulate an untyped caller: runtime validation must precede fetch.
    await expect(Reflect.apply(invokeMethod, undefined,
      ['http://127.0.0.1:1234', 'simulated-capability', statusGet, { surprise: true }])).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await invokeMethod('http://127.0.0.1:1234', 'simulated-capability', statusGet, {})).toEqual(status);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer simulated-capability' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe('{"method":"status.get","params":{}}');
    fetcher.mockResolvedValue(new Response('{"code":"unavailable","message":"simulated"}', { status: 503 }));
    await expect(invokeMethod('http://127.0.0.1:1234', 'simulated-capability', statusGet, {})).rejects.toEqual({ code: 'unavailable', message: 'simulated' });
    fetcher.mockResolvedValue(new Response('{"code":"invented","message":"simulated"}', { status: 503 }));
    await expect(invokeMethod('http://127.0.0.1:1234', 'simulated-capability', statusGet, {})).rejects.toThrow();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...status, uptime_ms: 'bad' })));
    await expect(invokeMethod('http://127.0.0.1:1234', 'simulated-capability', statusGet, {})).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(4);
  } finally { vi.unstubAllGlobals(); }
});
