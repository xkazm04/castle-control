import assert from 'node:assert/strict';
import generated from './simulated-writs.json' with { type: 'json' };
import { animationCast, verifyDecodedWrit } from './index.ts';
import { checkWrit } from './schema.ts';
import type { Writ } from './schema.ts';

function beaconTuple(writ: Writ) {
  assert.equal(writ.proof.source, 'drand_quicknet');
  assert.equal(writ.roll.randomness.source, 'drand_quicknet');
  if (writ.proof.source !== 'drand_quicknet' || writ.roll.randomness.source !== 'drand_quicknet') {
    throw new Error('Expected simulated beacon');
  }
  return [writ.roll.sealed_at, writ.roll.margin_s, writ.roll.randomness.round,
    writ.roll.randomness.chain_hash, writ.proof.signature] as const;
}

/** The same acceptance check runs in Vitest's worker or directly from Node. */
export async function checkGeneratedWrits(fixture = generated): Promise<{ offline: number; beacons: number; distinct_rounds: number }> {
  assert.equal(fixture.label, 'simulated');
  assert.equal(fixture.cases.length, 1000);
  let offline = 0;
  let beacons = 0;
  const verified = new Map<string, ReturnType<typeof beaconTuple>>();
  for (const item of fixture.cases) {
    const writ = checkWrit(item.writ);
    const tuple = writ.proof.source === 'drand_quicknet' ? beaconTuple(writ) : undefined;
    const key = JSON.stringify(tuple);
    const previous = verified.get(key);
    // Only the exact authenticated schedule, chain and signature may skip BLS.
    if (previous !== undefined) assert.deepEqual(tuple, previous);
    const result = await verifyDecodedWrit(item.writ, previous === undefined ? fixture.chain : undefined);
    assert.deepEqual(result.computed_winners, item.winners);
    if (previous === undefined) {
      assert.equal(result.status, 'verified');
      assert.deepEqual(animationCast(result), item.winners);
      if (tuple !== undefined) verified.set(key, tuple);
    } else {
      assert.equal(result.status, 'unverified');
      assert.throws(() => animationCast(result), /Unverified/);
    }
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
  const beaconCase = fixture.cases.find(item => item.writ.proof.source === 'drand_quicknet');
  if (!beaconCase) throw new Error('Missing simulated beacon');
  await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, genesis_time: '2026-10-25T00:00:03Z' }), /schedule/);
  await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, hash: '00'.repeat(32) }), /chain/);
  return { offline, beacons, distinct_rounds: verified.size };
}
