// Display copy only. Castle vocabulary never reaches identifiers; data is simulated.
import type { EqualizerCohort } from './equalizer-model.js';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const equalizerCopy = {
  title: 'Weight & cap equalizer',
  gloss: 'How much activity can tilt the odds',
  hint: 'Chat activity can add weight, but each extra unit adds less. Money never adds weight.',
  curve_group: 'Weight curve',
  equal: 'Equal',
  concave: 'Concave',
  free_toggle: 'Free !join · equal odds',
  stamp_equal: 'Equal odds',
  stamp_free: 'Free path · equal',
  stamp_concave: (max_units: number) => `Concave · cap ${max_units}`,
  units_label: 'Activity cap',
  fewer: 'Lower the activity cap',
  more: 'Raise the activity cap',
  units_value: (max_units: number) => plural(max_units, 'unit', 'units'),
  units_hint: (min: number, max: number) => `Cap ${min}–${max} units here. Simulated pool activity runs 0–4 units.`,
  cap_label: 'Raider cohort cap',
  cap_option: (numerator: number, denominator: number) => numerator === 0 ? `${numerator} / ${denominator} · raiders excluded` : `${numerator} / ${denominator}`,
  chart_label: (rows: readonly { units: number; weight: number }[]) =>
    `Weight by activity: ${rows.map(row => `${plural(row.units, 'unit', 'units')} ${row.weight}`).join(', ')}.`,
  chart_units: (units: number) => `${units}u`,
  legend_weight: 'Weight per entry',
  focus_hint: 'Point at a bar to light those lots on the stage.',
  legend_curve: 'Curve',
  legend_linear: 'Linear reference · every unit worth the first',
  headline: (count: number, newcomer: number, heaviest: number) =>
    `${plural(count, 'newcomer', 'newcomers')} (${count} × ${newcomer} = ${count * newcomer}) outweigh the heaviest entrant (${heaviest}).`,
  headline_empty: 'No entries yet · the newcomer comparison appears once lots arrive.',
  heaviest_from_curve: 'Heaviest figure is the curve ceiling. The core publishes the frozen weight table after sealing.',
  heaviest_from_entries: 'Heaviest figure comes from the current simulated pool.',
  free_forced: 'Free !join path is on: every entry gets equal odds, so the curve is flat. Switch it off to let activity weigh in.',
  equal_note: 'Equal curve: every entry has weight 1, whatever their activity.',
  cohorts_title: 'Weight held by cohort',
  cohorts_label: (rows: readonly { cohort: EqualizerCohort; weight_share: number }[]) =>
    `Weight share: ${rows.map(row => `${equalizerCopy.cohorts[row.cohort]} ${Math.round(row.weight_share * 100)}%`).join(', ')}.`,
  cohorts: { new_account: 'New accounts', subscriber: 'Subscribers', raider: 'Raiders' } satisfies Record<EqualizerCohort, string>,
  cohort_row: (count: number, count_share: number, weight_share: number) =>
    `${count} lots · ${Math.round(count_share * 100)}% of heads · ${Math.round(weight_share * 100)}% of weight`,
  cohorts_core: 'Cohorts are not part of the core roll, so no cohort split is shown here.',
  cap_title: 'Raider cap',
  cap_meter: (limit: number, winners: number) => `Raiders can take at most ${limit} of ${plural(winners, 'winner', 'winners')}.`,
  cap_none: 'No raider cap: raiders compete like everyone else.',
  cap_pips: (limit: number, winners: number) => `${limit} of ${winners} winner seats open to raiders`,
  locked: 'Roll sealed · the curve and cap are frozen with it.',
  simulated: 'Simulated pool · illustrative',
} as const;
