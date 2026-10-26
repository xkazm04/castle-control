import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactElement, ReactNode, InputHTMLAttributes } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { BeaconPreview, BeaconsFeed } from './beacons-visuals.jsx';
import { CurveEditor } from './beacons-curve.jsx';
import { BeaconsPage, copyFixtureUrl } from './beacons-page.jsx';
import { createBeaconsPreview } from './beacons-model.js';
import { fixtureEvents, fixtureSourceUrl } from './beacons-fixture.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';

function find<T>(tree: ReactNode, label: string): ReactElement<T> {
  let found: ReactElement<T> | undefined;
  const visit = (node: ReactNode) => {
    Children.forEach(node, child => {
      if (!isValidElement<T & { children?: ReactNode; 'aria-label'?: string }>(child)) return;
      if (child.props['aria-label'] === label) found = child;
      else visit(child.props.children);
    });
  };
  visit(tree);
  if (!found) throw new Error(`Missing control: ${label}`);
  return found;
}
function current(port: ReturnType<typeof createBeaconsPreview>) {
  const snapshot = port.getSnapshot();
  const item = snapshot.visuals.find(item => item.visual.visual_id === snapshot.selected);
  if (!item) throw new Error('Missing selected fixture visual');
  return item;
}
const preview = (port: ReturnType<typeof createBeaconsPreview>) => renderToStaticMarkup(<BeaconPreview item={current(port)} />);

test('600 fixture events render only a window of DOM rows, including at the end', () => {
  expect(fixtureEvents).toHaveLength(600);
  const html = renderToStaticMarkup(<BeaconsFeed events={fixtureEvents} />);
  expect(html).toContain('aria-rowcount="600"');
  expect(html.match(/data-contribution-row=/g)?.length).toBeGreaterThan(0);
  expect(html.match(/data-contribution-row=/g)?.length).toBeLessThan(30);
  expect(html).toContain('simulated-event-0');
  expect(html).not.toContain('simulated-event-599');
  const last = renderToStaticMarkup(<BeaconsFeed events={fixtureEvents} scroll_top={600 * 32} />);
  expect(last).toContain('simulated-event-599');
  expect(last.match(/data-contribution-row=/g)?.length).toBeLessThan(30);
});

test('editing a real curve control changes the preview CSS variable and preserves its artwork', () => {
  const port = createBeaconsPreview();
  const before = preview(port);
  const editor = CurveEditor({ item: current(port), port });
  const input = find<InputHTMLAttributes<HTMLInputElement>>(editor, 'Point 2 intensity');
  input.props.onChange?.({ currentTarget: { valueAsNumber: 0.8 } } as ChangeEvent<HTMLInputElement>);
  const after = preview(port);
  expect(after).toContain(`--blaze:${current(port).intensity}`);
  expect(after).not.toEqual(before);
  expect(after.replace(/style="[^"]*"/, '')).toEqual(before.replace(/style="[^"]*"/, ''));
});

test('dragging a curve handle maps pointer coordinates to a point and changes the CSS variable', () => {
  const port = createBeaconsPreview();
  const before = preview(port);
  let captured = false;
  const target = { setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured,
    releasePointerCapture: () => { captured = false; },
    ownerSVGElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 560, height: 260 }) } };
  const event = { currentTarget: target, pointerId: 1, clientX: 90, clientY: 75, preventDefault: () => undefined };
  // Supply exactly the pointer protocol consumed by the handle, without a DOM shim.
  type DragHandler = (value: typeof event) => void;
  const handle = find<{ onPointerDown?: DragHandler; onPointerMove?: DragHandler; onPointerUp?: DragHandler }>(
    CurveEditor({ item: current(port), port }), 'Drag point 2');
  handle.props.onPointerDown?.(event);
  expect(captured).toBe(true);
  handle.props.onPointerMove?.({ ...event, clientY: 42 });
  expect(preview(port)).not.toEqual(before);
  expect(current(port).visual.curve.ranges[1]?.intensity).toBeCloseTo(0.9);
  handle.props.onPointerUp?.(event);
  expect(captured).toBe(false);
});

