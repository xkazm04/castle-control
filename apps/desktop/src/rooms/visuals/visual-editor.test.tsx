import type { FormEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { ContributionSource, VisualInput } from '@castle-control/contract';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { fixtureVisuals } from '../../beacons-fixture.js';
import { ConnectedBeacons } from './core.jsx';
import { VisualsWork } from './room.jsx';
import { VisualEditor, VisualForm } from './visual-editor.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
const synthetic = { visual_id: 'synthetic-picker', name: 'Synthetic visual', design_id: 'synthetic-design',
  curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } } as const;

async function harness(input?: VisualInput) {
  const fixture = { ...synthetic, ...(input ? { input } : {}) };
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method, params) =>
    method === 'beacons.visual.list' ? { visuals: [fixture] } : 'visual' in params ? params.visual : undefined);
  const port = createCoreBeaconsPort(launch, { rpc });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Missing synthetic visual');
  return { port, rpc, visual };
}

afterEach(() => vi.unstubAllGlobals());

// Node has FormData but no DOM form. Populate native FormData with the values
// the browser would collect; the real form handler and real port/schema run.
function formData(source: ContributionSource | '', name: string = synthetic.name) {
  const NativeFormData = globalThis.FormData;
  vi.stubGlobal('FormData', class extends NativeFormData {
    constructor() {
      super();
      this.set('visual_id', synthetic.visual_id); this.set('name', name);
      this.set('design_id', synthetic.design_id); this.set('input_source', source);
    }
  });
}

async function save(h: Awaited<ReturnType<typeof harness>>, source: ContributionSource | '', name?: string) {
  formData(source, name);
  const form = VisualForm({ visual: h.visual, port: h.port, busy: false, source, on_source: () => undefined });
  const preventDefault = vi.fn();
  const nativeEvent = new Event('submit', { bubbles: true, cancelable: true });
  const target = {} as HTMLFormElement;
  const event: FormEvent<HTMLFormElement> = { currentTarget: target, target, nativeEvent, preventDefault,
    bubbles: true, cancelable: true, defaultPrevented: false, eventPhase: nativeEvent.eventPhase,
    isTrusted: false, timeStamp: nativeEvent.timeStamp, type: 'submit', stopPropagation: () => nativeEvent.stopPropagation(),
    persist: () => undefined, isDefaultPrevented: () => nativeEvent.defaultPrevented, isPropagationStopped: () => nativeEvent.cancelBubble };
  form.props.onSubmit(event);
  expect(preventDefault).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(h.port.getSnapshot().busy).toBe(false));
  expect(h.port.getSnapshot().phase).toBe('ready');
}

test('choosing gift saves its native count pair through the contract and core transport', async () => {
  const h = await harness();
  await save(h, 'gift');
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.visual.upsert', {
    visual: { ...h.visual, input: { source: 'gift', unit: 'count' } },
  });
  expect(h.port.getSnapshot().visuals[0]?.input).toEqual({ source: 'gift', unit: 'count' });
});

test('Not routed omits input entirely when removing an existing route', async () => {
  const h = await harness({ source: 'gift', unit: 'count' });
  await save(h, '');
  const saved = h.port.getSnapshot().visuals[0];
  expect(saved).not.toHaveProperty('input');
  expect(saved).toEqual(synthetic);
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.visual.upsert', { visual: synthetic });
});

test('editing a name preserves the initial input, design_id and curve', async () => {
  const h = await harness({ source: 'hype_train', unit: 'level' });
  const html = renderToStaticMarkup(<VisualEditor visual={h.visual} port={h.port} busy={false} />);
  expect(html).toContain('value="hype_train" selected=""');
  expect(html).toContain('>level</output>');
  await save(h, h.visual.input?.source ?? '', 'Renamed visual');
  expect(h.port.getSnapshot().visuals[0]).toEqual({ ...h.visual, name: 'Renamed visual' });
});

test('legacy and new visual editors begin with Not routed and no native unit', async () => {
  const h = await harness();
  for (const visual of [h.visual, undefined]) {
    const html = renderToStaticMarkup(<VisualEditor {...(visual ? { visual } : {})} port={h.port} busy={false} />);
    expect(html).toContain('<option value="" selected="">Not routed</option>');
    expect(html).toContain('>Not routed</output>');
  }
  await save(h, '');
  expect(h.port.getSnapshot().visuals[0]).not.toHaveProperty('input');
});

test('core detail shows the selected source and unit, or Not routed', async () => {
  const h = await harness({ source: 'gift', unit: 'count' });
  expect(renderToStaticMarkup(<ConnectedBeacons port={h.port} />)).toContain('Driven by: gift subscriptions (count)');
  const legacy = await harness();
  expect(renderToStaticMarkup(<ConnectedBeacons port={legacy.port} />)).toContain('Driven by: Not routed');
});

test('fixture picker has sensible inputs, edits locally, and keeps simulated accounting independent', () => {
  expect(fixtureVisuals.map(visual => visual.input)).toEqual([
    { source: 'channel_points', unit: 'points' }, { source: 'gift', unit: 'count' }, { source: 'hype_train', unit: 'level' },
  ]);
  const port = createBeaconsPreview();
  const initial = port.getSnapshot();
  const first = initial.visuals[0];
  if (!first) throw new Error('Missing simulated visual');
  let html = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(html).toContain('value="channel_points" selected=""');
  // C prints driver and decay as kit chips; the native unit stays in the picker.
  expect(html).toMatch(/data-variant="or"[^>]*>Hype Train level<\/span>/);
  port.input('gift');
  const edited = port.getSnapshot();
  expect(edited.visuals[0]?.visual).toEqual({ ...first.visual, input: { source: 'gift', unit: 'count' } });
  expect(edited.visuals[0]?.total).toBe(first.total);
  expect(edited.visuals[1]).toBe(initial.visuals[1]);
  expect(edited.events).toBe(initial.events);
  html = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(html).toContain('value="gift" selected=""');
  expect(html).toContain('Simulated configuration');
  expect(html).toContain('live routing is a separate core step');
  port.input('');
  expect(port.getSnapshot().visuals[0]?.visual).not.toHaveProperty('input');
  expect(fixtureVisuals[0]?.input).toEqual({ source: 'channel_points', unit: 'points' });
});
