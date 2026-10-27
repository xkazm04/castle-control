import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { createCoreBeaconsPort } from './beacons-core.js';
import type { BeaconsNetwork } from './beacons-core.js';
import { createDesktopClient, coreBeaconsConnection } from './client.js';
import { ConnectedBeacons } from './rooms/visuals/core.jsx';
import Room from './shell/room.jsx';

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

test('malformed responses and mismatched visual IDs are rejected; typed errors hide upstream prose', async () => {
  const h = harness(); await h.port.load();
  const saved = h.port.getSnapshot().visuals[0]; if (!saved) throw new Error('Expected core visual');
  h.responses.set('beacons.simulate', { label: 'simulated', intensity: { visual_id: saved.visual_id, intensity: 2 } });
  await h.port.simulate({ visual_id: saved.visual_id, burst: { source: 'gift', amount: 50 } });
  expect(h.port.getSnapshot().phase).toBe('error'); expect(h.port.getSnapshot().simulation).toBeUndefined();
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

// Keep this isolated module-cache probe last: resetting modules also resets client WeakMaps.
test('validators remain unloaded until the first port call', async () => {
  vi.resetModules();
  const loaded = vi.fn();
  vi.doMock('@castle-control/contract/beacons', async importOriginal => { loaded(); return importOriginal(); });
  const { createCoreBeaconsPort: createPort } = await import('./beacons-core.js');
  const port = createPort(launch, { rpc: async () => ({ visuals: [] }) });
  port.getSnapshot(); port.subscribe(() => undefined)();
  expect(loaded).not.toHaveBeenCalled();
  await port.load(); expect(loaded).toHaveBeenCalledTimes(1); expect(port.getSnapshot().phase).toBe('ready');
});
