import type { LotsDraw, LotsHandle, LotsProofRoll, LotsSealedRoll } from '@castle-control/contract';
import type { FixtureEntry } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { commitmentOf, sealOf } from '../../lots-cast.js';

// Explicit simulated session clock/seed: reproducible rehearsal, never live time
// or entropy. The caller may inject a clock when testing the seal protocol.
export const rehearsalSeed = '01'.repeat(32);
export const rehearsalClock = () => new Date('2026-10-31T12:00:00Z');
export async function prepareFixtureRoll(draw: LotsDraw, entries: readonly FixtureEntry[], at: Date): Promise<LotsSealedRoll> {
  const roll: LotsProofRoll = { version: 1, entries: entries.map(({ handle, weight }) => ({ handle, weight })),
    winner_count: draw.rules.winner_count, sealed_at: at.toISOString().replace(/\.\d{3}Z$/, 'Z'), margin_s: 6,
    randomness: { source: 'streamer_commit', commitment: await commitmentOf(rehearsalSeed) } };
  return freezeFixture({ roll, seal: await sealOf(roll) });
}

export function respectsCaps(draw: LotsDraw, entries: readonly FixtureEntry[], winners: readonly LotsHandle[]): boolean {
  return draw.rules.cohort_caps.every(cap => winners.filter(handle => entries.find(entry => entry.handle === handle)?.cohort === cap.cohort).length
    <= Math.floor(winners.length * cap.numerator / cap.denominator));
}

/** Feasibility preflight only. Never supplies the displayed result or writ.
 * Actual winners come exclusively from the v1 cast of the sealed roll. */
export function simulateCast(draw: LotsDraw, entries: readonly FixtureEntry[]): readonly LotsHandle[] {
  let seed = 0x1234abcd;
  let pool = [...entries];
  const winners: FixtureEntry[] = [];
  while (winners.length < draw.rules.winner_count) {
    pool = pool.filter(entry => draw.rules.cohort_caps.every(cap => entry.cohort !== cap.cohort
      || winners.filter(winner => winner.cohort === cap.cohort).length < Math.floor(draw.rules.winner_count * cap.numerator / cap.denominator)));
    if (!pool.length) throw new Error(copy.insufficient);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    let target = seed / 0x1_0000_0000 * pool.reduce((sum, entry) => sum + entry.weight, 0);
    const index = pool.findIndex(entry => { target -= entry.weight; return target < 0; });
    const winner = pool.splice(index, 1)[0];
    if (!winner) throw new Error(copy.empty);
    winners.push(winner);
  }
  return Object.freeze(winners.map(entry => entry.handle));
}

export function freezeFixture<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeFixture(child);
    Object.freeze(value);
  }
  return value;
}
