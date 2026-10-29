import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';
import Room from './room.jsx';
import { createArtGeneration } from './art-state.js';
import { ArtControls, GenerateButton, ConfirmButton } from './art.jsx';

// Simulated core responses only. No provider connection or paid call.
const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
const visual_data = { visual_id: 'simulated-art', name: 'Simulated art visual', design_id: 'simulated-design',
  curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } } as const;
const receipt = { call_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', model: 'simulated-model', charge: { credits: '1.250000' } };
const result = { design_id: visual_data.design_id, costs: [receipt], assets: [
  { asset: 'assets/simulated-frame.png', generated: true, provenance: 'leonardo_generated' },
] };
const cap = 'The 30-a-day generation cap is not enforced by the app. Keep count yourself.';
async function harness(available = true) {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method) => {
    if (method === 'beacons.visual.list') return { visuals: [visual_data] };
    if (method === 'beacons.art.status') return { available };
    if (method === 'beacons.art.generate') return result;
    throw new Error('Unexpected simulated method');
  });
  const port = createCoreBeaconsPort(launch, { rpc });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Missing simulated visual');
  const art = createArtGeneration(port, visual.design_id);
  const html = () => renderToStaticMarkup(<ArtControls art={art} state={art.getSnapshot()} visual={visual} />);
  const click = () => GenerateButton({ art, state: art.getSnapshot(), disabled: !visual.design_id }).props.onClick();
  const confirm = () => ConfirmButton({ art, state: art.getSnapshot() }).props.onClick();
  const generated = () => rpc.mock.calls.filter(call => call[2] === 'beacons.art.generate');
  const draft = () => { art.edit('prompt', 'A simulated gold frame'); art.edit('model_id', 'simulated-model'); };
  return { port, rpc, art, visual, html, click, confirm, generated, draft };
}
async function room(h: Awaited<ReturnType<typeof harness>>) {
  const stream = await renderToReadableStream(<ConnectedBeacons port={h.port} />);
  await stream.allReady;
  return new Response(stream).text();
}

test('room entry reads art status independently, with lazy section and validators', () => {
  const core = readFileSync(new URL('./core.tsx', import.meta.url), 'utf8');
  expect(core).toMatch(/useEffect\([\s\S]*?port\.loadArtStatus\(\)/);
  expect(core).toContain("lazy(() => import('./art.jsx'))");
  const adapter = readFileSync(new URL('../../beacons-core.ts', import.meta.url), 'utf8');
  expect(adapter).toContain("import('@castle-control/contract/beacons')");
});

test('unavailable, failed and invalid status hide art without changing the room or its notice', async () => {
  const h = await harness(false);
  const before = h.port.getSnapshot();
  await h.port.loadArtStatus();
  expect(await room(h)).not.toContain('Generate art');
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'beacons.art.status', {});
  for (const failure of [new Error('private provider prose'), { available: null }, { available: true, key_label: 'private label' }]) {
    if (failure instanceof Error) h.rpc.mockRejectedValueOnce(failure);
    else h.rpc.mockResolvedValueOnce(failure);
    await h.port.loadArtStatus();
    const html = await room(h);
    expect(html).not.toContain('Generate art'); expect(html).not.toContain('private');
    expect(h.port.getSnapshot().notice).toBe(before.notice);
    expect(h.port.getSnapshot().error).toBeUndefined();
    expect(h.port.getSnapshot().visuals).toBe(before.visuals);
  }
  expect(h.generated()).toHaveLength(0);
});

test('fixture mode never renders art or sends a request', async () => {
  const h = await harness(); h.rpc.mockClear();
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  expect(html).not.toContain('Generate art'); expect(html).not.toContain(cap);
  expect(h.rpc).not.toHaveBeenCalled();
});

test('available status shows the lazy section for the selected visual with the not-enforced cap line', async () => {
  const h = await harness(); await h.port.loadArtStatus();
  const html = await room(h);
  expect(html).toContain('Generate art'); expect(html).toContain(cap);
  expect(html).toContain('Simulated art visual'); expect(html).not.toContain(launch.session_token);
  expect(h.generated()).toHaveLength(0);
  expect(html).not.toContain('\u2014');
});

