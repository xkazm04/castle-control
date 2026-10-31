import { boardGeometry } from './board.js';
import type { StudioSide } from './board.js';
import type { Rehearsal } from './rehearsal.js';
import { rehearseCopy as copy } from './rehearse-copy.js';

export type VerdictKind = 'runaway' | 'stalemate' | 'tight' | 'contested';
export type ShareRow = Readonly<StudioSide & { held: number; percent: number }>;
export type BalanceReport = Readonly<{
  through: number; of: number; total: number; shares: readonly ShareRow[]; unclaimed: number; unclaimed_percent: number;
  leader: ShareRow; margin: number; chokepoints: number; last_change: number; lead_changes: number;
  kind: VerdictKind; verdict: string; reading: string;
}>;

const percentOf = (count: number, total: number) => Math.round(count / total * 100);

/** Chokepoints: ground that keeps swapping hands, a tile that changed owner in two or more of the first `through` turns. */
export function chokepointIds(rehearsal: Rehearsal, through = rehearsal.turns.length): ReadonlySet<string> {
  const swaps = new Map<string, number>();
  for (const turn of rehearsal.turns.slice(0, through)) for (const change of turn.changes) swaps.set(change.id, (swaps.get(change.id) ?? 0) + 1);
  return new Set([...swaps].filter(([, count]) => count >= 2).map(([id]) => id));
}

/** Plain-words balance of a rehearsal after `through` turns, computed from the simulation alone.
 * Shares count every tile of the board, so unclaimed land is part of the denominator. */
export function balanceReport(rehearsal: Rehearsal, through = rehearsal.turns.length): BalanceReport {
  const { start } = rehearsal;
  const seen = rehearsal.turns.slice(0, through);
  const total = start.tiles.length;
  const base = boardGeometry(start);
  const last = seen.at(-1);
  const rows = start.sides.map((side, order) => ({ side, order, held: last ? last.held[side.id] ?? 0
    : base.sides.find(item => item.id === side.id)?.count ?? 0 }))
    .sort((a, b) => b.held - a.held || a.order - b.order);
  const shares = rows.map(({ side, held }): ShareRow => Object.freeze({ ...side, held, percent: percentOf(held, total) }));
  const leader = shares[0];
  if (!leader) throw new Error('A rehearsal board has at least two houses');
  const unclaimed = last ? last.unclaimed : base.unclaimed;
  const margin = leader.percent - (shares[1]?.percent ?? 0);
  const last_change = seen.reduce((found, turn) => (turn.changes.length ? turn.turn : found), 0);
  let lead = base.sides.reduce<{ id: string; held: number } | undefined>((top, side) =>
    !top || side.count > top.held ? { id: side.id, held: side.count } : top, undefined)?.id;
  let lead_changes = 0;
  for (const turn of seen) {
    const best = Math.max(...Object.values(turn.held));
    const tops = Object.entries(turn.held).filter(([, held]) => held === best);
    const sole = tops.length === 1 ? tops[0]?.[0] : undefined;
    if (sole !== undefined && sole !== lead) { lead_changes += lead === undefined ? 0 : 1; lead = sole; }
  }
  const chokepoints = chokepointIds(rehearsal, through).size;
  const quiet = through - last_change;
  const kind: VerdictKind = leader.percent >= 55 || margin >= 30 ? 'runaway'
    : quiet >= 2 ? 'stalemate' : margin <= 8 ? 'tight' : 'contested';
  const verdict = kind === 'runaway' ? copy.verdict_runaway(leader.label, leader.percent)
    : kind === 'stalemate' ? copy.verdict_stalemate(last_change)
      : kind === 'tight' ? copy.verdict_tight(shares.map(share => `${share.short} ${share.percent}%`))
        : copy.verdict_contested(leader.label, leader.percent);
  return Object.freeze({ through, of: rehearsal.turns.length, total, shares: Object.freeze(shares), unclaimed,
    unclaimed_percent: percentOf(unclaimed, total), leader, margin, chokepoints, last_change, lead_changes,
    kind, verdict, reading: copy.reading[kind] });
}
