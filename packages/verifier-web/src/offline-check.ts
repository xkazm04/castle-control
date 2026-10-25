// Dependency-free execution of the parity acceptance check before Director install.
import assert from 'node:assert/strict';
import fixture from './simulated-writs.json' with { type: 'json' };
import { animationCast, verifyDecodedWrit } from './index.ts';

assert.equal(fixture.label, 'simulated');
assert.equal(fixture.cases.length, 1000);
let verified = 0;
let unverified = 0;
for (const item of fixture.cases) {
  const result = await verifyDecodedWrit(item.writ, fixture.chain);
  assert.deepEqual(result.computed_winners, item.winners);
  if (item.writ.proof.source === 'streamer_commit') {
    verified++;
    assert.equal(result.status, 'verified');
    assert.equal(result.label, 'streamer-controlled');
    assert.deepEqual(animationCast(result), item.winners);
  } else {
    unverified++;
    assert.equal(result.status, 'unverified');
    assert.throws(() => animationCast(result), /Unverified/);
  }
}
assert.equal(verified, 900);
assert.equal(unverified, 100);
const beaconCase = fixture.cases[0];
if (!beaconCase) throw new Error('Missing simulated beacon');
await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, genesis_time: '2026-10-25T00:00:03Z' }), /schedule/);
await assert.rejects(verifyDecodedWrit(beaconCase.writ, { ...fixture.chain, hash: '00'.repeat(32) }), /chain/);
console.log('same_winners_as_rust_across_1000_generated_simulated_writs: PASS (900 streamer-controlled; 100 beacon-unverified)');
