import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { VisualInput } from '@castle-control/contract';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { beaconsCopy } from '../../beacons-copy.js';
import { ConnectedBeacons } from './core.jsx';
import { controls, submitEvent } from './test-controls.jsx';

async function harness(input?: VisualInput) {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async () => ({ visuals: [{
    visual_id: 'synthetic-fire', name: 'Synthetic fire', ...(input ? { input } : {}),
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } },
  }] }));
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  await port.load(); rpc.mockClear();
  return { port, rpc };
}

afterEach(() => vi.unstubAllGlobals());

test('custom burst select defaults to the selected visual\'s input source (channel_points)', async () => {
  const { port } = await harness({ source: 'channel_points', unit: 'points' });
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  const select = html.match(/<select[^>]*name="source"[\s\S]*?<\/select>/)?.[0];
  expect(select).toContain('value="channel_points" selected=""');
});

test('a gift quick fire on a channel_points visual renders a status naming the route and saying live gifts will not move it', async () => {
  const { port, rpc } = await harness({ source: 'channel_points', unit: 'points' });
  function Probe() {
    const tree = ConnectedBeacons({ port });
    const button = controls(tree).find(item => item.children === beaconsCopy.fire_gifts || item.children === 'Simulate 50 gift subs');
    if (!button?.onClick) throw new Error('Missing gift quick fire');
    button.onClick(); return tree;
  }
  const html = renderToStaticMarkup(<Probe />);
  expect(html).toMatch(/role="status"[^>]*>[^<]*channel points[^<]*live gifts will not move/);
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  expect(rpc).not.toHaveBeenCalled();
});

test('an unrouted visual\'s test-fire bay says live contributions never reach it', async () => {
  const { port } = await harness();
  expect(renderToStaticMarkup(<ConnectedBeacons port={port} />)).toMatch(/role="status"[^>]*>[^<]*live contributions never reach/);
});

test('the 50-gift quick button text equals beaconsCopy.fire_gifts', async () => {
  const { port } = await harness({ source: 'gift', unit: 'count' });
  expect(renderToStaticMarkup(<ConnectedBeacons port={port} />)).toContain(`>${beaconsCopy.fire_gifts}</button>`);
});

test('off-route custom bursts send no simulation to the core or OBS', async () => {
  const { port, rpc } = await harness({ source: 'cheer', unit: 'bits' });
  const NativeFormData = globalThis.FormData;
  vi.stubGlobal('FormData', class extends NativeFormData {
    constructor() { super(); this.set('source', 'gift'); this.set('amount', '50'); }
  });
  function Probe() {
    const tree = ConnectedBeacons({ port });
    const form = controls(tree).find(item => item.onSubmit);
    if (!form?.onSubmit) throw new Error('Missing burst form');
    void form.onSubmit(submitEvent()); return tree;
  }
  renderToStaticMarkup(<Probe />);
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  expect(rpc).not.toHaveBeenCalled();
});

test('Amount uses a standalone label whose htmlFor matches the input id', async () => {
  const { port } = await harness({ source: 'gift', unit: 'count' });
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  const id = html.match(/<label for="([^"]+)">Amount \(source units\)<\/label>/)?.[1];
  expect(id).toBeDefined();
  const input = html.match(/<input[^>]*name="amount"[^>]*>/)?.[0];
  expect(input).toContain(`id="${id}"`);
  expect(html.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1);
});

test.each(['gift', 'subscribe', 'cheer'] as const)('matching %s quick or custom fire reaches the unchanged core wire once', async source => {
  const input = source === 'cheer' ? { source, unit: 'bits' } as const : { source, unit: 'count' } as const;
  const { port, rpc } = await harness(input);
  rpc.mockResolvedValue({ label: 'simulated', intensity: { visual_id: 'synthetic-fire', intensity: 0.5 } });
  const NativeFormData = globalThis.FormData;
  vi.stubGlobal('FormData', class extends NativeFormData {
    constructor() { super(); this.set('source', source); this.set('amount', '20'); }
  });
  function Probe() {
    const tree = ConnectedBeacons({ port });
    const all = controls(tree);
    if (source === 'cheer') void all.find(item => item.onSubmit)?.onSubmit?.(submitEvent());
    else all.find(item => item.children === (source === 'gift' ? beaconsCopy.fire_gifts : beaconsCopy.fire_sub))?.onClick?.();
    return tree;
  }
  renderToStaticMarkup(<Probe />);
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  expect(port.getSnapshot().phase).toBe('ready');
  expect(rpc).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.any(String), 'beacons.simulate', {
    visual_id: 'synthetic-fire', burst: { source, amount: source === 'gift' ? 50 : source === 'subscribe' ? 1 : 20 },
  });
});

test('changing the selected visual resets the custom burst source to its own route', async () => {
  const { port, rpc } = await harness({ source: 'channel_points', unit: 'points' });
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Missing synthetic visual');
  rpc.mockImplementation(async (_endpoint, _session, _method, params) => 'visual' in params ? params.visual : undefined);
  await port.upsert({ visual: { ...visual, visual_id: 'synthetic-cheer' as typeof visual.visual_id,
    input: { source: 'cheer', unit: 'bits' } } });
  for (const [id, source] of [[visual.visual_id, 'channel_points'], ['synthetic-cheer', 'cheer']] as const) {
    port.select(id as typeof visual.visual_id);
    const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
    expect(html.match(/<select[^>]*name="source"[\s\S]*?<\/select>/)?.[0]).toContain(`value="${source}" selected=""`);
  }
});
