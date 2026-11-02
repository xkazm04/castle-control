import { readFileSync } from 'node:fs';
import { invoke, maproomStageGet, parseMethodResult } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';
import type { DuelEvent } from '@castle-control/duel';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { coreTiltyardConnection, createDesktopClient } from '../../client.js';
import { simulatedRead } from '../../simulated.js';
import Room from './room.jsx';
import { coreTurn, createTiltyardCore } from './tiltyard-core.js';
import type { TiltyardNetwork } from './tiltyard-core.js';
import { sampleTournament, TiltyardCoreNotice } from './tiltyard-core-view.jsx';
import { DuelSourceAction } from './tiltyard-source.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
const at = '2026-11-01T12:00:00Z';
const empty = { at };
const fixture = parseJson(readFileSync(new URL('../../../../../crates/cc-types/tests/fixtures/tiltyard.json', import.meta.url), 'utf8'));
if (!fixture || typeof fixture !== 'object' || !('stages' in fixture) || !Array.isArray(fixture.stages)
  || !('simulated' in fixture) || fixture.simulated !== true) throw new Error('Missing SIMULATED stages');
const stages = fixture.stages.map((value: unknown) => parseMethodResult(maproomStageGet, JSON.stringify(value)));
const live = stages.find(stage => stage.session?.phase === 'live');
const closed = stages.find(stage => stage.session?.phase === 'verdict');
if (!live?.session || !closed?.session) throw new Error('Missing generated live and closed stages');
const counted = parseMethodResult(maproomStageGet, JSON.stringify({ ...live,
  session: { ...live.session, counted: { left: 6, right: 3 }, simulated: true } }));
const cleanup: (() => void)[] = [];
class TestSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
}
afterEach(() => {
  for (const stop of cleanup.splice(0).reverse()) stop();
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});
const flush = () => vi.advanceTimersByTimeAsync(0);
function harness() {
  vi.useFakeTimers();
  const sockets: TestSocket[] = [];
  const socket = vi.fn(() => { const next = new TestSocket(); sockets.push(next); return next; });
  const rpc = vi.fn<TiltyardNetwork['rpc']>(async () => empty);
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify(
    String(init?.body).includes('"status.get"') ? { ...simulatedRead(1).status, simulated: false } : { state: 'connected' },
  ))));
  const client = createDesktopClient(launch, { socket, rpc: invoke }, undefined, undefined, undefined, { rpc });
  cleanup.push(client.start());
  const connection = coreTiltyardConnection(client.getSnapshot());
  if (!connection) throw new Error('Missing test connection');
  const model = createTiltyardCore(connection);
  cleanup.push(model.start());
  let seq = 0;
  const emit = (kind: string) => sockets.at(-1)?.onmessage?.(new MessageEvent('message', {
    data: JSON.stringify({ seq: ++seq, at, kind }),
  }));
  return { client, connection, model, sockets, socket, rpc, emit };
}

