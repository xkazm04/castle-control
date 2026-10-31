import { Children, isValidElement, useState } from 'react';
import type { ComponentProps, FormEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { ContributionSource, IntensityCurve, VisualInput } from '@castle-control/contract';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { fixtureVisuals } from '../../beacons-fixture.js';
import { ConnectedBeacons } from './core.jsx';
import { VisualsWork } from './room.jsx';
import { VisualEditor, VisualForm } from './visual-editor.jsx';
import { StylePickerFields } from './style-picker.jsx';
import { presets, styleChoice } from './presets.js';
import { styles } from '../../demo/model.js';
import { controls, submitEvent } from './test-controls.jsx';

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
function formData(source: ContributionSource | '', name: string = synthetic.name, design: string = synthetic.design_id,
  id: string = synthetic.visual_id) {
  const NativeFormData = globalThis.FormData;
  vi.stubGlobal('FormData', class extends NativeFormData {
    constructor() {
      super();
      this.set('visual_id', id); this.set('name', name);
      this.set('design_id', design); this.set('input_source', source);
    }
  });
}

async function save(h: Awaited<ReturnType<typeof harness>>, source: ContributionSource | '', name?: string, design?: string) {
  formData(source, name, design);
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

test('create mode refuses a visual_id already in the core list, shows an inline alert and sends no beacons.visual.upsert', async () => {
  const h = await harness(); h.rpc.mockClear(); formData('');
  function Probe() {
    const [submitted, setSubmitted] = useState(false);
    const editor = VisualEditor({ port: h.port, busy: false });
    const form = VisualForm(editor.props);
    if (!submitted) { void form.props.onSubmit(submitEvent()); setSubmitted(true); }
    return form;
  }
  const html = renderToStaticMarkup(<Probe />);
  await vi.waitFor(() => expect(h.port.getSnapshot().busy).toBe(false));
  expect(h.rpc).not.toHaveBeenCalled();
  expect(html).toMatch(/role="alert"[^>]*>[^<]*already exists/);
  expect(h.port.getSnapshot().visuals).toEqual([h.visual]);
});

type EditorControl = ComponentProps<typeof VisualEditor>;
function editorControl(tree: ReactNode): EditorControl {
  const found: EditorControl[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === VisualEditor) found.push(child.props as EditorControl);
      else visit(child.props.children);
    });
  }
  visit(tree);
  const editor = found[0];
  if (!editor) throw new Error('Missing visual editor');
  return editor;
}

test('after a confirmed create, ConnectedBeacons shows Edit visual configuration for the new visual and its saved curve is resent on the next Save', async () => {
  const h = await harness(); formData('gift', 'New synthetic visual', '', 'synthetic-created');
  const on_saved = vi.fn();
  const form = VisualForm({ port: h.port, busy: false, source: 'gift', on_source: vi.fn(), on_saved });
  await form.props.onSubmit(submitEvent());
  await vi.waitFor(() => expect(h.port.getSnapshot().busy).toBe(false));
  expect(on_saved).toHaveBeenCalledOnce();
  const created = h.port.getSnapshot().visuals.find(item => item.visual_id === 'synthetic-created');
  if (!created) throw new Error('Missing confirmed created visual');
  let props: EditorControl | undefined;
  function Probe() {
    const [step, setStep] = useState(0);
    const tree = ConnectedBeacons({ port: h.port }); props = editorControl(tree);
    if (step === 0) { controls(tree).find(item => item.children === 'New visual')?.onClick?.(); setStep(1); }
    if (step === 1) { expect(props.visual).toBeUndefined(); expect(props.on_saved).toBeDefined(); props.on_saved?.(); setStep(2); }
    return tree;
  }
  expect(renderToStaticMarkup(<Probe />)).toContain('Edit visual configuration');
  expect(props?.visual).toEqual(created);
  const curve: IntensityCurve = { ranges: [{ total: 0, intensity: 0 }, { total: 25, intensity: 0.4 }, { total: 200, intensity: 1 }],
    decay: { kind: 'exponential', half_life_s: 100 } };
  h.rpc.mockImplementation(async (_endpoint, _session, method, params) => method === 'beacons.curve.set'
    ? { ...created, curve } : 'visual' in params ? params.visual : undefined);
  await h.port.setCurve({ visual_id: created.visual_id, curve });
  const saved = h.port.getSnapshot().visuals.find(item => item.visual_id === created.visual_id);
  if (!saved) throw new Error('Missing saved curve');
  formData('gift', 'Renamed created visual', '', created.visual_id);
  const edit = VisualForm({ visual: saved, port: h.port, busy: false, source: 'gift', on_source: vi.fn() });
  await edit.props.onSubmit(submitEvent());
  await vi.waitFor(() => expect(h.port.getSnapshot().busy).toBe(false));
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.visual.upsert', {
    visual: { ...saved, name: 'Renamed created visual' },
  });
});

