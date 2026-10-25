import assert from 'node:assert/strict';
import fixture from './simulated-writs.json' with { type: 'json' };
import { animationCast, verifyDecodedWrit } from './index.ts';

/** The same acceptance check runs in Vitest's worker or directly from Node. */
export async function checkGeneratedWrits(): Promise<{ offline: number; beacons: number }> {
  assert.equal(fixture.label, 'simulated');
  assert.equal(fixture.cases.length, 1000);
  let offline = 0;
  let beacons = 0;
  for (const item of fixture.cases) {
    const result = await verifyDecodedWrit(item.writ, fixture.chain);
    assert.deepEqual(result.computed_winners, item.winners);
    assert.equal(result.status, 'verified');
    assert.deepEqual(animationCast(result), item.winners);
    if (item.writ.proof.source === 'streamer_commit') {
      offline++;
      assert.equal(result.label, 'streamer-controlled');
    } else {
      beacons++;
      assert.equal(result.label, 'drand-quicknet');
    }
  }
  assert.equal(offline, 900);
  assert.equal(beacons, 100);
  const beaconCase = fixture.cases[0];
  if (!beaconCase) throw new Error('Missing simulated beacon');
  await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, genesis_time: '2026-10-25T00:00:03Z' }), /schedule/);
  await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, hash: '00'.repeat(32) }), /chain/);
  return { offline, beacons };
}