test('core room opens on the empty duel stage with Steward and sample starts, source action and the seal', async () => {
  const h = harness();
  const stream = await renderToReadableStream(<Room snapshot={h.client.getSnapshot()} seal_slot={<p>Shared seal slot</p>} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('aria-label="The duel stage"');
  expect(html).toContain('No duel on the core yet');
  expect(html).toContain('Start a duel…'); expect(html).toContain('Start sample tournament');
  expect(html).toContain('The sample uses SAMPLE starter contestants. Showdown and Ladder under More are local demos.');
  expect(html).toContain('Show the duel on stream'); expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('Shared seal slot');
  expect(html).not.toContain('data-hex-tile='); expect(html).not.toContain('data-role="ty-ticker"');
  expect(h.socket).toHaveBeenCalledTimes(1);
});

test('load and maproom.turn/resync refetch the stage; idle chat events do not cause reads', async () => {
  const h = harness(); await flush();
  expect(h.rpc.mock.calls.map(call => call.slice(2))).toEqual([['maproom.stage.get', {}]]);
  h.emit('chat.message'); h.emit('gatehouse.verdict'); await flush();
  expect(h.rpc).toHaveBeenCalledTimes(1);
  h.rpc.mockResolvedValue({ at: '2026-11-01T12:00:01Z' });
  h.emit('maproom.turn'); await flush();
  expect(h.model.getSnapshot().stage?.at).toBe('2026-11-01T12:00:01Z');
  h.emit('resync'); await flush();
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(Array(3).fill('maproom.stage.get'));
  expect(h.socket).toHaveBeenCalledTimes(1);
});

test('live counts refresh from the core on post-moderation events and polling even without maproom.turn', async () => {
  const h = harness(); await flush(); h.rpc.mockResolvedValue(live); await h.model.refresh();
  h.rpc.mockClear(); h.rpc.mockResolvedValue(counted);
  h.emit('chat.message'); await flush();
  expect(h.rpc).not.toHaveBeenCalled();
  h.emit('gatehouse.verdict'); await flush();
  expect(h.rpc.mock.calls.map(call => call.slice(2))).toEqual([['maproom.stage.get', {}]]);
  expect(h.model.getSnapshot().stage?.session?.counted).toEqual({ left: 6, right: 3 });
  h.rpc.mockResolvedValue(live);
  await vi.advanceTimersByTimeAsync(999); expect(h.rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(h.rpc).toHaveBeenCalledTimes(2);
  expect(h.model.getSnapshot().stage).toEqual(live);
  h.rpc.mockResolvedValue(closed); h.emit('maproom.turn'); await flush(); h.rpc.mockClear();
  await vi.advanceTimersByTimeAsync(5000); expect(h.rpc).not.toHaveBeenCalled();
});

test('live polling serializes reads and writes, stops on disconnect/unmount, and resumes with reconnect', async () => {
  const h = harness(); await flush(); h.rpc.mockResolvedValue(live); await h.model.refresh();
  let resolve: ((result: unknown) => void) | undefined;
  h.rpc.mockClear(); h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(5000); expect(h.rpc).toHaveBeenCalledTimes(1);
  resolve?.(live); await flush();
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const turn = h.model.run({ kind: 'pick', side: 'right' });
  await vi.advanceTimersByTimeAsync(5000); expect(h.rpc).toHaveBeenCalledTimes(2);
  resolve?.(live); await turn;
  h.sockets[0]?.onclose?.(new Event('close') as CloseEvent); h.rpc.mockClear();
  await vi.advanceTimersByTimeAsync(2000); expect(h.rpc).not.toHaveBeenCalled();
  h.sockets[1]?.onopen?.(new Event('open')); await flush();
  expect(h.rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000); expect(h.rpc).toHaveBeenCalledTimes(2);
  cleanup.pop()?.(); h.rpc.mockClear();
  await vi.advanceTimersByTimeAsync(5000); expect(h.rpc).not.toHaveBeenCalled();
});

const actions: [DuelEvent, object][] = [
  [{ kind: 'pick', side: 0 }, { kind: 'pick', side: 'left' }],
  [{ kind: 'pick', side: 1 }, { kind: 'pick', side: 'right' }],
  ...(['enter', 'cancel', 'undo', 'reset', 'speed'] as const).map(kind => [{ kind }, { kind }] as [DuelEvent, object]),
];
test.each(actions)('human action %j sends exactly the contract turn params', async (event, action) => {
  const h = harness(); await flush(); h.rpc.mockClear();
  await h.model.run(coreTurn(event));
  expect(h.rpc.mock.calls.map(call => call.slice(2))).toEqual([['maproom.turn.run', { action }]]);
  expect(h.model.getSnapshot().stage).toEqual(empty);
});

test('start sends the full contestant list, string seed ranks, key and window; never client totals or provenance', async () => {
  const h = harness(); await flush(); h.rpc.mockClear();
  const action = sampleTournament(); await h.model.run(action);
  expect(h.rpc.mock.calls[0]?.slice(2)).toEqual(['maproom.turn.run', { action }]);
  expect(action.kind).toBe('start');
  if (action.kind !== 'start') throw new Error('Expected start');
  expect(action).toMatchObject({ kind: 'start', key: 'mill', window_ms: 15000,
    list: { title: 'The mill question', items: [
      { id: 'raze-the-mill', seed: '1' }, { id: 'tax-the-miller', seed: '2' },
      { id: 'spare-it', seed: '3' }, { id: 'borrow-the-mill', seed: '4' },
    ] } });
  expect(Object.keys(action).sort()).toEqual(['key', 'kind', 'list', 'window_ms']);
  expect(Object.keys(action.list).sort()).toEqual(['items', 'prompt', 'title']);
  expect(action.list.items.every(item => !('provenance' in item))).toBe(true);
});

test('pending writes leave the picture unchanged, report extra actions, then render only the reply', async () => {
  const h = harness(); await flush();
  let resolve: ((result: unknown) => void) | undefined;
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = h.model.run(coreTurn({ kind: 'pick', side: 1 }));
  expect(h.model.getSnapshot().stage).toEqual(empty);
  await h.model.run({ kind: 'enter' });
  expect(h.model.getSnapshot().error).toContain('try this action again');
  resolve?.({ at: '2026-11-01T12:00:02Z' }); await pending;
  expect(h.model.getSnapshot().stage?.at).toBe('2026-11-01T12:00:02Z');
  expect(h.rpc.mock.calls.filter(call => call[2] === 'maproom.turn.run')).toHaveLength(1);
});

test('invalidations during reads and writes drain after the request, so older reads cannot overwrite a turn', async () => {
  const h = harness(); await flush();
  let resolve: ((result: unknown) => void) | undefined;
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const read = h.model.refresh(); h.emit('maproom.turn'); await flush();
  resolve?.(empty); await read;
  expect(h.rpc).toHaveBeenCalledTimes(3);
  h.rpc.mockClear();
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const turn = h.model.run({ kind: 'enter' }); h.emit('maproom.turn'); await flush();
  expect(h.rpc).toHaveBeenCalledTimes(1);
  resolve?.(empty); await turn;
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['maproom.turn.run', 'maproom.stage.get']);
});

test('core error messages are displayed and escaped, malformed results do not replace the authoritative picture', async () => {
  const h = harness(); await flush();
  h.rpc.mockRejectedValueOnce({ code: 'conflict', message: 'Pause <this> tournament first.' });
  await h.model.run({ kind: 'reset' });
  let html = renderToStaticMarkup(<TiltyardCoreNotice state={h.model.getSnapshot()} />);
  expect(html).toContain('role="alert">Pause &lt;this&gt; tournament first.');
  h.rpc.mockResolvedValueOnce({ at, session: { phase: 'invented' } }); await h.model.refresh();
  expect(h.model.getSnapshot().stage).toEqual(parseMethodResult(maproomStageGet, JSON.stringify(empty)));
  html = renderToStaticMarkup(<TiltyardCoreNotice state={h.model.getSnapshot()} />);
  expect(html).toContain('Duel state unavailable. Refresh to retry.');
});

test('disconnection blocks actions visibly and reconnect refetches without retrying a mutation or opening a second room socket', async () => {
  const h = harness(); await flush(); h.rpc.mockClear();
  h.sockets[0]?.onclose?.(new Event('close') as CloseEvent);
  await h.model.run({ kind: 'enter' });
  expect(h.rpc).not.toHaveBeenCalled();
  const html = renderToStaticMarkup(<TiltyardCoreNotice state={h.model.getSnapshot()} />);
  expect(html).toContain('Core disconnected'); expect(html).toContain('This action was not sent');
  await vi.advanceTimersByTimeAsync(1000);
  h.sockets[1]?.onopen?.(new Event('open')); await flush();
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['maproom.stage.get']);
  expect(h.model.getSnapshot().connected).toBe(true);
  expect(h.socket).toHaveBeenCalledTimes(2);
});

