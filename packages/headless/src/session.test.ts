import { afterEach, beforeEach, expect, test } from 'vitest';
import { parseHandoff } from './handoff.ts';
import { openSession, parseLocalArgs, type Session } from './session.ts';
import { TOOLS, UnknownToolError } from './tools.ts';
import { startFakeCore, type FakeCore } from './test/fake-core.ts';

let core: FakeCore;
let session: Session;
const fast = { idleMs: 100, timeoutMs: 3000 };

beforeEach(async () => {
  core = await startFakeCore();
  session = openSession(parseHandoff(JSON.stringify(core.handoff)), { stream: fast });
});
afterEach(async () => {
  await session.close();
  await core.close();
});

test('calls a read tool by either name; results are contract-parsed', async () => {
  const status = await session.call('status_get');
  expect(status).toMatchObject({ ok: true, result: { simulated: true, obs_connected: false } });
  expect(await session.call('obs.status.get', {})).toEqual({ ok: true, result: { connected: false } });
  expect(core.methods).toEqual(['status.get', 'obs.status.get']);
});

test('every RPC row sends its own method literal', async () => {
  const empty = TOOLS.filter(tool => tool.class !== 'local' && tool.inputSchema.required === undefined);
  expect(empty.length).toBeGreaterThan(10);
  for (const tool of empty) await session.call(tool.name, {});
  expect(core.methods).toEqual(empty.map(tool => tool.method));
});

test('arguments failing the params schema never reach the core', async () => {
  const outcome = await session.call('rehearsal_crowd_set', { per_minute: 9000 });
  expect(outcome).toEqual({ ok: false,
    error: { code: 'invalid', message: 'arguments do not match rehearsal.crowd.set params' } });
  expect(await session.call('status_get', { extra: true })).toMatchObject({ ok: false, error: { code: 'invalid' } });
  expect(core.methods).toEqual([]);
});

test('a core error envelope is an outcome, parsed by the contract', async () => {
  expect(await session.call('rehearsal_scenario_run', { scenario: 'vote_round' })).toEqual({
    ok: false, error: { code: 'conflict', message: 'start a rehearsal first' } });
  expect(await session.call('gatehouse_chat_list', { limit: 10 })).toMatchObject({
    ok: false, error: { code: 'unavailable' } });
});

test('a wrong capability is refused by the core', async () => {
  const forged = openSession({ ...core.handoff, token: 'cd'.repeat(32) });
  expect(await forged.call('status_get')).toEqual({ ok: false,
    error: { code: 'unauthorized', message: 'session capability required' } });
  await expect(forged.eventsSince()).rejects.toMatchObject({ code: 'unavailable' });
});

test('armed and unknown tools throw before any request', async () => {
  for (const name of ['auth_twitch_start', 'auth.twitch.start', 'gatehouse.ban.confirm', 'store_purgeAll', 'nope']) {
    await expect(session.call(name)).rejects.toBeInstanceOf(UnknownToolError);
  }
  expect(core.methods).toEqual([]);
});

test('eventsSince reads the /events WebSocket with the subprotocol capability', async () => {
  expect(await session.eventsSince()).toEqual({ events: [], next_seq: 0 });
  await session.call('rehearsal_start');
  await session.call('rehearsal_crowd_set', { per_minute: 120 });
  await session.call('rehearsal_scenario_run', { scenario: 'vote_round' });
  const all = await session.eventsSince();
  expect(all.events.map(event => event.kind)).toEqual(['rehearsal.status', 'rehearsal.status', 'gatehouse.consensus']);
  expect(all.next_seq).toBe(3);
  const later = await session.call('events_since', { since_seq: 2 });
  expect(later).toMatchObject({ ok: true, result: { events: [{ seq: 3, kind: 'gatehouse.consensus' }], next_seq: 3 } });
});

test('overlay.snapshot returns the first contract-parsed push frame', async () => {
  const snapshot = await session.overlaySnapshot('gatehouse');
  expect(snapshot).toMatchObject({ kind: 'gatehouse', simulated: true, snapshot: { directions: [], simulated: true } });
  expect(await session.call('overlay_snapshot', { kind: 'gatehouse' })).toMatchObject({ ok: true });
  expect(await session.call('overlay_snapshot', { kind: 'tiltyard' })).toEqual({ ok: false,
    error: { code: 'unavailable', message: 'tiltyard overlay answered 503' } });
  expect(await session.call('overlay_snapshot', { kind: 'beacons' })).toMatchObject({ ok: false,
    error: { code: 'invalid' } });
});

test('local arguments have one parse door', () => {
  expect(parseLocalArgs('events.since', {})).toEqual({ method: 'events.since', since: 0 });
  expect(parseLocalArgs('events.since', { since_seq: -1 })).toBeUndefined();
  expect(parseLocalArgs('events.since', { since_seq: 1.5 })).toBeUndefined();
  expect(parseLocalArgs('events.since', { other: 1 })).toBeUndefined();
  expect(parseLocalArgs('overlay.snapshot', { kind: 'beacons', visual_id: 'v1' }))
    .toEqual({ method: 'overlay.snapshot', kind: 'beacons', visualId: 'v1' });
  expect(parseLocalArgs('overlay.snapshot', { kind: 'gatehouse', visual_id: 'v1' })).toBeUndefined();
  expect(parseLocalArgs('overlay.snapshot', { kind: 'lots' })).toBeUndefined();
  expect(parseLocalArgs('overlay.snapshot', [])).toBeUndefined();
});

test('a closed session refuses calls and serializes without its capability', async () => {
  expect(JSON.stringify(session)).not.toContain(core.handoff.token);
  await session.close();
  expect(await session.call('status_get')).toEqual({ ok: false,
    error: { code: 'unavailable', message: 'session is closed' } });
});
