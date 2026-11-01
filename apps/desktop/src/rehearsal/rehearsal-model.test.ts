import { expect, test, vi } from 'vitest';
import { createRehearsalModel } from './rehearsal-model.js';
import { createRehearsalPort, methods } from './rehearsal-core.js';
import { simulatedDraw, simulatedRehearsal, simulatedVisual } from './rehearsal-test-support.js';

test('fixture never touches the core or shell; native unavailable does not become a simulated workspace', async () => {
  const { connection, rpc } = simulatedRehearsal();
  const shell = vi.fn(async () => undefined);
  const fixture = createRehearsalModel({ mode: 'fixture', connection, shell });
  await fixture.refresh(); await fixture.switchMode();
  expect(fixture.getSnapshot().phase).toBe('outside');
  expect(fixture.shell_available).toBe(false);
  expect(rpc).not.toHaveBeenCalled(); expect(shell).not.toHaveBeenCalled();
  rpc.mockRejectedValue({ code: 'unavailable', message: 'SIMULATED unavailable' });
  const native = createRehearsalModel({ mode: 'core', connection, shell });
  await native.refresh(); await native.switchMode();
  expect(native.getSnapshot()).toMatchObject({ phase: 'outside', status: undefined, rows: [] });
  expect(shell).toHaveBeenCalledExactlyOnceWith('enter_rehearsal');
  const offline = createRehearsalModel({ mode: 'core' });
  await offline.refresh(); expect(offline.getSnapshot().phase).toBe('outside');
});

test('only a successful schema-parsed start establishes rehearsal and the leave command', async () => {
  const { connection, rpc } = simulatedRehearsal();
  const shell = vi.fn(async () => undefined);
  const model = createRehearsalModel({ mode: 'core', connection, shell });
  await model.refresh(); await model.switchMode();
  expect(model.getSnapshot().phase).toBe('inside');
  expect(shell).toHaveBeenCalledExactlyOnceWith('leave_rehearsal');
  rpc.mockResolvedValue({ active: true });
  const broken = createRehearsalModel({ mode: 'core', connection });
  await broken.refresh(); expect(broken.getSnapshot().phase).toBe('outside');
});

test('visual selection retains the schema-branded catalog value and refuses unknown DOM values', async () => {
  const { model } = simulatedRehearsal();
  await model.refresh();
  const visual = model.getSnapshot().visuals[0]!;
  const selected: typeof visual.visual_id | '' = model.getSnapshot().visual_id;
  expect(selected).toBe(visual.visual_id);
  model.setVisual('unconfigured');
  expect(model.getSnapshot().visual_id).toBe(visual.visual_id);
  model.setVisual(visual.visual_id);
  expect(model.getSnapshot().visual_id).toBe(visual.visual_id);
});

test('rows use the real rehearsal draw ID, individual sizes, owned source names and the existing scene', async () => {
  const { model, rpc, fill, duel } = simulatedRehearsal();
  await model.refresh();
  expect(model.getSnapshot().rows.find(row => row.kind === 'lot')?.notice).toBe('Fill a Lot first');
  expect(model.getSnapshot().rows.find(row => row.kind === 'duel')?.phase).toBe('coming');
  expect(model.canAdd('vote')).toBe(false);
  fill(); duel(); await model.refresh(); await model.ensureScene();
  expect(model.setPreset('lot', '720p')).toBe(true);
  expect(model.setPreset('vote', 'vertical')).toBe(true);
  expect(model.setPreset('lot', '4k')).toBe(false);
  rpc.mockClear();
  for (const id of ['lot', 'vote', `beacon:${simulatedVisual.visual_id}`, 'duel']) await model.add(id);
  const writes = rpc.mock.calls.filter(call => call[2] === 'obs.source.create').map(call => call[3]);
  expect(writes).toHaveLength(4);
  expect(writes[0]).toEqual({ scene_name: 'Castle Control · Rehearsal', source_name: 'Castle Control · Lot plate',
    url: `http://localhost:4821/lots/${simulatedDraw.draw_id}`, width: 1280, height: 720 });
  expect(writes[1]).toMatchObject({ width: 1080, height: 1920 });
  expect(writes[2]).toMatchObject({ width: 1920, height: 1080 });
  expect(rpc.mock.calls.find(call => call[2] === 'lots.source.url')?.[3]).toEqual({ draw_id: simulatedDraw.draw_id });
  expect(model.canAdd('lot')).toBe(false);
  expect(JSON.stringify(model.getSnapshot())).not.toContain('http://');
  await model.clear();
  expect(model.getSnapshot().scene_notice).toBe('Removed 3 rehearsal sources.');
});

test('connection errors display only the parsed core message; no password enters a snapshot', async () => {
  const { model, rpc } = simulatedRehearsal();
  await model.refresh();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args) => {
    if (args[2] === 'obs.connect') throw { code: 'unavailable', message: 'SIMULATED peer refused connection', detail: { private: 'do not display' } };
    return original(...args);
  });
  await model.connect({ host: '127.0.0.1', port: 4466, password: '', remember: false });
  expect(model.getSnapshot()).toMatchObject({ obs: 'disconnected', scene_ready: false, connection_notice: 'SIMULATED peer refused connection' });
  expect(JSON.stringify(model.getSnapshot())).not.toMatch(/password|do not display/);
  await model.connect({ host: '127.0.0.1', port: 100000, password: '', remember: false });
  expect(model.getSnapshot().connection_notice).toBe('Check the request fields and try again.');
});

