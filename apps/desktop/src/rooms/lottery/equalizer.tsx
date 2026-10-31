import type { CSSProperties } from 'react';
import { FieldGroup, HeraldicCard, InkButton, StatusChip } from '@castle-control/ui';
import type { LotsDraw } from '@castle-control/contract';
import { equalizerCopy as copy } from './equalizer-copy.js';
import { capLimit, chart, chartBars, cohortShares, effectiveCurve, max_units_range, steppedCurve, weightSummary, weightTable } from './equalizer-model.js';
import type { ChartBar, EqualizerEntry, WeightStep } from './equalizer-model.js';
import './equalizer.css';

type Level = CSSProperties & { '--eq-level': number };
type Share = CSSProperties & { '--eq-share': number };
const levelStyle = (level: number): Level => ({ '--eq-level': level });
const shareStyle = (share: number): Share => ({ '--eq-share': share });
const cap_denominator = 3;
const pip_limit = 20;

function curveSignature(steps: readonly WeightStep[]): string {
  return steps.map(step => step.weight).join('-');
}

/** Bars scale with transform so the change animates; labels re-ink on each new value. */
function WeightChart({ steps, flat }: { steps: readonly WeightStep[]; flat: boolean }) {
  const bars = chartBars(steps);
  const base = chart.height - chart.bottom;
  const plot = base - chart.top;
  const signature = curveSignature(steps);
  const line = (pick: (bar: ChartBar) => number) => bars.map(bar => `${bar.cx},${pick(bar)}`).join(' ');
  const last = bars.at(-1);
  return <figure className="lottery-eq-chart" data-flat={flat}>
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={copy.chart_label(steps)}>
      <line className="lottery-eq-axis" x1={chart.left} x2={chart.width - chart.right} y1={base} y2={base} />
      {bars.map((bar, index) => <g key={bar.step.units} data-eq-bar={bar.step.units}
        data-eq-role={index === 0 ? 'newcomer' : bar === last ? 'heaviest' : undefined}>
        <rect className="lottery-eq-bar" x={bar.x} y={chart.top} width={bar.width} height={plot}
          style={levelStyle(bar.level)} />
        <text key={`${bar.step.units}-${bar.step.weight}`} className="lottery-eq-value" x={bar.cx} y={bar.top - 6}>
          {bar.step.weight}</text>
        <text className="lottery-eq-units" x={bar.cx} y={base + 16}>{copy.chart_units(bar.step.units)}</text>
        {index > 0 && <text className="lottery-eq-gain" x={bar.cx} y={base + 31}>{`+${bar.step.gain}`}</text>}
      </g>)}
      {!flat && <polyline key={`linear-${signature}`} className="lottery-eq-linear" points={line(bar => bar.linear_top)} />}
      <polyline key={`curve-${signature}`} className="lottery-eq-curve" pathLength={1} points={line(bar => bar.top)} />
      {bars.map(bar => <circle key={`dot-${bar.step.units}-${bar.step.weight}`} className="lottery-eq-dot"
        cx={bar.cx} cy={bar.top} r={3.5} />)}
    </svg>
    <figcaption className="lottery-eq-legend">
      <span data-eq-key="bar">{copy.legend_weight}</span>
      <span data-eq-key="curve">{copy.legend_curve}</span>
      {!flat && <span data-eq-key="linear">{copy.legend_linear}</span>}
    </figcaption>
  </figure>;
}

function CohortBar({ entries }: { entries: readonly EqualizerEntry[] }) {
  const shares = cohortShares(entries);
  return <section className="lottery-eq-section" aria-label={copy.cohorts_title}>
    <p className="cc-kicker">{copy.cohorts_title}</p>
    <div className="lottery-eq-stack" role="img" aria-label={copy.cohorts_label(shares)}>
      {shares.filter(row => row.total_weight > 0).map(row => <span key={row.cohort} data-cohort={row.cohort}
        style={shareStyle(row.weight_share)} />)}
    </div>
    <ul className="lottery-eq-cohorts">{shares.map(row => <li key={row.cohort} data-cohort={row.cohort}>
      <b>{copy.cohorts[row.cohort]}</b> <span>{copy.cohort_row(row.count, row.count_share, row.weight_share)}</span>
    </li>)}</ul>
  </section>;
}

function CapMeter({ draw }: { draw: LotsDraw }) {
  const winners = draw.rules.winner_count;
  const cap = draw.rules.cohort_caps.find(item => item.cohort === 'raider');
  const limit = capLimit(winners, cap);
  return <section className="lottery-eq-section" aria-label={copy.cap_title}>
    <p className="cc-kicker">{copy.cap_title}</p>
    <p className="lottery-eq-cap-text" role="status">{limit === undefined ? copy.cap_none : copy.cap_meter(limit, winners)}</p>
    {limit !== undefined && winners <= pip_limit && <ol className="lottery-eq-pips" aria-label={copy.cap_pips(limit, winners)}>
      {Array.from({ length: winners }, (_, index) => <li key={index} data-open={index < limit} />)}
    </ol>}
  </section>;
}

