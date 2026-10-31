import type { LotsDraw, LotsHandle } from '@castle-control/contract';
import type { FixtureEntry } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';

/** Fixed-seed UI rehearsal only, deliberately NOT a cc-verify cast or proof.
 * Uses no payment, public randomness, network or live authority. */
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
