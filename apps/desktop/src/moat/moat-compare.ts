import type { MoatModel } from './moat-model.js';

export type MoatComparison = Readonly<{
  /** Both runs share one timeline, so one playhead can drive both strips. */
  aligned: boolean;
  /** Messages whose fate or rule differs, plus every id the contract lists as a state change. */
  changed: ReadonlySet<string>;
  /** Stopped by the candidate but not by the baseline. */
  newly_held: number;
  /** Stopped by the baseline but not by the candidate. */
  released: number;
}>;

export function compareMoats(baseline: MoatModel, candidate: MoatModel, changes: readonly { message_id: string }[]): MoatComparison {
  const later = new Map(candidate.markers.map(marker => [marker.message_id, marker]));
  const changed = new Set(changes.map(change => change.message_id));
  let newly_held = 0; let released = 0;
  for (const before of baseline.markers) {
    const after = later.get(before.message_id);
    if (!after) continue;
    if (after.fate !== before.fate || after.rule_id !== before.rule_id) changed.add(before.message_id);
    if (after.fate === 'held' && before.fate !== 'held') newly_held += 1;
    if (before.fate === 'held' && after.fate !== 'held') released += 1;
  }
  return { aligned: baseline.start_ms === candidate.start_ms && baseline.span_ms === candidate.span_ms, changed, newly_held, released };
}
