import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { LotsProofRoll, LotsWrit } from '@castle-control/contract';
import { lotsWritGet } from '@castle-control/contract/lots';
import { parseJson } from '@castle-control/contract/door';
import { castWinners, commitmentOf, sealOf, verifyWrit } from './lots-cast.js';
import { fixtureEntries, fixtureWrit } from './lots-fixture.js';
import { revealedAt } from './rooms/lottery/reveal.js';

test('cc-verify v1 Rust corpus pins all 900 streamer-controlled desktop casts', async () => {
  const fixture = parseJson(readFileSync(new URL('../../../packages/verifier-web/src/simulated-writs.json', import.meta.url), 'utf8'));
  if (!fixture || typeof fixture !== 'object' || !('label' in fixture) || fixture.label !== 'simulated'
    || !('cases' in fixture) || !Array.isArray(fixture.cases)) throw new Error('Missing simulated parity inventory');
  const cases = fixture.cases.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('writ' in value) || !lotsWritGet.result(value.writ)
      || !('winners' in value) || !Array.isArray(value.winners)
      || !value.winners.every((winner: unknown) => typeof winner === 'string')) throw new Error('Invalid parity case');
    return { writ: value.writ, winners: value.winners };
  }).filter(item => item.writ.proof.source === 'streamer_commit');
  expect(cases).toHaveLength(900);
  for (const item of cases) await expect(verifyWrit(item.writ)).resolves.toEqual(item.winners);
});

test('cc-verify v1 reference vector pins seal, commitment and winner parity', async () => {
  expect(await verifyWrit(fixtureWrit)).toEqual(['simulated_01', 'simulated_00']);
  await expect(verifyWrit({ ...fixtureWrit, seal: `0${fixtureWrit.seal.slice(1)}` })).rejects.toThrow();
  await expect(verifyWrit({ ...fixtureWrit, winners: [...fixtureWrit.winners].reverse() })).rejects.toThrow();
  await expect(verifyWrit({ ...fixtureWrit, proof: { source: 'streamer_commit', seed: '00'.repeat(32) } })).rejects.toThrow();
});

test('87-entry fixed-seed casts are deterministic, distinct, eligible and recomputable', async () => {
  const seed = '01'.repeat(32);
  const roll: LotsProofRoll = { version: 1, entries: fixtureEntries().map(({ handle, weight }) => ({ handle, weight })),
    winner_count: 3, sealed_at: '2026-10-31T12:00:00Z', margin_s: 6,
    randomness: { source: 'streamer_commit', commitment: await commitmentOf(seed) } };
  const seal = await sealOf(roll);
  const winners = await castWinners(seed, seal, roll);
  expect(await castWinners(seed, seal, roll)).toEqual(winners);
  expect(new Set(winners).size).toBe(3);
  expect(winners.every(winner => roll.entries.some(entry => entry.handle === winner))).toBe(true);
  const writ: LotsWrit = { roll, seal, proof: { source: 'streamer_commit', seed }, winners: [...winners] };
  expect(await verifyWrit(writ)).toEqual(winners);
});

test('reveal clock mirrors renderer flourish and cadence, with immediate reduced motion', () => {
  expect([0, 1199, 1200, 2100, 3000, 9000].map(time => revealedAt(time, 3, { reduced_motion: false })))
    .toEqual([0, 0, 1, 2, 3, 3]);
  expect(revealedAt(0, 3, { reduced_motion: true })).toBe(3);
  expect(revealedAt(0, 0, { reduced_motion: true })).toBe(0);
});
