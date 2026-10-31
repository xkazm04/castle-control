import { useState } from 'react';
import type { DrillRunResult, DrillState } from '@castle-control/contract';
import { VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';
import type { BenchResult } from '../../moderation-bench.js';
import { DraftPatternPreview } from './rule-bench.jsx';

export function Drill({ result, origin = 'fixture', capture_hash, draft }: {
  result: DrillRunResult; origin?: 'fixture' | 'core'; capture_hash?: string | undefined; draft?: BenchResult | undefined;
}) {
  const [filter, setFilter] = useState<DrillState | 'all'>('all');
  const states = Object.keys(result.summary.states) as DrillState[];
  const outcomes = result.outcomes.filter(item => filter === 'all' || item.state === filter);
  return <section className="moderator-drill"><h2>{copy.replay} · {copy.replay_simulated}</h2>
    {!capture_hash && <p>{copy.live_parity}</p>}
    <a href="#/chamber/moderator">{copy.back}</a><p>{origin === 'fixture' ? copy.replay_fixture_note : copy.replay_core_note}</p>
    {draft && <DraftPatternPreview result={draft} />}
    <div className="moderator-drill-columns"><div className="room-column"><h3>{copy.instrument_source}</h3><p>{result.source}</p>
      {capture_hash && <><p>{copy.capture_hash}</p><code className="room-hash">{capture_hash}</code>
        <p role="status">{capture_hash === result.instrument_hash ? copy.capture_match : copy.capture_mismatch}</p>
        <p>{copy.capture_match_scope}</p></>}
      <p>{copy.instrument_hash} · {origin === 'fixture' ? copy.illustrative : copy.core_reported}</p><code className="room-hash">{result.instrument_hash}</code>
      {Object.entries(result.instrument).map(([name, hash]) => <p className="room-hash" key={name}>{name.replaceAll('_', ' ')}: {hash}</p>)}
      <p>{copy.observed_passes}: <b>{result.summary.passes}</b></p>
      <p>{copy.over_moderation}: <b>{result.summary.over_moderation.false_positives} / {result.summary.over_moderation.evaluated}</b> {copy.evaluated}.</p>
      {states.map(state => <p key={state}>{state.replaceAll('_', ' ')}: {result.summary.states[state]}</p>)}
      {result.gaps.map(gap => <p key={gap.from}>{copy.recording_gap}: <time>{gap.from}</time> → <time>{gap.to}</time></p>)}
    </div><div className="room-column"><h3>{copy.replay_outcomes_title}</h3>
      <label>{copy.evaluation_state} <select value={filter} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'all' || states.some(state => state === value)) setFilter(value as DrillState | 'all');
      }}><option value="all">{copy.outcomes_all}</option>{states.map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label>
      <WindowedRows rows={outcomes} label={copy.outcomes_label} row_key={item => item.message_id} row_height={rowHeight * 3}>
        {item => <div><b>{item.message_id}</b><p>{item.state.replaceAll('_', ' ')} · {item.source}</p>
          {item.verdict ? <VerdictChip verdict={item.verdict} /> : <span>{copy.not_evaluable}</span>}</div>}</WindowedRows>
    </div></div>
  </section>;
}