export function WeightEqualizer({ draw, entries, on_edit, disabled = false }: {
  draw: LotsDraw; entries: readonly EqualizerEntry[] | undefined; on_edit?: (draw: LotsDraw) => void; disabled?: boolean;
}) {
  const rules = draw.rules;
  const curve = rules.weight_curve;
  const free = rules.free_join_equal_odds;
  const active = effectiveCurve(curve, free);
  const steps = weightTable(curve, free);
  const summary = weightSummary(curve, free, entries);
  const editable = Boolean(on_edit) && !disabled;
  const max_units = curve.kind === 'concave' ? curve.max_units : undefined;
  const cap = rules.cohort_caps.find(item => item.cohort === 'raider');
  const edit = (change: Partial<LotsDraw['rules']>) => { if (on_edit && !disabled) on_edit({ ...draw, rules: { ...rules, ...change } }); };
  const stamp = free ? copy.stamp_free : active.kind === 'concave' ? copy.stamp_concave(active.max_units) : copy.stamp_equal;
  return <HeraldicCard variant="raised" className="lottery-equalizer" aria-label={copy.title}>
    <header className="lottery-eq-head">
      <div><h2 className="lottery-card-title">{copy.title}</h2><p className="cc-aside">{copy.gloss}</p></div>
      <StatusChip variant="gules" stamp="label" tone={active.kind === 'concave' ? 'spot' : 'neutral'}>{stamp}</StatusChip>
    </header>
    <p className="cc-aside">{copy.hint}</p>
    {on_edit && <div className="lottery-eq-controls">
      <div className="lottery-eq-segment" role="group" aria-label={copy.curve_group}>
        <InkButton size="small" data-curve="equal" aria-pressed={curve.kind === 'equal'} disabled={!editable}
          onClick={() => { if (curve.kind !== 'equal') edit({ weight_curve: { kind: 'equal' } }); }}>{copy.equal}</InkButton>
        <InkButton size="small" data-curve="concave" aria-pressed={curve.kind === 'concave'} disabled={!editable}
          onClick={() => { if (curve.kind !== 'concave') edit({ weight_curve: steppedCurve(curve, 0) }); }}>{copy.concave}</InkButton>
      </div>
      <InkButton size="small" data-free-path aria-pressed={free} disabled={!editable} onClick={() => {
        if (on_edit && !disabled) on_edit({ ...draw, rules: { ...rules, free_join_equal_odds: !free },
          policy: { ...draw.policy, free_entry_equal_odds: !free } });
      }}>{copy.free_toggle}</InkButton>
      <div className="lottery-eq-stepper" role="group" aria-label={copy.units_label}>
        <span className="lottery-eq-stepper-label">{copy.units_label}</span>
        <InkButton size="small" data-step="-1" aria-label={copy.fewer}
          disabled={!editable || max_units === undefined || max_units <= max_units_range.min}
          onClick={() => edit({ weight_curve: steppedCurve(curve, -1) })}>−</InkButton>
        <output aria-live="polite">{max_units === undefined ? '—' : copy.units_value(max_units)}</output>
        <InkButton size="small" data-step="1" aria-label={copy.more}
          disabled={!editable || max_units === undefined || max_units >= max_units_range.max}
          onClick={() => edit({ weight_curve: steppedCurve(curve, 1) })}>+</InkButton>
      </div>
      <FieldGroup label={copy.cap_label} control_id="lots-eq-cap" variant="select">
        <select id="lots-eq-cap" disabled={!editable} value={cap ? Math.round(cap.numerator * cap_denominator / cap.denominator) : ''}
          onChange={event => {
            const numerator = Number(event.currentTarget.value);
            if (Number.isInteger(numerator) && numerator >= 0 && numerator <= cap_denominator) {
              edit({ cohort_caps: [...rules.cohort_caps.filter(item => item.cohort !== 'raider'),
                { cohort: 'raider', numerator, denominator: cap_denominator }] });
            }
          }}>
          {!cap && <option value="">{copy.cap_none}</option>}
          {Array.from({ length: cap_denominator + 1 }, (_, numerator) => <option key={numerator} value={numerator}>
            {copy.cap_option(numerator, cap_denominator)}</option>)}
        </select>
      </FieldGroup>
      <p className="cc-aside">{copy.units_hint(max_units_range.min, max_units_range.max)}</p>
    </div>}
    {disabled && <p className="cc-status" role="status">{copy.locked}</p>}
    <WeightChart steps={steps} flat={active.kind === 'equal'} />
    {free ? <p className="lottery-eq-note" data-eq-note="free">{copy.free_forced}</p>
      : active.kind === 'equal' && <p className="lottery-eq-note">{copy.equal_note}</p>}
    <div className="lottery-eq-headline" role="status">
      {summary.newcomers_to_outweigh_heaviest === undefined ? <p>{copy.headline_empty}</p> : <>
        <b aria-hidden="true">{summary.newcomers_to_outweigh_heaviest}</b>
        <p>{copy.headline(summary.newcomers_to_outweigh_heaviest, summary.newcomer_weight, summary.heaviest_weight)}</p>
      </>}
    </div>
    <p className="cc-aside">{summary.heaviest_source === 'curve' ? copy.heaviest_from_curve : copy.heaviest_from_entries}</p>
    {entries ? <CohortBar entries={entries} /> : <p className="cc-aside">{copy.cohorts_core}</p>}
    <CapMeter draw={draw} />
  </HeraldicCard>;
}
