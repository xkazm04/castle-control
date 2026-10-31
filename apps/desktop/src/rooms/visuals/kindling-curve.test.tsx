import { Children, isValidElement } from 'react';
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode, SVGProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Visual } from '@castle-control/contract';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { createCurveEditor } from './curve-editor.js';
import { CurveControls } from './kindling-curve.jsx';
import { ConnectedBeacons } from './core.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
// Synthetic configuration, never a viewer or a contribution recording.
const fixture = { visual_id: 'synthetic-curve', name: 'Synthetic curve', curve: {
  ranges: [{ total: 0, intensity: 0 }, { total: 25, intensity: 0.5 }, { total: 50, intensity: 1 }],
  decay: { kind: 'none' },
} };
async function harness() {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method, params) =>
    method === 'beacons.visual.list' ? { visuals: [fixture] }
      : method === 'beacons.curve.set' && 'curve' in params ? { ...fixture, curve: params.curve } : undefined);
  const port = createCoreBeaconsPort(launch, { rpc });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Expected synthetic visual');
  return { port, rpc, visual, editor: createCurveEditor(visual, port) };
}
function points(tree: ReactNode): ReactElement<SVGProps<SVGCircleElement>>[] {
  const found: ReactElement<SVGProps<SVGCircleElement>>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<SVGProps<SVGCircleElement>>(child)) return;
    if (child.type === 'circle') found.push(child);
    else found.push(...points(child.props.children));
  });
  return found;
}
function point(editor: ReturnType<typeof createCurveEditor>, index = 1) {
  const controls: ReactElement<SVGProps<SVGCircleElement>>[] = [];
  function Probe() {
    controls.push(...points(CurveControls({ editor, state: editor.getSnapshot(), busy: false })));
    return null;
  }
  renderToStaticMarkup(<Probe />);
  const control = controls[index];
  if (!control) throw new Error('Expected focusable curve point');
  return control;
}
// This dependency-free Node suite has Event, but no KeyboardEvent, PointerEvent,
// DOM renderer or testing-library. Real Event instances own cancellation. The
// React wrapper supplies SyntheticEvent's methods. Casts below describe only
// native-event projections and SVG/document stubs: every property read by the
// actual handlers is supplied. This is handler coverage, not browser dispatch.
const view: KeyboardEvent<SVGCircleElement>['view'] = {
  document: {} as Document, styleMedia: { type: 'screen', matchMedium: () => true },
};
function synthetic<N extends Event>(currentTarget: SVGCircleElement, nativeEvent: N) {
  return { currentTarget, nativeEvent, target: currentTarget, bubbles: nativeEvent.bubbles, cancelable: nativeEvent.cancelable,
    defaultPrevented: nativeEvent.defaultPrevented, eventPhase: nativeEvent.eventPhase,
    isTrusted: nativeEvent.isTrusted, timeStamp: nativeEvent.timeStamp, type: nativeEvent.type, detail: 0, view,
    preventDefault: vi.fn(() => nativeEvent.preventDefault()), stopPropagation: vi.fn(() => nativeEvent.stopPropagation()),
    persist: () => undefined, isDefaultPrevented: () => nativeEvent.defaultPrevented,
    isPropagationStopped: () => nativeEvent.cancelBubble };
}
function key(value: string, shiftKey = false, options: { ctrlKey?: boolean; isComposing?: boolean } = {}): KeyboardEvent<SVGCircleElement> {
  const fields = { key: value, shiftKey, altKey: false, ctrlKey: options.ctrlKey ?? false, metaKey: false,
    charCode: 0, keyCode: 0, which: 0, code: value, locale: '', location: 0, repeat: false, getModifierState: () => false };
  const native: Event = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), fields,
    { isComposing: options.isComposing ?? false });
  return { ...synthetic({} as SVGCircleElement, native as globalThis.KeyboardEvent), ...fields };
}
function pointer(clientX: number, clientY: number, pointerId = 7): PointerEvent<SVGCircleElement> {
  const target: Partial<SVGCircleElement> = {
    focus: vi.fn<SVGCircleElement['focus']>(), setPointerCapture: vi.fn<SVGCircleElement['setPointerCapture']>(),
    releasePointerCapture: vi.fn<SVGCircleElement['releasePointerCapture']>(),
    ownerSVGElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 624, height: 164 }) } as SVGSVGElement,
  };
  const fields = { clientX, clientY, pointerId, button: 0, buttons: 1, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
    pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY, movementX: 0, movementY: 0,
    getModifierState: () => false, relatedTarget: null,
    width: 1, height: 1, pressure: 0.5, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0,
    pointerType: 'mouse' as const, isPrimary: true };
  const native: Event = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), fields);
  return { ...synthetic(target as SVGCircleElement, native as globalThis.PointerEvent), ...fields };
}
const markup = (editor: ReturnType<typeof createCurveEditor>) => renderToStaticMarkup(
  <CurveControls editor={editor} state={editor.getSnapshot()} busy={false} />);

