import type { DuelItemId } from './list.js';

export interface ClimbStep {
  readonly at: number;
  readonly incumbent: DuelItemId;
  readonly won: boolean;
}
export interface Climb {
  readonly order: readonly DuelItemId[];
  readonly challenger: DuelItemId;
  readonly lo: number;
  readonly hi: number;
  readonly steps: readonly ClimbStep[];
}
export interface ClimbResult {
  readonly place: number;
  readonly order: readonly DuelItemId[];
  readonly fell: DuelItemId | null;
  readonly made_it: boolean;
}

export function startClimb(order: readonly DuelItemId[], challenger: DuelItemId): Climb {
  return { order: order.slice(), challenger, lo: 0, hi: order.length, steps: [] };
}
export const climbDone = (climb: Climb): boolean => climb.lo === climb.hi;
export const climbTarget = (climb: Climb): number | null => climbDone(climb) ? null : (climb.lo + climb.hi) >> 1;
export function climbPick(climb: Climb, challenger_wins: boolean): Climb {
  const at = climbTarget(climb);
  if (at === null) return climb;
  return {
    ...climb, ...(challenger_wins ? { hi: at } : { lo: at + 1 }),
    steps: [...climb.steps, { at, incumbent: climb.order[at]!, won: challenger_wins }],
  };
}
export function climbResult(climb: Climb, cap = climb.order.length): ClimbResult {
  const all = [...climb.order.slice(0, climb.lo), climb.challenger, ...climb.order.slice(climb.lo)];
  const made_it = climb.lo < cap;
  return { place: climb.lo, order: all.slice(0, cap), fell: made_it ? all[cap] ?? null : null, made_it };
}
export const maxClimbPicks = (n: number): number => Math.ceil(Math.log2(n + 1));

/** Inclusive, one-based places. `below` includes the position just beyond the hill.
 * There is no remaining range after the climb finishes. */
export function stillPossible(climb: Climb, n: number): { from: number; to: number; below: boolean } | null {
  return climbDone(climb) ? null : { from: climb.lo + 1, to: climb.hi + 1, below: climb.hi >= n };
}
