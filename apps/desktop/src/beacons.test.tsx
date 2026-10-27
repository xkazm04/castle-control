import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import VisualsRoom, { VisualsWork, VisualSelector } from './rooms/visuals/room.jsx';
import { TestFire } from './rooms/visuals/test-fire.jsx';
import { BeaconArtwork } from './rooms/visuals/artwork.jsx';
import { createBeaconsPreview } from './beacons-model.js';
import { fixtureEvents } from './beacons-fixture.js';
import Room from './shell/room.jsx';

function current(port: ReturnType<typeof createBeaconsPreview>) {
  const snapshot = port.getSnapshot();
  const item = snapshot.visuals.find(item => item.visual.visual_id === snapshot.selected);
  if (!item) throw new Error('Missing selected fixture visual');
  return item;
}
const preview = (port: ReturnType<typeof createBeaconsPreview>) => renderToStaticMarkup(<BeaconArtwork item={current(port)} hero />);

test('the room test-fire contribution changes preview intensity without sending to OBS', () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline preview only'));
  try {
    const port = createBeaconsPreview();
    const before = preview(port);
    const fire = TestFire({ port, selected: current(port), on_end: vi.fn() });
    const subscribe = fire.props.children[2].props.children[1];
    subscribe.props.onClick();
    const after = preview(port);
    expect(after).not.toBe(before);
    expect(after).toContain(`--room-blaze:${current(port).intensity}`);
    expect(after.replace(/style="[^"]*"/, '')).toBe(before.replace(/style="[^"]*"/, ''));
    expect(renderToStaticMarkup(<VisualsWork port={port} />)).toContain('This room has no OBS connection.');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('the visual selection button selects the corresponding unchanged curve and artwork', () => {
  const port = createBeaconsPreview();
  const second = port.getSnapshot().visuals[1];
  if (!second) throw new Error('Missing second visual');
  const selector = VisualSelector({ visuals: port.getSnapshot().visuals, selected: port.getSnapshot().selected,
    on_select: item => port.select(item.visual.visual_id) });
  selector.props.children[1]?.props.children[0].props.onClick();
  expect(current(port)).toBe(second);
  const html = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(html).toContain(`<h2>${second.visual.name}</h2>`);
  expect(html).toContain(`${second.visual.name} intensity ranges`);
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

test('fixture route lazily opens Beacons work; core requires a shell connection', async () => {
  const props = { chamber: 'visuals', replay: false, origin: 'keep', on_open: vi.fn(), on_back: vi.fn() } as const;
  const stream = await renderToReadableStream(<Room {...props} snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  for (const label of ['Beacons work', '60 offerings', 'Test fire: 50 gifts']) expect(html).toContain(label);
  expect(html).not.toContain('visuals-room-notice');
  expect(html).not.toContain('generated fixtures only');
  const coreStream = await renderToReadableStream(<Room {...props} snapshot={{ mode: 'core', phase: 'connecting' }} />);
  await coreStream.allReady;
  const core = await new Response(coreStream).text();
  expect(core).toContain('Local connection unavailable');
  expect(core).not.toContain('Test fire');
  expect(core).not.toContain('data-offering-mark');
  expect(renderToStaticMarkup(<VisualsRoom snapshot={{ mode: 'core', phase: 'ready' }} />)).toContain('Beacons are not configured');
});

test('room renders a bounded window of the 600-event model beside the separate 60-offering illustration', () => {
  expect(fixtureEvents).toHaveLength(600);
  const port = createBeaconsPreview();
  expect(port.getSnapshot().events).toBe(fixtureEvents);
  const html = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(html.match(/data-offering-mark=/g)).toHaveLength(60);
  expect(html).toContain('aria-rowcount="600"');
  expect(html.match(/data-contribution-row=/g)?.length).toBeLessThan(20);
  expect(html).toContain('simulated · Local preview');
  port.fire('subscribe', 1);
  const after = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(after).toContain('aria-rowcount="601"');
  expect(after).toContain('data-contribution-row="simulated-event-600"');
});

test('Beacons work imports no core transport or renderer', () => {
  for (const name of ['rooms/visuals/room.tsx', 'rooms/visuals/test-fire.tsx', 'beacons-model.ts', 'beacons-fixture.ts']) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(fetch|invoke|WebSocket|XMLHttpRequest)\s*\(/);
    expect(source).not.toMatch(/from ['"].*(?:client|core-source|renderer)/);
  }
});
