import { useId, useMemo, useState } from 'react';
import type { DrillDiffResult, DrillRunResult, DrillState } from '@castle-control/contract';
import { InkButton, Stamp, VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';
import type { BenchResult } from '../../moderation-bench.js';
import { DraftPatternPreview } from './rule-bench.jsx';
import { ClockTime } from './presentation.jsx';
import { MoatPanel } from './moat-panel.jsx';
import { MoatCompare } from './moat-compare.jsx';
import type { RuleBenchLink } from './moat-panel.jsx';
import type { DrillPlan } from './room-view.js';
import { buildMoat, crossingMs } from '../../moat/moat-model.js';
import type { MoatClock } from '../../moat/moat-player.js';
import { actionWords, moatCopy } from '../../moat/moat-copy.js';

export function Drill({ result: given, origin = 'fixture', capture_hash, draft, delay_s, clock, rule_bench, compare, moat = true, busy_night, start }: {
  result: DrillRunResult; origin?: 'fixture' | 'core'; capture_hash?: string | undefined; draft?: BenchResult | undefined;
  /** The applied chat delay, when the source knows it. The moat never invents one. */
  delay_s?: number | undefined; clock?: MoatClock | undefined; rule_bench?: RuleBenchLink | undefined;
  /** A simulated candidate to offer beside this run. Only the fixture room has one. */
  compare?: DrillDiffResult | undefined;
  /** False when a comparison above already draws this run's moat. */
  moat?: boolean;
  /** Draws a much longer simulated night on demand. Only the fixture room has one. */
  busy_night?: (() => DrillRunResult) | undefined;
  /** A plan sealed in the Steward's "Practice a drill" flow: which night, and whether to compare. */
  start?: DrillPlan | undefined;
}) {
  const state_id = useId();
  const [busy, setBusy] = useState<DrillRunResult | undefined>(() => start?.busy && busy_night ? busy_night() : undefined);
  const result = busy ?? given;
  // A new run replaces the old one in place (the core room), and message ids repeat from run to run:
  // nothing picked or filtered on the last run carries over to this one.
  const [shown, setShown] = useState(given);
  const [selected, setSelected] = useState<string | undefined>();
  const [comparing, setComparing] = useState(() => !!start?.compare && !!compare && !start.busy);
  // Only a pick made on the strip scrolls the table; a pick made in the table stays where the reader is.
  const [reveal, setReveal] = useState<{ key: string } | undefined>();
  const model = useMemo(() => buildMoat(result, delay_s && delay_s > 0 ? delay_s * 1000 : crossingMs), [result, delay_s]);
  const [filter, setFilter] = useState<DrillState | 'all'>('all');
  if (shown !== given) { setShown(given); setBusy(undefined); setSelected(undefined); setReveal(undefined); setComparing(false); setFilter('all'); }
  const drawn = useMemo(() => new Set(model.markers.map(marker => marker.message_id)), [model]);
  const states = Object.keys(result.summary.states) as DrillState[];
  const outcomes = result.outcomes.filter(item => filter === 'all' || item.state === filter);
  return <section className="moderator-drill"><h2>{copy.replay} · <Stamp kind="simulated" word={copy.replay_simulated} /></h2>
    {!capture_hash && <p>{copy.live_parity}</p>}
    <a href="#/chamber/moderator">{copy.back}</a><p>{origin === 'fixture' ? copy.replay_fixture_note : copy.replay_core_note}</p>
    {draft && <DraftPatternPreview result={draft} />}
    {moat && <MoatPanel model={model} delay_s={delay_s} clock={clock} selected_id={selected} on_select={id => {
      setSelected(id); setReveal(id === undefined ? undefined : { key: id });
      // A pick the table's state filter hides would scroll nowhere: show every state so the row can be found.
      const picked = result.outcomes.find(item => item.message_id === id);
      if (picked && filter !== 'all' && picked.state !== filter) setFilter('all');
    }} rule_bench={rule_bench} report={{ source: result.source, instrument_hash: result.instrument_hash, origin }} />}
    {moat && (compare || busy_night) && <div className="moat-extras">
      {compare && !busy && <InkButton type="button" size="small" className="moat-compare-toggle" aria-pressed={comparing} onClick={() => { setComparing(!comparing); }}>{moatCopy.compare.toggle}</InkButton>}
      {busy_night && <InkButton type="button" size="small" aria-pressed={!!busy} onClick={() => {
        // Message ids repeat from night to night, so nothing picked on one night carries to the next.
        setBusy(busy ? undefined : busy_night()); setSelected(undefined); setReveal(undefined); setComparing(false); setFilter('all');
      }}>{moatCopy.busy.toggle}</InkButton>}
      {busy && <p className="moat-small">{moatCopy.busy.note(busy.outcomes.length)}</p>}</div>}
    {moat && compare && !busy && comparing && <MoatCompare diff={compare} note={moatCopy.compare.note_fixture} delay_s={delay_s} clock={clock} />}
    <div className="moderator-drill-columns"><div className="room-column"><h3>{copy.instrument_source}</h3><p>{result.source}</p>
      {capture_hash && <><p>{copy.capture_hash}</p><code className="room-hash">{capture_hash}</code>
        <p role="status">{capture_hash === result.instrument_hash ? copy.capture_match : copy.capture_mismatch}</p>
        <p>{copy.capture_match_scope}</p></>}
      <p>{copy.instrument_hash} · {origin === 'fixture' ? copy.illustrative : copy.core_reported}</p><code className="room-hash">{result.instrument_hash}</code>
      {Object.entries(result.instrument).map(([name, hash]) => <p className="room-hash" key={name}>{name.replaceAll('_', ' ')}: {hash}</p>)}
      <p>{copy.observed_passes}: <b>{result.summary.passes}</b></p>
      <p>{copy.over_moderation}: <b>{result.summary.over_moderation.false_positives} / {result.summary.over_moderation.evaluated}</b> {copy.evaluated}.</p>
      {states.map(state => <p key={state}>{state.replaceAll('_', ' ')}: {result.summary.states[state]}</p>)}
      {result.gaps.map(gap => <p key={gap.from}>{copy.recording_gap}: <ClockTime at={gap.from} /> → <ClockTime at={gap.to} /></p>)}
    </div><div className="room-column"><h3>{copy.replay_outcomes_title}</h3>
      <div><label htmlFor={state_id}>{copy.evaluation_state}</label>{' '}<select id={state_id} value={filter} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'all' || states.some(state => state === value)) setFilter(value as DrillState | 'all');
      }}><option value="all">{copy.outcomes_all}</option>{states.map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></div>
      <WindowedRows rows={outcomes} label={copy.outcomes_label} row_key={item => item.message_id} row_height={rowHeight * 3} reveal={reveal}>
        {item => <div className="moat-row" data-selected={selected === item.message_id}><b>{moat && drawn.has(item.message_id)
          // A line with no usable time has no dot, so there is nothing for a press to show: it stays plain text.
          ? <button type="button" className="moat-row-id" aria-pressed={selected === item.message_id}
            aria-label={moatCopy.table_inspect(item.message_id)} onClick={() => { setSelected(item.message_id); }}>{item.message_id}</button>
          : item.message_id}</b><p>{item.state.replaceAll('_', ' ')} · {item.source}{item.rule_id && <> · {moatCopy.rule_line(item.rule_id)}</>}{item.action && <> · {actionWords[item.action]}</>}</p>
          {item.verdict ? <VerdictChip verdict={item.verdict} /> : <span>{copy.not_evaluable}</span>}</div>}</WindowedRows>
    </div></div>
  </section>;
}
