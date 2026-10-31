import { createElement, isValidElement, Children } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { SealButton } from '@castle-control/ui';
import { obsSourceCreate, parseMethodParams } from '@castle-control/contract';
import { fixtureVisuals } from '../beacons-fixture.js';
import { createStreamSetup } from './setup-model.js';
import { createObsPort } from './obs-core.js';
import type { ObsNetwork } from './obs-core.js';
import { StreamSetupContent, StreamSetupRow } from './setup.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:4820', session_token: 'e'.repeat(64) } as const;
const visual = { ...fixtureVisuals[0]!, visual_id: 'hearth', name: 'Hearth' };
const url = 'http://localhost:4821/beacons/hearth';

test('OBS setup offers vote-bar copy only in core mode, without chat or viewer identity', async () => {
  const rpc = vi.fn<ObsNetwork['rpc']>(async () => ({ url: 'http://localhost:4821/gatehouse/current' }));
  const model = createStreamSetup({ mode: 'core', launch, transport: { rpc } });
  const row = model.getSnapshot().rows.find(row => row.vote_bar);
  expect(row).toBeDefined();
  if (!row) throw new Error('Missing core vote bar');
  expect(renderToStaticMarkup(StreamSetupRow({ row, state: model.getSnapshot(), model }))).toContain('Copy browser-source URL');
  const write = vi.fn<(url: string) => Promise<void>>(async () => undefined);
  await model.copy(row.id, write);
  expect(rpc.mock.calls[0]?.slice(2)).toEqual(['gatehouse.source.url', {}]);
  expect(write).toHaveBeenCalledWith('http://localhost:4821/gatehouse/current');
  expect(createStreamSetup({ mode: 'fixture' }).getSnapshot().rows.some(row => row.vote_bar)).toBe(false);
});
function network() {
  const rpc = vi.fn<ObsNetwork['rpc']>(async (_endpoint, _session, method) => {
    if (method === 'beacons.visual.list') return { visuals: [visual] };
    if (method === 'beacons.source.url') return { url };
    if (method === 'obs.status.get') return { connected: true };
    return { source_name: 'Castle Control · Hearth' };
  });
  return { rpc };
}
async function core(transport = network()) {
  const model = createStreamSetup({ mode: 'core', launch, transport });
  await model.refresh();
  return { model, transport };
}
function first(model: ReturnType<typeof createStreamSetup>) {
  const row = model.getSnapshot().rows.find(row => row.visual_id);
  if (!row) throw new Error('Missing test visual');
  return row;
}

test('fixture rows and add are simulated, with no network or capability use', async () => {
  const transport = network();
  const model = createStreamSetup({ mode: 'fixture', transport });
  const state = model.getSnapshot();
  expect(state.obs).toBe('simulated');
  expect(state.rows.filter(row => row.visual_id).map(row => row.visual_id)).toEqual(fixtureVisuals.map(row => row.visual_id));
  expect(state.rows.find(row => !row.visual_id)).toMatchObject({ phase: 'unavailable', href: '#/chamber/lottery' });
  await model.refresh();
  await model.add(first(model).id);
  expect(first(model)).toMatchObject({ phase: 'added', notice: 'Simulated · no OBS source was created' });
  expect(transport.rpc).not.toHaveBeenCalled();
});

test('core resolves an owned visual then creates exactly one source with parsed scene and preset', async () => {
  const { model, transport } = await core();
  expect(model.setPreset('720p')).toBe(true);
  expect(model.setScene('  Main  ')).toBe(true);
  transport.rpc.mockClear();
  await model.add('hearth');
  expect(transport.rpc.mock.calls.map(call => call[2])).toEqual(['beacons.source.url', 'obs.source.create']);
  const params = { scene_name: 'Main', source_name: 'Castle Control · Hearth', url, width: 1280, height: 720 };
  expect(transport.rpc.mock.calls[1]?.[3]).toEqual(params);
  expect(parseMethodParams(obsSourceCreate, params)).toEqual(params);
  expect(first(model).phase).toBe('added');
});

test('scene and preset parsing keeps prior fields, disables add on refusal, and recovers on correction', async () => {
  const model = createStreamSetup({ mode: 'fixture' });
  for (const name of ['   ', 'x'.repeat(300)]) {
    expect(model.setScene(name)).toBe(false);
    expect(model.getSnapshot().scene_name).toBe('Scene');
    expect(model.canAdd(first(model).id)).toBe(false);
    await model.add(first(model).id);
    expect(first(model).phase).toBe('idle');
  }
  expect(model.setScene('x'.repeat(256))).toBe(true);
  expect(model.canAdd(first(model).id)).toBe(true);
  expect(model.setPreset('4k')).toBe(false);
  expect(model.getSnapshot().preset).toBe('1080p');
  expect(model.setPreset('vertical')).toBe(true);
  expect(model.getSnapshot().preset).toBe('vertical');
});

test('upstream errors use fixed code copy, never upstream prose, and allow an explicit retry', async () => {
  const { model, transport } = await core();
  transport.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method === 'beacons.source.url') return { url };
    throw { code: 'unavailable', message: 'secret upstream text', detail: { secret: 'private detail' } };
  });
  await model.add('hearth');
  expect(first(model).phase).toBe('refused');
  expect(first(model).notice).toContain('scene');
  expect(JSON.stringify(model.getSnapshot())).not.toMatch(/secret upstream text|private detail/);
  expect(model.canAdd('hearth')).toBe(true);
  transport.rpc.mockImplementation(async (_endpoint, _session, method) => method === 'beacons.source.url' ? { url } : { source_name: 'Castle Control · Hearth' });
  await model.add('hearth');
  expect(first(model).phase).toBe('added');
});

