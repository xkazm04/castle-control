// Generated SIMULATED peers only; no real OBS, passwords or browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmObsCleanup, waitForObs } from './obs-ready.ts';

test('OBS readiness retries handshake and RPC outages, closing each failed peer', async () => {
  let attempts = 0, closed = 0;
  const ready = { request: async () => ({}), close() { closed++; } };
  const result = await waitForObs(async timeout => {
    assert.ok(timeout > 0 && timeout <= 3_000);
    attempts++;
    if (attempts === 1) throw new Error('SIMULATED listener starting');
    if (attempts === 2) return { close() { closed++; }, request: async () => { throw new Error('SIMULATED RPC starting'); } };
    return ready;
  }, 2_000);
  assert.equal(result, ready);
  assert.equal(attempts, 3);
  assert.equal(closed, 1);
});

test('OBS readiness expires with a fixed diagnostic instead of leaking peer text', async () => {
  await assert.rejects(waitForObs(async () => { throw new Error('SIMULATED private peer detail'); }, 20),
    /^Error: Isolated OBS readiness failed after \d+ attempts within 20 ms$/);
});

const scene = 'SIMULATED rehearsal scene', source = 'SIMULATED owned source';
function peer(inputs: string[], items: string[] | undefined) {
  return { close() { /* SIMULATED peer owns no socket. */ }, async request(method: string) {
    if (method === 'GetInputList') return { inputs: inputs.map(inputName => ({ inputName })) };
    if (method === 'GetSceneList') return { scenes: items === undefined ? [] : [{ sceneName: scene }] };
    if (method === 'GetSceneItemList') return { sceneItems: items?.map(sourceName => ({ sourceName })) };
    throw new Error('Unexpected SIMULATED OBS request');
  } };
}

test('cleanup accepts an absent scene and an empty retained scene', async () => {
  assert.deepEqual(await confirmObsCleanup(peer([], undefined), scene, [source]), { scene_exists: false, scene_items: [] });
  assert.deepEqual(await confirmObsCleanup(peer([], []), scene, [source]), { scene_exists: true, scene_items: [] });
});

test('cleanup fails on orphaned global inputs or remaining owned scene items', async () => {
  for (const obs of [peer([source], undefined), peer([], [source])]) {
    await assert.rejects(confirmObsCleanup(obs, scene, [source], 0), /cleanup failed: rehearsal inputs or scene items remain/);
  }
});

test('cleanup refuses missing inventory fields rather than treating them as empty', async () => {
  await assert.rejects(confirmObsCleanup({ close() {}, request: async () => ({}) }, scene, [source]), /Invalid isolated OBS inputs response/);
});
