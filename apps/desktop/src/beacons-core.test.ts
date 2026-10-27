import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { createCoreBeaconsPort } from './beacons-core.js';
import type { BeaconsNetwork } from './beacons-core.js';
import { createDesktopClient, coreBeaconsConnection } from './client.js';
import { ConnectedBeacons } from './rooms/visuals/core.jsx';
import Room from './shell/room.jsx';
import type { VisualId } from '@castle-control/contract';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
// Generated synthetic configuration, unrelated to any channel or viewer.
const visual = { visual_id: 'synthetic-frame', name: 'Core configured frame', design_id: 'synthetic-design',
  curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } } as const;
function harness() {
  const responses = new Map<string, unknown>([
    ['beacons.visual.list', { visuals: [visual] }], ['beacons.visual.upsert', visual], ['beacons.curve.set', visual],
    ['beacons.simulate', { label: 'simulated', intensity: { visual_id: visual.visual_id, intensity: 0.75 } }],
  ]);
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method) => structuredClone(responses.get(method)));
  return { port: createCoreBeaconsPort(launch, { rpc }), rpc, responses };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.doUnmock('@castle-control/contract/beacons'); });

test('list round trip replaces the core visual list, including an empty list, and freezes snapshots', async () => {
  const h = harness();
  const listener = vi.fn(); const stop = h.port.subscribe(listener);
  await h.port.load();
  expect(h.rpc).toHaveBeenCalledWith(launch.endpoint, launch.session_token, 'beacons.visual.list', {});
  expect(h.port.getSnapshot().visuals).toEqual([visual]);
  expect(Object.isFrozen(h.port.getSnapshot().visuals[0]?.curve.ranges)).toBe(true);
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain(launch.session_token);
  expect(listener).toHaveBeenCalled(); stop(); listener.mockClear();
  h.responses.set('beacons.visual.list', { visuals: [] }); await h.port.load();
  expect(h.port.getSnapshot().visuals).toEqual([]); expect(h.port.getSnapshot().selected).toBeUndefined();
  expect(listener).not.toHaveBeenCalled();
});

test('upsert round trip and curve.set publish only core-confirmed configurations', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals[0]; if (!saved) throw new Error('Expected core visual');
  const renamed = { ...saved, name: 'Saved core visual' };
  h.responses.set('beacons.visual.upsert', renamed);
  await h.port.upsert({ visual: renamed });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.visual.upsert', { visual: renamed });
  expect(h.port.getSnapshot().visuals).toEqual([renamed]);
  const curve = { ...saved.curve, decay: { kind: 'exponential', half_life_s: 120 } } as const;
  h.responses.set('beacons.curve.set', { ...renamed, curve });
  await h.port.setCurve({ visual_id: saved.visual_id, curve });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.curve.set', { visual_id: saved.visual_id, curve });
  expect(h.port.getSnapshot().visuals[0]?.curve).toEqual(curve);
});

test('simulate renders the core fraction with its simulated label, without changing saved configuration', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals[0]; if (!saved) throw new Error('Expected core visual');
  await h.port.simulate({ visual_id: saved.visual_id, burst: { source: 'gift', amount: 50 } });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.simulate', {
    visual_id: saved.visual_id, burst: { source: 'gift', amount: 50 },
  });
  expect(h.port.getSnapshot().simulation?.intensity.intensity).toBe(0.75);
  expect(h.port.getSnapshot().visuals[0]).toBe(saved);
  const html = renderToStaticMarkup(createElement(ConnectedBeacons, { port: h.port }));
  expect(html).toContain('Core configured frame'); expect(html).toContain('75%'); expect(html).toContain('simulated');
  expect(html).not.toContain('Offering altar'); expect(html).not.toContain('60 offerings');
});

test('600 successful core simulations retain labelled feed rows without creating live accounting', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals;
  expect(h.port.getSnapshot().events).toEqual([]);
  const sources = ['cheer', 'bits_use', 'subscribe', 'gift', 'resub', 'hype_train', 'channel_points'] as const;
  for (let index = 0; index < 600; index++) {
    const source = sources[index % sources.length];
    if (!source) throw new Error('Expected synthetic source');
    await h.port.simulate({ visual_id: visual.visual_id as VisualId, burst: { source, amount: index + 1 } });
  }
  const events = h.port.getSnapshot().events;
  expect(events).toHaveLength(600);
  expect(new Set(events.map(event => event.id)).size).toBe(600);
  expect(events.every(event => event.label === 'simulated' && event.visual_id === visual.visual_id)).toBe(true);
  expect(events[0]?.burst.amount).toBe(600);
  expect(events[599]?.burst.amount).toBe(1);
  expect(new Set(events.map(event => event.burst.source))).toEqual(new Set(sources));
  expect(events.every(event => new Date(event.at).toISOString() === event.at)).toBe(true);
  expect(Object.isFrozen(events[0]?.burst)).toBe(true);
  expect(h.port.getSnapshot().visuals).toBe(saved);
  const html = renderToStaticMarkup(createElement(ConnectedBeacons, { port: h.port }));
  expect(html).toContain('aria-rowcount="600"');
  expect(html.match(/data-contribution-row=/g)?.length).toBeLessThan(20);
  expect(html).toContain('simulated · Core simulation');
  expect(html).toContain('data-contribution-row="simulated-core-event-599"');
  expect(html).not.toContain('data-contribution-row="simulated-core-event-0"');
  await h.port.load();
  expect(h.port.getSnapshot().events).toBe(events);
  const fresh = harness();
  expect(fresh.port.getSnapshot().events).toEqual([]);
});