test.each(['Decay', 'Input source'])('%s has an exact standalone label associated with its select', async label => {
  const h = await harness();
  const html = label === 'Decay' ? markup(h.editor) : renderToStaticMarkup(<ConnectedBeacons port={h.port} />);
  const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(match => match[0]);
  const id = labels.map(text => text.match(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/label>/))
    .find(match => match?.[2] === label)?.[1];
  expect(id, `Expected a standalone label with text exactly ${label}`).toBeTruthy();
  const select = [...html.matchAll(/<select\b[^>]*>/g)].map(match => match[0])
    .find(tag => tag.includes(`id="${id}"`));
  expect(select, 'Expected the select to reference the label target').toBeTruthy();
  if (!select) throw new Error('Missing labelled select');
  expect(labels.some(text => text.includes(select)), 'Select must not be nested inside a label').toBe(false);
});

test('pointer drag previews edited points and saves only on release with core acknowledgement', async () => {
  const h = await harness();
  let acknowledge: (value: unknown) => void = () => { throw new Error('No pending request'); };
  h.rpc.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  const control = point(h.editor);
  const down = pointer(312, 82);
  control.props.onPointerDown?.(down);
  expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(7);
  expect(down.nativeEvent.defaultPrevented).toBe(true);
  control.props.onPointerMove?.(pointer(372, 47));
  expect(h.editor.getSnapshot().draft.ranges[1]).toEqual({ total: 30, intensity: 0.75 });
  expect(markup(h.editor)).toContain('360,35');
  expect(h.port.getSnapshot().visuals[0]).toBe(h.visual);
  expect(h.rpc).toHaveBeenCalledTimes(1);
  control.props.onPointerUp?.(pointer(372, 47));
  await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
  const curve = h.editor.getSnapshot().draft;
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.curve.set', {
    visual_id: h.visual.visual_id, curve,
  });
  expect(h.editor.getSnapshot().phase).toBe('saving');
  expect(markup(h.editor)).toContain('Waiting for the core');
  expect(markup(h.editor)).not.toContain('Curve saved by the core');
  expect(h.port.getSnapshot().visuals[0]).toBe(h.visual);
  acknowledge({ ...fixture, curve });
  await vi.waitFor(() => expect(h.editor.getSnapshot().phase).toBe('saved'));
  expect(h.port.getSnapshot().visuals[0]?.curve).toEqual(curve);
  expect(markup(h.editor)).toContain('Curve saved by the core');
});

test('Tab focus, labelled points, fine/coarse arrow movement and Enter commit use the same save path', async () => {
  const h = await harness();
  const control = point(h.editor);
  expect(control.props.tabIndex).toBe(0);
  expect(control.props.role).toBe('button');
  expect(control.props['aria-label']).toContain('Control point 2');
  expect(control.props['aria-describedby']).toBeTruthy();
  for (const [value, coarse] of [['ArrowRight', false], ['ArrowUp', false], ['ArrowLeft', true], ['ArrowDown', true]] as const) {
    const event = key(value, coarse);
    control.props.onKeyDown?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.nativeEvent.defaultPrevented).toBe(true);
    expect(event.isPropagationStopped()).toBe(true);
  }
  expect(h.editor.getSnapshot().draft.ranges[1]).toEqual({ total: 16, intensity: 0.41 });
  expect(h.rpc).toHaveBeenCalledTimes(1);
  const enter = key('Enter');
  control.props.onKeyDown?.(enter);
  expect(enter.stopPropagation).toHaveBeenCalled();
  await vi.waitFor(() => expect(h.editor.getSnapshot().phase).toBe('saved'));
  expect(h.port.getSnapshot().visuals[0]?.curve.ranges[1]).toEqual({ total: 16, intensity: 0.41 });
  expect(markup(h.editor)).toContain('Shift');
});