test('50-sub gift bomb adds exactly 50 simulated events in-process and updates only the selected visual', () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
  try {
    const port = createBeaconsPreview();
    const before = port.getSnapshot();
    const listener = vi.fn();
    const stop = port.subscribe(listener);
    port.weight(2);
    port.fire('gift', 50);
    const after = port.getSnapshot();
    expect(after.events).toHaveLength(before.events.length + 50);
    expect(new Set(after.events.map(event => event.id)).size).toBe(650);
    expect(after.events.slice(0, 50).every(event => event.label === 'simulated' && event.burst.source === 'gift' && event.burst.amount === 1)).toBe(true);
    expect(current(port).total).toBe((before.visuals[0]?.total ?? 0) + 100);
    expect(after.visuals[1]).toBe(before.visuals[1]);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    port.fire('subscribe', 1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('decay advances under the explicit simulated clock; invalid points never change the curve', () => {
  const port = createBeaconsPreview();
  const before = current(port).total;
  port.decay({ kind: 'exponential', half_life_s: 60 });
  port.advance();
  expect(current(port).total).toBe(before / 2);
  port.decay({ kind: 'none' });
  port.advance();
  expect(current(port).total).toBe(before / 2);
  const curve = current(port).visual.curve;
  port.point(1, { total: 30, intensity: 0.5 });
  expect(current(port).visual.curve).toBe(curve);
  expect(port.getSnapshot().notice).toContain('strictly increasing');
  port.point(1, { total: Number.NaN, intensity: 0.5 });
  port.point(1, { total: 10, intensity: Number.NaN });
  expect(current(port).visual.curve).toBe(curve);
});

test('selecting and resetting a visual keep other curves and source fixtures unchanged', () => {
  const port = createBeaconsPreview();
  const initial = port.getSnapshot();
  const first = current(port);
  const second = initial.visuals[1];
  if (!second) throw new Error('Missing second fixture visual');
  port.point(1, { total: 12, intensity: 0.7 });
  const edited = current(port).visual.curve;
  expect(edited).not.toEqual(first.visual.curve);
  port.select(second.visual.visual_id);
  expect(current(port)).toBe(second);
  port.select(first.visual.visual_id);
  expect(current(port).visual.curve).toBe(edited);
  port.weight(6);
  port.reset();
  expect(current(port).visual.curve).toEqual(first.visual.curve);
  expect(current(port).gift_weight).toBe(1);
  expect(createBeaconsPreview().getSnapshot().visuals).toEqual(initial.visuals);
});

test('cards and selected preview have unique SVG paint references on the same page', () => {
  const html = renderToStaticMarkup(<BeaconsPage />);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const references = [...html.matchAll(/fill="url\(#([^)]+)\)"/g)].map(match => match[1]);
  expect(references).toHaveLength(4);
  expect(new Set(ids).size).toBe(ids.length);
  for (const reference of references) expect(ids).toContain(reference);
});

test('placeholder copying is labelled, observes clipboard failures and never invokes a transport', async () => {
  const port = createBeaconsPreview();
  const url = fixtureSourceUrl(port.getSnapshot().selected);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  expect(await copyFixtureUrl(url, { writeText })).toContain('NOT LIVE');
  expect(writeText).toHaveBeenCalledWith(url);
  expect(await copyFixtureUrl(url, undefined)).toContain('unavailable');
  writeText.mockRejectedValue(new Error('Denied'));
  expect(await copyFixtureUrl(url, { writeText })).toContain('failed');
  const html = renderToStaticMarkup(<BeaconsPage port={port} />);
  for (const text of ['NOT LIVE', 'not served', '600 simulated events', 'Kindling curve', '50-sub gift bomb']) expect(html).toContain(text);
});

test('Beacons fixture route loads lazily while core mode keeps fixture controls hidden', async () => {
  const props = { theme: 'paper', current: 'visuals', on_navigate: () => undefined, on_theme_change: () => undefined,
    search: '', on_search: () => undefined } as const;
  const stream = await renderToReadableStream(<DesktopView {...props} snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('Kindling curve');
  expect(html).not.toContain('No beacon is lit');
  const core = renderToStaticMarkup(<DesktopView {...props} snapshot={{ mode: 'core', phase: 'connecting' }} />);
  expect(core).not.toContain('data-contribution-row');
  expect(core).not.toContain('50-sub gift bomb');
});

test('fixture modules import no core, transport or renderer and use the shared windowed list', () => {
  for (const name of ['page.tsx', 'curve.tsx', 'visuals.tsx', 'model.ts', 'fixture.ts']) {
    const source = readFileSync(new URL(`./beacons-${name}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(fetch|invoke|WebSocket|XMLHttpRequest)\s*\(/);
    expect(source).not.toMatch(/from ['"].*(?:client|core-source|renderer)/);
  }
  expect(readFileSync(new URL('./beacons-visuals.tsx', import.meta.url), 'utf8')).toContain('WindowedRows');
});