test('only Generate then explicit credit confirmation submits once; cancel and in-flight clicks never submit', async () => {
  const h = await harness(); await h.port.loadArtStatus(); h.draft();
  await h.confirm(); expect(h.generated()).toHaveLength(0);
  h.click(); expect(h.generated()).toHaveLength(0);
  expect(h.html()).toContain("streamer&#x27;s own Leonardo key"); expect(h.html()).toContain('costs credits');
  expect(h.html()).toContain(cap);
  h.art.cancel(); await h.confirm(); expect(h.generated()).toHaveLength(0);
  h.click();
  let finish: (value: unknown) => void = () => { throw new Error('Expected pending mock'); };
  h.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.confirm();
  expect(GenerateButton({ art: h.art, state: h.art.getSnapshot(), disabled: false }).props.disabled).toBe(true);
  await vi.waitFor(() => expect(h.generated()).toHaveLength(1));
  h.click(); await h.confirm(); expect(h.generated()).toHaveLength(1);
  expect(h.port.getSnapshot().art_busy).toBe(true);
  // A remounted section shares the core's busy guard, including across selection.
  expect(await room(h)).toMatch(/<button type="button" disabled="">Generate<\/button>/);
  const remounted = createArtGeneration(h.port, h.visual.design_id);
  remounted.edit('prompt', 'Another simulated frame'); remounted.edit('model_id', 'simulated-model');
  remounted.requestConfirmation(); await remounted.confirm();
  expect(h.generated()).toHaveLength(1);
  expect(h.generated()[0]?.[3]).toEqual({ design_id: visual_data.design_id, prompt: 'A simulated gold frame',
    model_id: 'simulated-model', width: 512, height: 512, quantity: 1, remove_background: false });
  finish(result); await pending;
  expect(h.art.getSnapshot().busy).toBe(false); expect(h.generated()).toHaveLength(1);
  expect(h.port.getSnapshot().art_busy).toBe(false);
});

test('assets carry generated labels and provenance and cost receipts render unchanged as data', async () => {
  const h = await harness(); await h.port.loadArtStatus(); h.draft(); h.click(); await h.confirm();
  const html = h.html();
  expect(html).toContain('Generated (Leonardo)'); expect(html).toContain('leonardo_generated');
  expect(html).toContain('assets/simulated-frame.png'); expect(html).toContain('1.250000');
  expect(html).toContain(renderToStaticMarkup(<pre>{JSON.stringify(result.costs, null, 2)}</pre>));
  expect(html).toContain(cap); expect(html).not.toContain(launch.session_token);
  expect(html).not.toContain('key_label'); expect(html).not.toContain('CODEX_API_KEY');
});

test('errors are inline, discard upstream secrets and require a new explicit confirmation', async () => {
  const h = await harness(); await h.port.loadArtStatus(); h.draft(); h.click();
  const private_text = 'private-provider-sentinel';
  h.rpc.mockRejectedValueOnce({ code: 'upstream', message: private_text, detail: { key: private_text } });
  await h.confirm();
  expect(h.html()).toContain('role="alert"'); expect(h.html()).toContain('upstream');
  expect(h.html()).not.toContain(private_text); expect(h.html()).not.toContain(launch.session_token);
  expect(h.html()).toContain(cap); expect(h.generated()).toHaveLength(1);
  await h.confirm(); expect(h.generated()).toHaveLength(1);
  h.click(); await h.confirm(); expect(h.generated()).toHaveLength(2);
});

test('invalid inputs, mismatched results and malformed receipts never render as successful generation', async () => {
  const h = await harness(); await h.port.loadArtStatus();
  h.click(); expect(h.html()).toContain('Enter a prompt and model ID');
  expect(h.generated()).toHaveLength(0);
  h.draft(); h.art.edit('model_id', 'invalid model'); h.click(); await h.confirm();
  expect(h.generated()).toHaveLength(0); expect(h.html()).toContain('role="alert"');
  for (const invalid of [{ ...result, design_id: 'other-design' },
    { ...result, costs: [{ ...receipt, charge: { credits: 1.25 } }] },
    { ...result, key_label: 'private label' }]) {
    h.draft(); h.rpc.mockResolvedValueOnce(invalid); h.click(); await h.confirm();
    expect(h.html()).toContain('role="alert"'); expect(h.html()).not.toContain('Generated (Leonardo)');
    expect(h.html()).not.toContain('private label');
  }
});