test('Escape cancels keyboard edits without saving or triggering shell Back', async () => {
  const h = await harness();
  const control = point(h.editor);
  control.props.onKeyDown?.(key('ArrowUp', true));
  const escape = key('Escape');
  control.props.onKeyDown?.(escape);
  expect(escape.stopPropagation).toHaveBeenCalled();
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  expect(h.rpc).toHaveBeenCalledTimes(1);
  expect(markup(h.editor)).toContain('cancelled');
});

test.each(['rejected', 'failed', 'malformed', 'mismatched'] as const)('%s save rolls back to the last confirmed curve with inline error', async outcome => {
  const h = await harness();
  point(h.editor).props.onKeyDown?.(key('ArrowUp'));
  await h.editor.save();
  const confirmed = h.editor.getSnapshot().confirmed;
  point(h.editor).props.onKeyDown?.(key('ArrowDown', true));
  if (outcome === 'rejected') h.rpc.mockRejectedValueOnce({ code: 'invalid', message: 'Private upstream text' });
  if (outcome === 'failed') h.rpc.mockRejectedValueOnce(new Error('Lost reply'));
  if (outcome === 'malformed') h.rpc.mockResolvedValueOnce({ ...fixture, curve: { ...fixture.curve, ranges: [] } });
  if (outcome === 'mismatched') h.rpc.mockResolvedValueOnce({ ...fixture, visual_id: 'different-visual' });
  await h.editor.save();
  expect(h.editor.getSnapshot().phase).toBe('error');
  expect(h.editor.getSnapshot().draft).toEqual(confirmed);
  expect(h.port.getSnapshot().visuals[0]?.curve).toEqual(confirmed);
  const html = markup(h.editor);
  expect(html).toContain('role="alert"');
  expect(html).toContain('last confirmed curve');
  expect(html).not.toContain('Private upstream text');
  expect(h.rpc).toHaveBeenCalledTimes(3);
});

test('clamps movement to uint32 totals, strict neighbour ordering and finite intensity in 0..1', async () => {
  const h = await harness();
  const control = point(h.editor);
  for (let i = 0; i < 20; i++) {
    control.props.onKeyDown?.(key('ArrowRight', true));
    control.props.onKeyDown?.(key('ArrowUp', true));
  }
  expect(h.editor.getSnapshot().draft.ranges[1]).toEqual({ total: 49, intensity: 1 });
  for (let i = 0; i < 20; i++) {
    control.props.onKeyDown?.(key('ArrowLeft', true));
    control.props.onKeyDown?.(key('ArrowDown', true));
  }
  expect(h.editor.getSnapshot().draft.ranges[1]).toEqual({ total: 1, intensity: 0 });
  // Descending intensities are legal; total ordering alone is constrained.
  await h.editor.save();
  expect(h.editor.getSnapshot().phase).toBe('saved');
});

test('pointer cancel/lost capture discard drafts, other pointer IDs and modified/composing keys do nothing', async () => {
  const h = await harness();
  const control = point(h.editor);
  control.props.onPointerMove?.(pointer(372, 47));
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  control.props.onPointerDown?.(pointer(312, 82));
  control.props.onPointerMove?.(pointer(372, 47, 8));
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  control.props.onPointerMove?.(pointer(372, 47));
  control.props.onPointerCancel?.(pointer(372, 47));
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  control.props.onPointerDown?.(pointer(312, 82));
  control.props.onPointerMove?.(pointer(372, 47));
  control.props.onLostPointerCapture?.(pointer(372, 47));
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  const modified = key('ArrowUp', false, { ctrlKey: true });
  control.props.onKeyDown?.(modified);
  const composing = key('ArrowUp', false, { isComposing: true });
  control.props.onKeyDown?.(composing);
  expect(h.editor.getSnapshot().draft).toEqual(h.visual.curve);
  expect(h.rpc).toHaveBeenCalledTimes(1);
});

test('single-point and uint32-edge curves remain editable and never sort or coerce invalid numbers', async () => {
  const h = await harness();
  const visual: Visual = { ...h.visual, curve: { ranges: [{ total: 4294967295, intensity: 0.3 }], decay: { kind: 'none' } } };
  const editor = createCurveEditor(visual, h.port);
  point(editor, 0).props.onKeyDown?.(key('ArrowRight', true));
  expect(editor.getSnapshot().draft.ranges[0]?.total).toBe(4294967295);
  editor.move(0, NaN, Infinity);
  expect(editor.getSnapshot().draft).toEqual(visual.curve);
});
