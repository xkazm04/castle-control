import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import publicWrits from './public-writs.json' with { type: 'json' };
import simulated from './simulated-writs.json' with { type: 'json' };
import { verifyBeaconRound } from './beacon.ts';
import { animationCast, verifyDecodedWrit } from './index.ts';
import { checkWrit } from './schema.ts';

const beacons = publicWrits.cases.map((item) => {
  const writ = checkWrit(item.writ);
  if (writ.proof.source !== 'drand_quicknet' || writ.roll.randomness.source !== 'drand_quicknet') {
    throw new Error('Expected official beacon fixture');
  }
  return { round: writ.roll.randomness.round, signature: writ.proof.signature, randomness: writ.proof.randomness };
});

test.each(publicWrits.cases)('official_quicknet_round_$round_verifies_in_web', async (item) => {
  const beacon = beacons.find((b) => b.round === item.round);
  expect(await verifyBeaconRound(beacon, publicWrits.chain)).toBe(beacon?.randomness);
  const result = await verifyDecodedWrit(item.writ, publicWrits.chain);
  expect(result.status).toBe('verified');
  expect(animationCast(result)).toEqual(item.winners);
});

test('invalid_round_signature_is_rejected_in_browser', async () => {
  const first = beacons[0];
  const second = beacons[1];
  const firstCase = publicWrits.cases[0];
  if (!first || !second || !firstCase) throw new Error('Missing public fixtures');
  const wrong = { ...second, round: first.round };
  await expect(verifyBeaconRound(wrong, publicWrits.chain)).rejects.toThrow('BLS signature');
  const writ = checkWrit(firstCase.writ);
  await expect(verifyDecodedWrit({ ...writ, proof: {
    source: 'drand_quicknet', signature: wrong.signature, randomness: wrong.randomness,
  } }, publicWrits.chain)).rejects.toThrow('BLS signature');
});

test('malformed_identity_and_non_subgroup_signatures_and_keys_are_rejected', async () => {
  const original = beacons[0];
  if (!original) throw new Error('Missing public fixture');
  // x=0,y=2 is a G1 curve point outside the prime-order subgroup.
  for (const signature of ['00'.repeat(48), 'c0' + '00'.repeat(47), '80' + '00'.repeat(47)]) {
    const randomness = createHash('sha256').update(Buffer.from(signature, 'hex')).digest('hex');
    await expect(verifyBeaconRound({ ...original, signature, randomness }, publicWrits.chain)).rejects.toThrow('BLS signature');
  }
  for (const public_key of ['00'.repeat(96), 'c0' + '00'.repeat(95), simulated.chain.public_key]) {
    await expect(verifyBeaconRound(original, { ...publicWrits.chain, public_key })).rejects.toThrow('BLS signature');
  }
});

test('round_value_and_boundary_tampering_are_rejected', async () => {
  const original = beacons[0];
  if (!original) throw new Error('Missing public fixture');
  await expect(verifyBeaconRound({ ...original, randomness: '00'.repeat(32) }, publicWrits.chain)).rejects.toThrow('randomness');
  await expect(verifyBeaconRound({ ...original, round: 1 }, publicWrits.chain)).rejects.toThrow();
  await expect(verifyBeaconRound({ ...original, round: '01' }, publicWrits.chain)).rejects.toThrow();
  await expect(verifyBeaconRound({ ...original, extra: true }, publicWrits.chain)).rejects.toThrow();
  await expect(verifyBeaconRound(original, { ...publicWrits.chain, scheme: 'unchained' })).rejects.toThrow('scheme');
  await expect(verifyBeaconRound(original, { ...publicWrits.chain, period_s: 30 })).rejects.toThrow();
});

test('trust_anchor_snapshot_is_owned_before_async_hashing', async () => {
  const original = publicWrits.cases[0];
  if (!original) throw new Error('Missing public fixture');
  const anchor = { ...publicWrits.chain };
  const pending = verifyDecodedWrit(original.writ, anchor);
  anchor.public_key = simulated.chain.public_key;
  expect((await pending).status).toBe('verified');
});
