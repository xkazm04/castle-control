import type { StudioBoard } from './board.js';
import { nextSeed, runRehearsal } from './rehearsal.js';
import type { RehearsalSetup } from './rehearsal.js';
import { balanceReport } from './rehearsal-verdict.js';
import type { VerdictKind } from './rehearsal-verdict.js';

/** How many seeds a comparison row plays. One seed can mislead (a crowd of 300 may stall once), twelve say what a board tends to do. */
export const sweepRounds = 12;
export type KindCount = Readonly<{ kind: VerdictKind; count: number }>;
export type Sweep = Readonly<{ rounds: number; kinds: readonly KindCount[] }>;

const order: readonly VerdictKind[] = ['runaway', 'contested', 'tight', 'stalemate'];

/** The setup's own seed, then the seeds that follow from it, so a sweep is as repeatable as a single round. */
export function sweepSeeds(seed: string, rounds = sweepRounds): readonly string[] {
  const seeds: string[] = [];
  let current = seed;
  for (let round = 0; round < rounds; round += 1) { seeds.push(current); current = nextSeed(current); }
  return seeds;
}

/** Plays the board once per seed with the same crowd and turns and counts how each round ended, most common first.
 * Returns undefined if the board cannot be rehearsed (the caller reports the setup error it already has). */
export function sweepBoard(board: StudioBoard, setup: RehearsalSetup, rounds = sweepRounds): Sweep | undefined {
  const counts = new Map<VerdictKind, number>();
  for (const seed of sweepSeeds(setup.seed, rounds)) {
    const run = runRehearsal(board, { ...setup, seed });
    if (!run.ok) return undefined;
    const { kind } = balanceReport(run.rehearsal);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = order.flatMap(kind => (counts.has(kind) ? [{ kind, count: counts.get(kind) ?? 0 }] : []))
    .sort((a, b) => b.count - a.count);
  return Object.freeze({ rounds, kinds: Object.freeze(kinds.map(entry => Object.freeze(entry))) });
}
