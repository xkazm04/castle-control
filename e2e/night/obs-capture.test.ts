// Generated SIMULATED scene/activity data only; no real OBS or credentials.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withProgramScene } from './obs-capture.ts';

const scene = 'SIMULATED rehearsal', source = 'SIMULATED Lot plate';
function peer(activeAfter = 1) {
  let current = 'SIMULATED original', probes = 0;
  const selected: string[] = [];
  return { selected, current: () => current, probes: () => probes,
    async request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
      if (method === 'GetCurrentProgramScene') return { currentProgramSceneName: current };
      if (method === 'SetCurrentProgramScene') {
        assert.equal(typeof params.sceneName, 'string');
        current = String(params.sceneName); selected.push(current); return {};
      }
      if (method === 'GetSourceActive') {
        assert.equal(params.sourceName, source);
        const active = current === scene && ++probes >= activeAfter;
        return { videoActive: active, videoShowing: active };
      }
      throw new Error('Unexpected SIMULATED OBS request');
    } };
}

test('capture waits for sustained Program activity and restores the previous scene', async () => {
  const obs = peer(2);
  let captured = false;
  await withProgramScene(obs, scene, [source], async () => {
    assert.equal(obs.current(), scene);
    assert.ok(obs.probes() >= 2, 'capture must not run while CEF is inactive');
    captured = true;
  });
  assert.ok(captured);
  assert.deepEqual(obs.selected, [scene, 'SIMULATED original']);
  assert.equal(obs.current(), 'SIMULATED original');
});

test('capture failure still restores Program before the core clears sources', async () => {
  const obs = peer();
  await assert.rejects(withProgramScene(obs, scene, [source], async () => {
    throw new Error('SIMULATED blank plate');
  }), /SIMULATED blank plate/);
  assert.equal(obs.current(), 'SIMULATED original');
});

test('inactive source fails within the readiness budget without capturing and restores Program', async () => {
  const obs = peer(Infinity);
  let captured = false;
  await assert.rejects(withProgramScene(obs, scene, [source], async () => { captured = true; }, 0), /capture scene did not become active/);
  assert.equal(captured, false);
  assert.equal(obs.current(), 'SIMULATED original');
});

test('missing program inventory fails before changing the isolated scene', async () => {
  let changed = false;
  await assert.rejects(withProgramScene({ async request(method: string) {
    if (method === 'SetCurrentProgramScene') changed = true;
    return {};
  } }, scene, [source], async () => { throw new Error('Must not capture'); }), /Invalid isolated OBS program scene response/);
  assert.equal(changed, false);
});