test('scenario calls use existing identifiers and only beacon_fire supplies the selected visual', async () => {
  const { model, rpc } = simulatedRehearsal();
  await model.refresh(); rpc.mockClear();
  for (const scenario of ['lots_fill', 'vote_round', 'beacon_fire', 'duel_round'] as const) await model.scenario(scenario);
  expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.scenario.run').map(call => call[3])).toEqual([
    { scenario: 'lots_fill' }, { scenario: 'vote_round' }, { scenario: 'beacon_fire', visual_id: simulatedVisual.visual_id }, { scenario: 'duel_round' },
  ]);
});

test('crowd debounces, validates bounds and cancels on teardown', async () => {
  vi.useFakeTimers();
  const { model, rpc } = simulatedRehearsal();
  try {
    await model.refresh(); rpc.mockClear();
    expect(model.setCrowd(-1)).toBe(false); expect(model.setCrowd(601)).toBe(false); expect(model.setCrowd(1.5)).toBe(false);
    model.setCrowd(0); model.setCrowd(600); model.setCrowd(42);
    await vi.advanceTimersByTimeAsync(299); expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.crowd.set').map(call => call[3])).toEqual([{ per_minute: 42 }]);
    expect(model.getSnapshot().crowd).toBe(42);
    rpc.mockClear();
    const stop = model.start();
    await vi.advanceTimersByTimeAsync(0);
    model.setCrowd(100); stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(rpc.mock.calls.some(call => call[2] === 'rehearsal.crowd.set')).toBe(false);
  } finally { vi.useRealTimers(); }
});

test('a pending crowd change survives a slow scene mutation, which is single-flight', async () => {
  vi.useFakeTimers();
  const { model, rpc } = simulatedRehearsal();
  let finish: ((result: unknown) => void) | undefined;
  try {
    await model.refresh();
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (...args) => args[2] === 'obs.scene.ensure'
      ? new Promise(resolve => { finish = resolve; }) : original(...args));
    model.setCrowd(600);
    const scene = model.ensureScene();
    await model.ensureScene();
    await vi.advanceTimersByTimeAsync(400);
    expect(rpc.mock.calls.filter(call => call[2] === 'obs.scene.ensure')).toHaveLength(1);
    expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.crowd.set')).toHaveLength(0);
    finish?.({ created: true }); await scene;
    await vi.advanceTimersByTimeAsync(300);
    expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.crowd.set').map(call => call[3])).toEqual([{ per_minute: 600 }]);
  } finally { vi.useRealTimers(); }
});

test('late status reads cannot overwrite a connection mutation', async () => {
  const { model, rpc, status } = simulatedRehearsal();
  await model.refresh();
  let finish: ((value: unknown) => void) | undefined;
  rpc.mockImplementationOnce(async () => new Promise(resolve => { finish = resolve; }));
  const read = model.refresh();
  const connect = model.connect({ host: '127.0.0.1', port: 4466, password: '', remember: false });
  await connect;
  finish?.({ ...status, obs: { connected: false } }); await read;
  expect(model.getSnapshot().obs).toBe('connected');
  expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.start')).toHaveLength(3);
});

test('status echoes do not loop; external OBS/Lots invalidations refetch and stopped reads stay stopped', async () => {
  const { model, rpc, status, emit, fill } = simulatedRehearsal();
  const stop = model.start();
  await vi.waitFor(() => expect(model.getSnapshot().rows.length).toBe(4));
  expect(rpc.mock.calls.filter(call => call[2] === 'rehearsal.start')).toHaveLength(1);
  status.obs = { connected: false }; fill(); emit('obs.status');
  await vi.waitFor(() => expect(model.getSnapshot().obs).toBe('disconnected'));
  await vi.waitFor(() => expect(model.getSnapshot().rows[0]?.draw_id).toBe(simulatedDraw.draw_id));
  rpc.mockClear(); stop(); emit('lots.roll');
  await model.refresh(); expect(rpc).not.toHaveBeenCalled();
});

test('invalid launch, malformed results and malformed URLs stop at the schema door', async () => {
  const { connection, rpc } = simulatedRehearsal();
  expect(() => createRehearsalPort({ ...connection, launch: { ...connection.launch, endpoint: 'https://example.com/' } })).toThrow();
  const call = createRehearsalPort(connection);
  rpc.mockResolvedValue({ url: 'https://example.com/overlay' });
  await expect(call(methods.lotsSourceUrl, { draw_id: simulatedDraw.draw_id })).rejects.toThrow();
  rpc.mockClear();
  await expect(call(methods.rehearsalCrowdSet, { per_minute: 601 })).rejects.toMatchObject({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
});