test('invalid is an owned-URL refusal; malformed replies and invalid launch never create a source', async () => {
  const { model, transport } = await core();
  transport.rpc.mockRejectedValue({ code: 'invalid', message: 'do not display' });
  await model.add('hearth');
  expect(first(model).notice).toBe('Not an owned overlay URL.');
  transport.rpc.mockClear();
  transport.rpc.mockResolvedValue({ url: 'https://example.com/private' });
  await model.add('hearth');
  expect(transport.rpc.mock.calls.map(call => call[2])).toEqual(['beacons.source.url']);
  expect(first(model).phase).toBe('refused');
  expect(() => createObsPort({ ...launch, endpoint: 'https://example.com/' }, transport)).toThrow();
});

test('refresh distinguishes disconnected OBS from an unknown status and renders the distinction', async () => {
  const { model, transport } = await core();
  transport.rpc.mockImplementation(async (_endpoint, _session, method) => method === 'obs.status.get' ? { connected: false } : { visuals: [visual] });
  await model.refresh();
  expect(model.getSnapshot().obs).toBe('down');
  const html = renderToStaticMarkup(createElement(StreamSetupContent, { model, state: model.getSnapshot(), on_back: () => undefined }));
  expect(html).toContain('OBS is not listening');
  transport.rpc.mockRejectedValue(new Error('private socket failure'));
  await model.refresh();
  expect(model.getSnapshot().obs).toBe('unknown');
  expect(JSON.stringify(model.getSnapshot())).not.toContain('private socket failure');
});

type LeafProps = { children?: ReactNode; on_seal?: () => void; onClick?: () => void; disabled?: boolean; variant?: string };
function sealProps(node: ReactNode): LeafProps | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<LeafProps>(child)) continue;
    if (child.type === SealButton) return child.props;
    const found = sealProps(child.props.children);
    if (found) return found;
  }
  return undefined;
}
test('hook-free row exposes add only through the kit proclaim hold, not a row click', async () => {
  const model = createStreamSetup({ mode: 'fixture' });
  const add = vi.spyOn(model, 'add');
  const row = StreamSetupRow({ row: first(model), state: model.getSnapshot(), model });
  expect(row.props.onClick).toBeUndefined();
  expect(row.props.on_select).toBeUndefined();
  expect(add).not.toHaveBeenCalled();
  const seal = sealProps(row);
  expect(seal).toMatchObject({ variant: 'proclaim', disabled: false });
  await seal?.on_seal?.();
  expect(add).toHaveBeenCalledExactlyOnceWith(first(model).id);
  model.setScene(' ');
  expect(sealProps(StreamSetupRow({ row: first(model), state: model.getSnapshot(), model }))?.disabled).toBe(true);
});

test('copy resolves the URL through the same port and reports clipboard refusal with fixed copy', async () => {
  const { model, transport } = await core();
  transport.rpc.mockClear();
  const write = vi.fn().mockResolvedValue(undefined);
  await model.copy('hearth', write);
  expect(write).toHaveBeenCalledExactlyOnceWith(url);
  expect(transport.rpc.mock.calls.map(call => call[2])).toEqual(['beacons.source.url']);
  expect(first(model).phase).toBe('ready');
  await model.copy('hearth', async () => { throw new Error('private clipboard'); });
  expect(first(model).notice).toContain('Clipboard');
  expect(first(model).notice).not.toContain('private');
});

test('in-flight add is single-flight, freezes parameters, and never automatically retries a mutation', async () => {
  const { model, transport } = await core();
  let resolve: ((value: unknown) => void) | undefined;
  transport.rpc.mockImplementation(async (_endpoint, _session, method) => method === 'beacons.source.url'
    ? new Promise(done => { resolve = done; }) : { source_name: 'Castle Control · Hearth' });
  transport.rpc.mockClear();
  const pending = model.add('hearth');
  expect(first(model).phase).toBe('resolving');
  expect(model.setScene('Other')).toBe(false);
  expect(model.setPreset('vertical')).toBe(false);
  await model.add('hearth');
  expect(transport.rpc).toHaveBeenCalledOnce();
  resolve?.({ url });
  await pending;
  expect(transport.rpc.mock.calls[1]?.[3]).toMatchObject({ scene_name: 'Scene', width: 1920, height: 1080 });
});

test('missing core capability stays unknown with no fixture substitution', async () => {
  const model = createStreamSetup({ mode: 'core' });
  await model.refresh();
  expect(model.getSnapshot().obs).toBe('unknown');
  expect(model.getSnapshot().rows.filter(row => row.visual_id)).toHaveLength(0);
});

test('output inventory at ten times the fixture volume is virtualized, including the Lot link', async () => {
  const transport = network();
  const visuals = Array.from({ length: fixtureVisuals.length * 10 }, (_, index) => ({ ...visual, visual_id: `visual-${index}` }));
  transport.rpc.mockImplementation(async (_endpoint, _session, method) => method === 'obs.status.get' ? { connected: true } : { visuals });
  const { model } = await core(transport);
  const html = renderToStaticMarkup(createElement(StreamSetupContent, { model, state: model.getSnapshot(), on_back: () => undefined }));
  expect(html).toContain('aria-rowcount="32"');
  expect(html.match(/role="row"/g)?.length).toBeLessThan(32);
  expect(model.getSnapshot().rows.at(-1)?.href).toBe('#/chamber/lottery');
});