test('failed or mismatched simulations never enter the contribution feed', async () => {
  const h = harness();
  const params = { visual_id: visual.visual_id as VisualId, burst: { source: 'gift', amount: 50 } } as const;
  await h.port.simulate(params);
  const events = h.port.getSnapshot().events;
  h.responses.set('beacons.simulate', { label: 'simulated', intensity: { visual_id: 'wrong-visual', intensity: 0.5 } });
  await h.port.simulate(params);
  expect(h.port.getSnapshot().events).toBe(events);
  h.rpc.mockRejectedValueOnce(new Error('Lost response'));
  await h.port.simulate(params);
  expect(h.port.getSnapshot().events).toBe(events);
  await h.port.simulate({ ...params, burst: { source: 'gift', amount: -1 } });
  expect(h.port.getSnapshot().events).toBe(events);
});

test('malformed responses and mismatched visual IDs are rejected; typed errors hide upstream prose', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals[0]; if (!saved) throw new Error('Expected core visual');
  h.responses.set('beacons.simulate', { label: 'simulated', intensity: { visual_id: saved.visual_id, intensity: 2 } });
  await h.port.simulate({ visual_id: saved.visual_id, burst: { source: 'gift', amount: 50 } });
  expect(h.port.getSnapshot().phase).toBe('error'); expect(h.port.getSnapshot().simulation).toBeUndefined();
  expect(h.port.getSnapshot().events).toEqual([]);
  h.responses.set('beacons.visual.upsert', { ...visual, visual_id: 'different-visual' });
  await h.port.upsert({ visual: saved }); expect(h.port.getSnapshot().visuals).toEqual([saved]);
  expect(h.port.getSnapshot().phase).toBe('error');
  h.rpc.mockRejectedValueOnce({ code: 'rate_limited', message: 'Private upstream prose', retry_after_ms: 2000 });
  await h.port.load();
  expect(h.port.getSnapshot().error?.code).toBe('rate_limited');
  expect(h.port.getSnapshot().notice).toContain('2000');
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain('Private upstream prose');
  h.responses.set('beacons.visual.list', { visuals: [{ ...visual, extra: true }] }); await h.port.load();
  expect(h.port.getSnapshot().phase).toBe('error'); expect(h.port.getSnapshot().visuals).toEqual([]);
});

test('invalid parameters never cross the transport and mutations are not retried', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals[0]; if (!saved) throw new Error('Expected core visual');
  h.rpc.mockClear();
  await h.port.simulate({ visual_id: saved.visual_id, burst: { source: 'gift', amount: -1 } });
  expect(h.rpc).not.toHaveBeenCalled();
  h.rpc.mockRejectedValueOnce(new Error('Lost response'));
  await h.port.upsert({ visual: saved }); expect(h.rpc).toHaveBeenCalledTimes(1);
  expect(h.port.getSnapshot().busy).toBe(false); expect(h.port.getSnapshot().phase).toBe('error');
});

test('core shell route renders the connected visuals from its persistent per-client port', async () => {
  const h = harness(); await h.port.load();
  const client = createDesktopClient(launch);
  const snapshot = client.getSnapshot(); const connection = coreBeaconsConnection(snapshot);
  if (!connection) throw new Error('Missing core connection');
  connection.port = h.port;
  expect(coreBeaconsConnection(client.getSnapshot())).toBe(connection);
  const stream = await renderToReadableStream(createElement(Room, { chamber: 'visuals', replay: false, snapshot,
    origin: 'keep', on_open: vi.fn(), on_back: vi.fn() }));
  await stream.allReady; const html = await new Response(stream).text();
  expect(html).toContain('Core configured frame'); expect(html).toContain('Core Beacons');
  expect(html).not.toContain('Offering altar'); expect(html).not.toContain('data-offering-mark');
  expect(coreBeaconsConnection(createDesktopClient({ mode: 'fixture' }).getSnapshot())).toBeUndefined();
});

