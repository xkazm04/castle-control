import { useState } from 'react';
import type { DrillRunResult, DrillState } from '@castle-control/contract';
import { VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';

export function Drill({ result, origin = 'fixture' }: { result: DrillRunResult; origin?: 'fixture' | 'core' }) {
  const [filter, setFilter] = useState<DrillState | 'all'>('all');
  const states = Object.keys(result.summary.states) as DrillState[];
  const outcomes = result.outcomes.filter(item => filter === 'all' || item.state === filter);
  return <section className="moderator-drill"><h2>{copy.replay} · simulated replay</h2>
    <a href="#/chamber/moderator">{copy.back}</a><p>{origin === 'fixture' ? 'Generated fixture output · no live ledger is invoked.' : 'Simulated replay from the local core · no live ledger is invoked.'}</p>
    <div className="moderator-drill-columns"><div className="room-column"><h3>Instrument and source</h3><p>{result.source}</p>
      <p>Instrument hash · {origin === 'fixture' ? 'illustrative' : 'reported by core'}</p><code className="room-hash">{result.instrument_hash}</code>
      {Object.entries(result.instrument).map(([name, hash]) => <p className="room-hash" key={name}>{name.replaceAll('_', ' ')}: {hash}</p>)}
      <p>Observed passes: <b>{result.summary.passes}</b></p>
      <p>Over-moderation: <b>{result.summary.over_moderation.false_positives} / {result.summary.over_moderation.evaluated}</b> evaluated.</p>
      {states.map(state => <p key={state}>{state.replaceAll('_', ' ')}: {result.summary.states[state]}</p>)}
      {result.gaps.map(gap => <p key={gap.from}>Recording gap: <time>{gap.from}</time> → <time>{gap.to}</time></p>)}
    </div><div className="room-column"><h3>What the rules would have done</h3>
      <label>Evaluation state <select value={filter} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'all' || states.some(state => state === value)) setFilter(value as DrillState | 'all');
      }}><option value="all">All outcomes</option>{states.map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label>
      <WindowedRows rows={outcomes} label="Simulated replay outcomes" row_key={item => item.message_id} row_height={rowHeight * 3}>
        {item => <div><b>{item.message_id}</b><p>{item.state.replaceAll('_', ' ')} · {item.source}</p>
          {item.verdict ? <VerdictChip verdict={item.verdict} /> : <span>Not evaluable</span>}</div>}</WindowedRows>
    </div></div>
  </section>;
}