test('a failed create keeps the editor in create mode and never reports a saved visual', async () => {
  const h = await harness(); formData('gift', 'New synthetic visual', '', 'synthetic-created');
  h.rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'Simulated failure' });
  const on_saved = vi.fn();
  const form = VisualForm({ port: h.port, busy: false, source: 'gift', on_source: vi.fn(), on_saved });
  await form.props.onSubmit(submitEvent());
  expect(h.port.getSnapshot().phase).toBe('error');
  expect(h.port.getSnapshot().visuals).toEqual([h.visual]);
  expect(on_saved).not.toHaveBeenCalled();
});

test('New visual after a confirmed create opens a blank editor again', async () => {
  const h = await harness();
  function Probe() {
    const [step, setStep] = useState(0);
    const tree = ConnectedBeacons({ port: h.port });
    const editor = editorControl(tree);
    if (step === 0 || step === 2) { controls(tree).find(item => item.children === 'New visual')?.onClick?.(); setStep(step + 1); }
    if (step === 1) { editor.on_saved?.(); setStep(2); }
    return tree;
  }
  const html = renderToStaticMarkup(<Probe />);
  expect(html).toContain('Create a visual');
  expect(html).toContain('name="visual_id" value=""');
  expect(html).toContain('name="name" value=""');
});

test('visual form offers neutral, twelve atlas designs, custom ID, and one saved art-style control', async () => {
  const h = await harness();
  const html = renderToStaticMarkup(<VisualEditor visual={h.visual} port={h.port} busy={false} />);
  expect(html).toContain('No design (neutral)');
  expect(html).toContain('Custom design ID...');
  expect(html.match(/id="beacon-art-style"/g)).toHaveLength(1);
  expect(presets).toHaveLength(12);
  for (const style of styles) for (const kind of ['altar', 'frame']) {
    expect(html).toContain(`value="preset-${style.id}-${kind}"`);
    expect(html).toContain(`${style.label} ${kind}`);
  }
  expect(html).toContain('name="design_id" value="synthetic-design"');
  expect(styleChoice(h.visual.design_id)).toBe('custom');
});

test.each(['preset-glass-altar', '', 'custom'])('picker %s saves exactly one schema-checked visual', async choice => {
  const h = await harness();
  const on_change = vi.fn();
  const fields = StylePickerFields({ choice, custom_id: 'my-custom', busy: false, on_change });
  const select = fields.props.children[0].props.children;
  select.props.onChange({ currentTarget: { value: choice } });
  expect(on_change).toHaveBeenCalledWith(choice);
  const html = renderToStaticMarkup(fields);
  const design = html.match(/name="design_id"[^>]*value="([^"]*)"/)?.[1];
  expect(design).toBeDefined();
  if (choice === 'custom') expect(html).toContain('id="beacon-design-id"');
  else expect(html).not.toContain('id="beacon-design-id"');
  if (choice === 'preset-glass-altar') expect(html).toContain('/art/preset-glass-altar.webp');
  h.rpc.mockClear();
  await save(h, '', undefined, design);
  expect(h.rpc).toHaveBeenCalledOnce();
  const saved = h.port.getSnapshot().visuals[0];
  if (choice === '') expect(saved).not.toHaveProperty('design_id');
  else expect(saved?.design_id).toBe(choice === 'custom' ? 'my-custom' : choice);
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
