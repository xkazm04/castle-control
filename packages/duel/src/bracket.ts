/** Winner .port/winner/duel-engine.js (cc-t2-duel A/1);
 * goat src/v2/list/tournament.ts @ ae2c83f. */
import type { DuelItemId } from './list.js';

export interface Match {
  readonly a: DuelItemId;
  readonly b: DuelItemId;
  readonly winner: DuelItemId | null;
}
export interface Bracket {
  readonly seeds: readonly DuelItemId[];
  readonly rounds: readonly (readonly Match[])[];
}
export interface PlannedMatch {
  readonly a: DuelItemId | null;
  readonly b: DuelItemId | null;
  readonly winner: DuelItemId | null;
  readonly planned?: true;
}
const PAIRS = {
  8: [[0, 7], [3, 4], [1, 6], [2, 5]],
  4: [[0, 3], [1, 2]], 2: [[0, 1]],
} as const;

export function startBracket(order: readonly DuelItemId[]): Bracket | null {
  const size = order.length >= 8 ? 8 : order.length >= 4 ? 4 : order.length >= 2 ? 2 : 0;
  if (!size) return null;
  const seeds = order.slice(0, size);
  return { seeds, rounds: [PAIRS[size].map(([a, b]) => ({ a: seeds[a]!, b: seeds[b]!, winner: null }))] };
}

export function currentMatch(bracket: Bracket) {
  const round = bracket.rounds.length - 1;
  const index = bracket.rounds[round]!.findIndex((match) => match.winner === null);
  return index < 0 ? null : { round, index, match: bracket.rounds[round]![index]! };
}

export function pick(bracket: Bracket, winner: DuelItemId): Bracket {
  const cur = currentMatch(bracket);
  if (!cur || (winner !== cur.match.a && winner !== cur.match.b)) return bracket;
  const rounds = bracket.rounds.map((round, r) => round.map((match, i) =>
    r === cur.round && i === cur.index ? { ...match, winner } : match));
  const done = rounds[cur.round]!;
  if (done.every((match) => match.winner !== null) && done.length > 1) {
    const next: Match[] = [];
    for (let i = 0; i < done.length; i += 2) {
      next.push({ a: done[i]!.winner!, b: done[i + 1]!.winner!, winner: null });
    }
    rounds.push(next);
  }
  return { seeds: bracket.seeds, rounds };
}

export function finalOrder(bracket: Bracket): readonly DuelItemId[] | null {
  if (currentMatch(bracket)) return null;
  const loser = (match: Match) => match.winner === match.a ? match.b : match.a;
  const final = bracket.rounds.at(-1)![0]!;
  const out = [final.winner!, loser(final)];
  for (let r = bracket.rounds.length - 2; r >= 0; r--) {
    out.push(...bracket.rounds[r]!.map(loser).sort((a, b) => bracket.seeds.indexOf(a) - bracket.seeds.indexOf(b)));
  }
  return out;
}

export const totalRounds = (bracket: Bracket): number => Math.log2(bracket.seeds.length);
export const totalMatches = (bracket: Bracket): number => bracket.seeds.length - 1;
export function roundName(bracket: Bracket, round: number): string {
  const left = totalRounds(bracket) - round;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${round + 1}`;
}
export function matchNumber(bracket: Bracket): number {
  return 1 + bracket.rounds.reduce((n, round) => n + round.filter((match) => match.winner !== null).length, 0);
}
export function plannedRounds(bracket: Bracket): readonly (readonly PlannedMatch[])[] {
  const out: (readonly PlannedMatch[])[] = [];
  for (let r = 0; r < totalRounds(bracket); r++) {
    const existing = bracket.rounds[r];
    if (existing) out.push(existing);
    else {
      const prev = out[r - 1]!;
      const next: PlannedMatch[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        next.push({ a: prev[i]!.winner, b: prev[i + 1]!.winner, winner: null, planned: true });
      }
      out.push(next);
    }
  }
  return out;
}
