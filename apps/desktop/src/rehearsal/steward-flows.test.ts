import { afterEach, expect, test, vi } from 'vitest';
import { createDockStore } from '@castle-control/ui/steward-flow';
import { attachRehearsal } from './rehearsal-bridge.js';
import type { RehearsalBridge } from './rehearsal-bridge.js';
import { submitConnection } from './rehearsal.jsx';
import { simulatedRehearsal } from './rehearsal-test-support.js';
import { cleanupFlow, connectFlow, rehearsalSteward, scenarioFlow, sceneFlow } from './steward-flows.js';
import { createRehearsalModel } from './rehearsal-model.js';

let detach: (() => void) | undefined;
afterEach(() => { detach?.(); detach = undefined; });

/** A page stand-in: an uncontrolled masked field the seal may read once, never a stored value. */
function page(model: RehearsalBridge['model']) {
  const field = { value: '' };
  const connect = vi.fn(async (choice: { host: string; port: number; remember: boolean }) => {
    await submitConnection({ host: choice.host, port: String(choice.port), password: field, remember: choice.remember }, model);
    return true;
  });
  const notify = vi.fn();
  detach = attachRehearsal({ model, connect, hasPassword: () => field.value.length > 0, notify });
  return { field, connect, notify };
}

test('chips: connect, scene, scenario and catch-up; clean up opens from words', () => {
  const steward = rehearsalSteward({ mode: 'core', phase: 'ready' });
  expect(steward.flows.filter(flow => flow.chip).map(flow => flow.chip)).toEqual(['Connect my OBS', 'Set up the scene', 'Run a scenario']);
  expect(cleanupFlow.intents).toContain('clean up');
  expect(scenarioFlow.simulated).toBe(true);
});

test('without the desktop rehearsal every seal is honest and sends nothing', async () => {
  detach = attachRehearsal({ model: createRehearsalModel({ mode: 'fixture' }), connect: vi.fn(), hasPassword: () => false, notify: vi.fn() });
  const store = createDockStore();
  store.open(connectFlow);
  for (const answer of ['local', 'default', 'no', 'once']) store.answer('rehearsal', answer);
  await store.seal('rehearsal');
  expect(store.getSnapshot().beats.at(-1)?.text).toBe('Dress rehearsal needs the desktop app, so nothing was sent to OBS or the core.');
});

test('connect reads the masked field once at the seal, clears it, and never puts it in a draft or a beat', async () => {
  const { model, rpc } = simulatedRehearsal(); await model.refresh();
  const { field, connect, notify } = page(model);
  const store = createDockStore();
  store.open(connectFlow);
  for (const answer of ['other', '192.168.1.20', 'other', '4466', 'yes', 'remember']) store.answer('rehearsal', answer);
  expect(store.getSnapshot().drafts.rehearsal?.draft).toEqual({ where: 'other', host: '192.168.1.20', port_mode: 'other', port: 4466, secret: 'yes', remember: true });
  // An empty field refuses the seal and says where to type.
  await store.seal('rehearsal');
  expect(connect).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledOnce();
  expect(store.getSnapshot().sessions.rehearsal?.state.status).toBe('open');
  const secret = ['SIMULATED', 'field', 'only'].join('-');
  field.value = secret;
  rpc.mockClear();
  await store.seal('rehearsal');
  expect(connect).toHaveBeenCalledExactlyOnceWith({ host: '192.168.1.20', port: 4466, remember: true });
  expect(rpc.mock.calls.find(call => call[2] === 'obs.connect')?.[3]).toEqual({ host: '192.168.1.20', port: 4466, password: secret, remember: true });
  expect(field.value).toBe('');
  expect(JSON.stringify(store.getSnapshot())).not.toContain(secret);
  expect(JSON.stringify(model.getSnapshot())).not.toContain(secret);
  expect(store.getSnapshot().beats.at(-1)?.text).toBe('OBS is connected at 192.168.1.20:4466.');
});

test('the scene flow ensures the scene, then adds only the picked sources at the chosen size', async () => {
  const { model, rpc } = simulatedRehearsal(); await model.refresh();
  page(model);
  const store = createDockStore();
  store.open(sceneFlow);
  for (const answer of ['ensure', 'vote', '720p']) store.answer('rehearsal', answer);
  rpc.mockClear();
  await store.seal('rehearsal');
  const methods = rpc.mock.calls.map(call => call[2]);
  expect(methods).toContain('obs.scene.ensure');
  const created = rpc.mock.calls.filter(call => call[2] === 'obs.source.create').map(call => call[3]);
  expect(created).toEqual([expect.objectContaining({ source_name: 'Castle Control · Gatehouse vote bar', width: 1280, height: 720 })]);
  expect(model.getSnapshot().rows.find(row => row.kind === 'vote')?.phase).toBe('added');
});

test('scenario and clean up call the model only from their seal', async () => {
  const { model, rpc } = simulatedRehearsal(); await model.refresh();
  page(model);
  const store = createDockStore();
  store.open(scenarioFlow);
  store.answer('rehearsal', 'vote_round');
  expect(rpc.mock.calls.some(call => call[2] === 'rehearsal.scenario.run')).toBe(false);
  await store.seal('rehearsal');
  expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.scenario.run').map(call => call[3])).toEqual([{ scenario: 'vote_round' }]);
  store.open(cleanupFlow);
  store.answer('rehearsal', 'sources');
  await store.seal('rehearsal');
  expect(rpc.mock.calls.some(call => call[2] === 'obs.rehearsal.clear')).toBe(true);
});
