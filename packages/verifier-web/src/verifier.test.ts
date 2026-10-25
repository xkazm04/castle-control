import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fixture from './simulated-writs.json' with { type: 'json' };
import { animationCast, sample, verifyDecodedWrit } from './index.ts';
import { checkWrit, roundNumber, timestamp } from './schema.ts';

test('same_winners_as_rust_across_1000_generated_simulated_writs', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./offline-check.ts', import.meta.url))], { encoding: 'utf8' });
  expect(output).toContain('same_winners_as_rust_across_1000_generated_simulated_writs: PASS');
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

test('beacon_signature_dependency_is_explicitly_unverified', async () => {
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
  await expect(verifyDecodedWrit(original.writ, fixture.chain)).resolves.toMatchObject({ status: 'unverified' });
  await expect(verifyDecodedWrit(original.writ, { ...fixture.chain, hash: '00'.repeat(32) })).rejects.toThrow('chain');
  await expect(verifyDecodedWrit(original.writ, { ...fixture.chain, genesis_time: '2026-10-25T00:00:03Z' })).rejects.toThrow('schedule');
});

test.todo('invalid_round_signature_is_rejected_in_browser_after_noble_curves_install');

test('single_html_is_reproducible_and_has_no_remote_resources', () => {
  const htmlPath = new URL('../index.html', import.meta.url);
  const before = readFileSync(htmlPath, 'utf8');
  execFileSync(process.execPath, [fileURLToPath(new URL('./generate.ts', import.meta.url))]);
  expect(readFileSync(htmlPath, 'utf8')).toBe(before);
  expect(before).not.toMatch(/<script[^>]*\bsrc=/i);
  expect(before).not.toContain('JSON.parse');
  expect(before).toContain('File import unavailable');
  expect(before).toContain('UNVERIFIED');
});

test('self_contained_html_runs_both_examples', () => {
  const output = execFileSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(new URL('./html-smoke.ts', import.meta.url))], { encoding: 'utf8' });
  expect(output).toContain('self_contained_html_runs_both_examples: PASS');
});
