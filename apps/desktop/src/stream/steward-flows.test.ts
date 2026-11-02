import { afterEach, expect, test } from 'vitest';
import { createDockStore } from '@castle-control/ui/steward-flow';
import { createStreamSetup } from './setup-model.js';
import { addAllFlow, addSourceFlow, attachStreamSetup, streamSteward } from './steward-flows.js';

let detach: (() => void) | undefined;
afterEach(() => { detach?.(); detach = undefined; });

test('fixture flows are marked SIMULATED and offer add one and add every output', () => {
  const steward = streamSteward({ mode: 'fixture', phase: 'ready' });
  expect(steward.flows.map(flow => flow.chip)).toEqual(['Add a source', 'Add every output']);
  expect(steward.flows.every(flow => flow.simulated)).toBe(true);
  expect(streamSteward({ mode: 'core', phase: 'ready' }).flows.some(flow => flow.simulated)).toBe(false);
});

test('add a source walks output, scene and size, and only the seal adds (simulated in fixture)', async () => {
  const model = createStreamSetup({ mode: 'fixture' });
  detach = attachStreamSetup(model);
  const store = createDockStore();
  store.open(addSourceFlow);
  for (const answer of ['offering-altar', 'other', 'Stage left', 'vertical']) store.answer('stream', answer);
  expect(store.getSnapshot().drafts.stream?.draft).toEqual({ output: 'offering-altar', scene: 'Stage left', preset: 'vertical' });
  expect(model.getSnapshot().rows.find(row => row.id === 'offering-altar')?.phase).toBe('idle');
  await store.seal('stream');
  const after = model.getSnapshot();
  expect(after.scene_name).toBe('Stage left'); expect(after.preset).toBe('vertical');
  expect(after.rows.find(row => row.id === 'offering-altar')).toMatchObject({ phase: 'added', notice: 'Simulated · no OBS source was created' });
  expect(store.getSnapshot().beats.at(-1)?.text).toBe('Simulated: 1 source would be added. No OBS source was created.');
});

test('add every output skips what is already added and the Lot plate', async () => {
  const model = createStreamSetup({ mode: 'fixture' });
  detach = attachStreamSetup(model);
  await model.add('offering-altar');
  const store = createDockStore();
  store.open(addAllFlow);
  for (const answer of ['keep', '720p', 'ok']) store.answer('stream', answer);
  await store.seal('stream');
  expect(model.getSnapshot().rows.filter(row => row.phase === 'added').map(row => row.id)).toEqual(['offering-altar', 'gilded-frame', 'hype-border']);
  expect(model.getSnapshot().rows.find(row => row.href)?.phase).toBe('unavailable');
});
