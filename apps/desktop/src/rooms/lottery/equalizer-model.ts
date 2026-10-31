import type { LotsCohortCap, LotsWeightCurve, LotsWeightTable } from '@castle-control/contract';

/** UI-local presentation shapes. None is a wire identifier: the contract's
 * LotsWeightTable lists per-user rows, while this ladder lists activity levels. */
export type EqualizerCohort = 'new_account' | 'subscriber' | 'raider';
export type EqualizerEntry = Readonly<{ cohort: EqualizerCohort; weight: number }>;
export type WeightStep = Readonly<{
  /** Activity units (chat activity, never money). */
  units: number;
  weight: number;
  /** Weight added by this level over the previous one; concave gains shrink. */
  gain: number;
  /** Linear reference: every unit worth the first unit's gain. */
  linear: number;
}>;
export type WeightSummary = Pick<LotsWeightTable, 'newcomer_weight' | 'heaviest_weight' | 'newcomers_to_outweigh_heaviest'>
  & Readonly<{ heaviest_source: 'entries' | 'curve' }>;
export type CohortShare = Readonly<{
  cohort: EqualizerCohort; count: number; total_weight: number; weight_share: number; count_share: number;
}>;

/** Stepper bounds for this card. The contract accepts max_units 1..65535; the
 * fixture pool generates activity 0..4, so larger caps add no visible change. */
export const max_units_range = Object.freeze({ min: 1, max: 8 });
export const cohort_order: readonly EqualizerCohort[] = Object.freeze(['new_account', 'subscriber', 'raider']);
const ladder_limit = 9;

/** The free !join path forces equal odds for every entry (lots-fixture.ts fixturePool). */
export function effectiveCurve(curve: LotsWeightCurve, free_join_equal_odds: boolean): LotsWeightCurve {
  return free_join_equal_odds ? { kind: 'equal' } : curve;
}

/** Mirrors crates/cc-lots/src/weights.rs WeightCurve::weight exactly:
 * Equal => 1; Concave(c) => c + n(2c - n + 1)/2 with n = min(units, c), integer division. */
export function curveWeight(curve: LotsWeightCurve, units: number): number {
  if (curve.kind === 'equal') return 1;
  const c = curve.max_units;
  const n = Math.min(Math.max(0, Math.floor(units)), c);
  return c + Math.floor(n * (2 * c - n + 1) / 2);
}

function ladderUnits(max_units: number): readonly number[] {
  if (max_units + 1 <= ladder_limit) return Array.from({ length: max_units + 1 }, (_, units) => units);
  // Very large core caps: sample evenly, always keeping 0 and the cap itself.
  const sampled = Array.from({ length: ladder_limit }, (_, index) => Math.round(index * max_units / (ladder_limit - 1)));
  return [...new Set(sampled)];
}

/** One row per activity level from 0 to the cap (an equal curve shows the fixture's 0..4 levels). */
export function weightTable(curve: LotsWeightCurve, free_join_equal_odds: boolean): readonly WeightStep[] {
  const active = effectiveCurve(curve, free_join_equal_odds);
  const levels = ladderUnits(curve.kind === 'concave' ? curve.max_units : 4);
  const base = curveWeight(active, 0);
  const first_gain = curveWeight(active, 1) - base;
  let previous = base;
  return Object.freeze(levels.map(units => {
    const weight = curveWeight(active, units);
    const step = Object.freeze({ units, weight, gain: weight - previous, linear: base + first_gain * units });
    previous = weight;
    return step;
  }));
}

/** Same rule as cc-lots WeightTable::new: heaviest / newcomer + 1, absent with no entries. */
export function newcomersToOutweighHeaviest(newcomer_weight: number, heaviest_weight: number): number {
  if (newcomer_weight < 1) throw new RangeError('Newcomer weight must be positive');
  return Math.floor(heaviest_weight / newcomer_weight) + 1;
}

/** Entries present: the heaviest frozen entry, as Rust computes it. Without entries
 * (a core draw before sealing) the heaviest figure is the curve's own ceiling. */
export function weightSummary(curve: LotsWeightCurve, free_join_equal_odds: boolean,
  entries?: readonly EqualizerEntry[]): WeightSummary {
  const active = effectiveCurve(curve, free_join_equal_odds);
  const newcomer_weight = curveWeight(active, 0);
  if (entries) {
    if (!entries.length) return Object.freeze({ newcomer_weight, heaviest_weight: 0, heaviest_source: 'entries' });
    const heaviest_weight = entries.reduce((max, entry) => Math.max(max, entry.weight), 0);
    return Object.freeze({ newcomer_weight, heaviest_weight, heaviest_source: 'entries',
      newcomers_to_outweigh_heaviest: newcomersToOutweighHeaviest(newcomer_weight, heaviest_weight) });
  }
  const heaviest_weight = curveWeight(active, active.kind === 'concave' ? active.max_units : 0);
  return Object.freeze({ newcomer_weight, heaviest_weight, heaviest_source: 'curve',
    newcomers_to_outweigh_heaviest: newcomersToOutweighHeaviest(newcomer_weight, heaviest_weight) });
}

/** Head count versus weight held, per cohort, in a fixed display order. */
export function cohortShares(entries: readonly EqualizerEntry[]): readonly CohortShare[] {
  const total_weight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return Object.freeze(cohort_order.map(cohort => {
    const members = entries.filter(entry => entry.cohort === cohort);
    const weight = members.reduce((sum, entry) => sum + entry.weight, 0);
    return Object.freeze({ cohort, count: members.length, total_weight: weight,
      weight_share: total_weight ? weight / total_weight : 0,
      count_share: entries.length ? members.length / entries.length : 0 });
  }));
}

/** Same floor as cc-lots CohortCap and simulation.ts respectsCaps: floor(W * num / den). */
export function capLimit(winner_count: number, cap: LotsCohortCap | undefined): number | undefined {
  if (!cap || cap.denominator < 1) return undefined;
  return Math.floor(winner_count * cap.numerator / cap.denominator);
}

/** Clamp a stepper request into the card's range; returns the curve to submit. */
export function steppedCurve(curve: LotsWeightCurve, delta: number): LotsWeightCurve {
  const current = curve.kind === 'concave' ? curve.max_units : 4;
  const max_units = Math.min(max_units_range.max, Math.max(max_units_range.min, current + delta));
  return { kind: 'concave', max_units };
}

/** Chart geometry in SVG user units (logical coordinates, not CSS pixels). */
export const chart = Object.freeze({ width: 320, height: 176, left: 26, right: 10, top: 22, bottom: 40 });
export type ChartBar = Readonly<{ step: WeightStep; x: number; width: number; level: number; cx: number;
  top: number; linear_top: number }>;

export function chartBars(steps: readonly WeightStep[]): readonly ChartBar[] {
  const scale = Math.max(1, ...steps.map(step => Math.max(step.weight, step.linear)));
  const plot_width = chart.width - chart.left - chart.right;
  const plot_height = chart.height - chart.top - chart.bottom;
  const slot = plot_width / Math.max(1, steps.length);
  const width = slot * 0.62;
  const base = chart.height - chart.bottom;
  return Object.freeze(steps.map((step, index) => {
    const x = chart.left + index * slot + (slot - width) / 2;
    return Object.freeze({ step, x, width, cx: x + width / 2, level: step.weight / scale,
      top: base - plot_height * step.weight / scale, linear_top: base - plot_height * step.linear / scale });
  }));
}
