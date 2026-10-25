import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import fixture from './simulated-writs.json' with { type: 'json' };
import { animationCast, sample, verifyDecodedWrit } from './index.ts';
import { checkWrit, roundNumber, timestamp } from './schema.ts';
import { checkGeneratedWrits } from './parity-check.ts';
import { checkHtml } from './html-check.ts';
import { sourceFingerprint } from './artifact.ts';

test('same_winners_as_rust_across_1000_generated_simulated_writs', async () => {
  expect(await checkGeneratedWrits()).toEqual({ offline: 900, beacons: 100 });
}, 30000);

test('tampering_with_sealed_fields_or_claimed_winners_fails', async () => {
  const original = fixture.cases[1];
  if (!original) throw new Error('Missing simulated case');
  const writ = checkWrit(original.writ);
  await expect(verifyDecodedWrit({ ...writ, roll: { ...writ.roll, margin_s: 99 } })).rejects.toThrow('Seal mismatch');
  await expect(verifyDecodedWrit({ ...writ, winners: ['simulated_intruder'] })).rejects.toThrow();
  const seed = writ.proof.source === 'streamer_commit' ? writ.proof.seed : '';
  await expect(verifyDecodedWrit({ ...writ, proof: { source: 'streamer_commit', seed: '00'.repeat(32) } }))
    .rejects.toThrow('commitment mismatch');
  expect(seed).not.toBe('00'.repeat(32));
});

test('unknown_fields_and_noncanonical_values_are_rejected', () => {
  const original = fixture.cases[1];
  if (!original) throw new Error('Missing simulated case');
  const writ = checkWrit(original.writ);
  expect(() => checkWrit({ ...writ, unknown: true })).toThrow();
  expect(() => checkWrit({ ...writ, roll: { ...writ.roll, unknown: true } })).toThrow();
  expect(() => checkWrit({ ...writ, proof: { ...writ.proof, unknown: true } })).toThrow();
  expect(() => checkWrit({ ...writ, roll: { ...writ.roll, randomness: { ...writ.roll.randomness, unknown: true } } })).toThrow();
  expect(() => checkWrit({ ...writ, seal: writ.seal.toUpperCase() })).toThrow();
  for (const round of ['0', '01', '-1', '18446744073709551616']) expect(() => roundNumber(round)).toThrow();
  for (const time of ['1970-02-29T00:00:00Z', '2026-10-25T12:00:00+00:00']) expect(() => timestamp(time)).toThrow();
  expect(timestamp('2000-03-01T00:00:00Z')).toBe(951868800);
});

test('rejection_sampling_discards_biased_tail', () => {
  expect(sample(0xffffffffffffffffn, 3n)).toBeUndefined();
  expect(sample(0xfffffffffffffffen, 3n)).toBe(2n);
  expect(sample(0xffffffffffffffffn, 2n)).toBe(1n);
});

test('schema_snapshot_and_animation_result_cannot_be_mutated_or_forged', async () => {
  const original = fixture.cases[1];
  if (!original) throw new Error('Missing simulated case');
  const writ = checkWrit(original.writ);
  expect(Object.isFrozen(writ.roll.entries)).toBe(true);
  expect(Object.isFrozen(writ.roll.entries[0])).toBe(true);
  const result = await verifyDecodedWrit(writ);
  expect(Object.isFrozen(animationCast(result))).toBe(true);
  expect(() => animationCast({ ...result })).toThrow('Unverified');
});

test('missing_trust_anchor_is_explicitly_unverified', async () => {
  const original = fixture.cases[0];
  if (!original) throw new Error('Missing simulated case');
  const result = await verifyDecodedWrit(original.writ);
  expect(result.status).toBe('unverified');
  expect(result.reason).toContain('BLS signature');
  expect(() => animationCast(result)).toThrow();
});

test('independent_chain_and_strict_round_schedule_are_checked', async () => {
  const original = fixture.cases[0];
  if (!original) throw new Error('Missing simulated beacon');
  await expect(verifyDecodedWrit(original.writ, fixture.chain)).resolves.toMatchObject({ status: 'verified' });
  await expect(verifyDecodedWrit(original.writ, { ...fixture.chain, hash: '00'.repeat(32) })).rejects.toThrow('chain');
  await expect(verifyDecodedWrit(original.writ, { ...fixture.chain, genesis_time: '2026-10-25T00:00:03Z' })).rejects.toThrow('schedule');
});

test('single_html_matches_source_fingerprint_and_has_no_remote_resources', () => {
  const htmlPath = new URL('../index.html', import.meta.url);
  const before = readFileSync(htmlPath, 'utf8');
  expect(before).toContain(`<!-- source-sha256:${sourceFingerprint()} -->`);
  expect(before).not.toMatch(/<script[^>]*\bsrc=/i);
  expect(before).not.toContain('JSON.parse');
  expect(before).toContain('File import unavailable');
  expect(before).toContain('UNVERIFIED');
  expect(before).not.toMatch(/type=["']file["']/);
  expect(before).toContain('The MIT License (MIT)');
});

test('self_contained_html_verifies_all_bundled_writs_and_rejects_bad_bls', async () => {
  await checkHtml(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
});