test('production HTTP transport sends the existing method and parses the response through the contract door', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ visuals: [visual] })));
  vi.stubGlobal('fetch', fetch);
  const port = createCoreBeaconsPort(launch);
  await port.load();
  expect(fetch).toHaveBeenCalledWith(new URL('/rpc', launch.endpoint), expect.objectContaining({
    method: 'POST', body: JSON.stringify({ method: 'beacons.visual.list', params: {} }),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${launch.session_token}` },
  }));
  expect(port.getSnapshot().visuals).toEqual([visual]);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'unavailable', message: 'Private detail' }), { status: 503 }));
  await port.load(); expect(port.getSnapshot().phase).toBe('error');
  expect(port.getSnapshot().error?.code).toBe('unavailable');
  expect(port.getSnapshot().notice).not.toContain('Private detail');
});

test('sourceUrl validates its round trip and never exposes a URL in read snapshots', async () => {
  const h = harness();
  const visual_id = visual.visual_id as VisualId;
  const result = { url: `http://localhost:4312/beacons/${visual_id}` };
  h.responses.set('beacons.source.url', result);
  expect(await h.port.sourceUrl(visual_id)).toEqual(result);
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith(launch.endpoint, launch.session_token, 'beacons.source.url', { visual_id });
  expect(h.port.getSnapshot().phase).toBe('ready');
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain(result.url);
  h.rpc.mockClear();
  await h.port.sourceUrl('Bad Id' as VisualId);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.port.getSnapshot().phase).toBe('error');
});

test.each([{ intensity: 0.5 }, { url: null }, { url: 'http://example.com:4312/beacons/synthetic-frame' },
  { url: 'http://localhost.evil:4312/' }, { url: 'http://localhost:4312/', extra: true }])(
  'sourceUrl rejects malformed, mismatched and non-loopback results: %j', async result => {
    const h = harness(); h.responses.set('beacons.source.url', result);
    expect(await h.port.sourceUrl(visual.visual_id as VisualId)).toBeUndefined();
    expect(h.port.getSnapshot().phase).toBe('error');
    expect(h.port.getSnapshot().busy).toBe(false);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  },
);

test.each(['unavailable', 'not_found', 'rate_limited'] as const)('sourceUrl preserves safe %s codes without retries or upstream prose', async code => {
  const h = harness();
  h.rpc.mockRejectedValueOnce({ code, message: 'Private source error', detail: { url: 'http://private.example/' }, retry_after_ms: 2000 });
  expect(await h.port.sourceUrl(visual.visual_id as VisualId)).toBeUndefined();
  expect(h.port.getSnapshot().error).toEqual({ code, message: 'Beacons request failed.', retry_after_ms: 2000 });
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain('Private');
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain('private.example');
  expect(h.rpc).toHaveBeenCalledTimes(1);
});

test('sourceUrl blocks duplicate and other requests while a reply is pending', async () => {
  let resolve: (value: unknown) => void = () => { throw new Error('Expected pending call'); };
  const rpc = vi.fn<BeaconsNetwork['rpc']>(() => new Promise(done => { resolve = done; }));
  const port = createCoreBeaconsPort(launch, { rpc });
  const pending = port.sourceUrl(visual.visual_id as VisualId);
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(port.getSnapshot().busy).toBe(true);
  expect(await port.sourceUrl(visual.visual_id as VisualId)).toBeUndefined();
  await port.load();
  expect(rpc).toHaveBeenCalledTimes(1);
  const result = { url: 'http://localhost:4312/beacons/synthetic-frame' };
  resolve(result); expect(await pending).toEqual(result);
  expect(port.getSnapshot().busy).toBe(false);
});

test('sourceUrl production HTTP uses the same validated method door', async () => {
  const result = { url: 'http://localhost:4312/beacons/synthetic-frame' };
  const fetch = vi.fn(async () => new Response(JSON.stringify(result)));
  vi.stubGlobal('fetch', fetch);
  expect(await createCoreBeaconsPort(launch).sourceUrl(visual.visual_id as VisualId)).toEqual(result);
  expect(fetch).toHaveBeenCalledWith(new URL('/rpc', launch.endpoint), expect.objectContaining({
    body: JSON.stringify({ method: 'beacons.source.url', params: { visual_id: visual.visual_id } }),
  }));
});

// Keep this isolated module-cache probe last: resetting modules also resets client WeakMaps.
test('validators remain unloaded until the first port call', async () => {
  vi.resetModules();
  const loaded = vi.fn();
  vi.doMock('@castle-control/contract/beacons', async importOriginal => { loaded(); return importOriginal(); });
  const { createCoreBeaconsPort: createPort } = await import('./beacons-core.js');
  const port = createPort(launch, { rpc: async () => ({ url: 'http://localhost:4312/beacons/synthetic-frame' }) });
  port.getSnapshot(); port.subscribe(() => undefined)();
  expect(loaded).not.toHaveBeenCalled();
  await port.sourceUrl(visual.visual_id as VisualId);
  expect(loaded).toHaveBeenCalledTimes(1); expect(port.getSnapshot().phase).toBe('ready');
});