test('late replies after disconnect/unmount cannot publish; reconnect reads the actual outcome', async () => {
  const h = harness(); await flush();
  let resolve: ((result: unknown) => void) | undefined;
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = h.model.run({ kind: 'enter' });
  h.sockets[0]?.onclose?.(new Event('close') as CloseEvent);
  resolve?.({ at: '2026-11-01T12:00:03Z' }); await pending;
  expect(h.model.getSnapshot().stage).toEqual(empty);
  expect(h.model.getSnapshot().error).toContain('outcome is unknown');
  await vi.advanceTimersByTimeAsync(1000); h.sockets[1]?.onopen?.(new Event('open')); await flush();
  h.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const read = h.model.refresh(); cleanup.pop()?.();
  const before = h.model.getSnapshot(); resolve?.({ at: '2026-11-01T12:00:04Z' }); await read;
  expect(h.model.getSnapshot()).toBe(before);
});

test('Duel source copy is core-only, validates the URL and reports clipboard and core failures', async () => {
  const props = { busy: false, on_copy: vi.fn() };
  expect(renderToStaticMarkup(<DuelSourceAction {...props} mode="fixture" />)).toBe('');
  expect(renderToStaticMarkup(<DuelSourceAction {...props} mode="core" />)).toContain('Duel on stream');
  const h = harness(); await flush(); h.rpc.mockClear();
  const url = 'http://localhost:3211/tiltyard/current';
  h.rpc.mockResolvedValue({ url }); const write = vi.fn(async () => undefined);
  await h.model.copySource(write);
  expect(h.rpc.mock.calls[0]?.slice(2)).toEqual(['tiltyard.source.url', {}]); expect(write).toHaveBeenCalledWith(url);
  await h.model.copySource(async () => { throw new Error('simulated clipboard failure'); });
  expect(h.model.getSnapshot().error).toContain('Clipboard unavailable');
  h.rpc.mockResolvedValue({ url: 'https://example.com/' }); write.mockClear(); await h.model.copySource(write);
  expect(write).not.toHaveBeenCalled();
  h.rpc.mockRejectedValue({ code: 'unavailable', message: 'Start a tournament first.' }); await h.model.copySource(write);
  expect(h.model.getSnapshot().error).toBe('Start a tournament first.');
});
