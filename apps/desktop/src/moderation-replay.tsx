import { useState } from 'react';
import type { DrillRunResult, DrillState } from '@castle-control/contract';
import { NumberedPanel, PageHeader, StatusChip, VerdictChip } from '@castle-control/ui';
import { moderationCopy as copy } from './moderation-copy.js';
import { WindowedRows, messageHeight } from './moderation-window.jsx';

export function ReplayPage({ result }: { result: DrillRunResult }) {
  const [filter, setFilter] = useState<DrillState | 'all'>('all');
  const outcomes = result.outcomes.filter(item => filter === 'all' || item.state === filter);
  const states = Object.keys(result.summary.states) as DrillState[];
  return <>
    <PageHeader number={2} title={copy.replay} description={copy.replay_gloss}
      breadcrumbs={[{ label: copy.title, href: '#/moderator' }, { label: copy.replay }]}
      actions={<StatusChip variant="warn">Simulated replay</StatusChip>} />
    <a className="moderation-back" href="#/moderator">{copy.back}</a>
    <p className="moderation-meta">Generated fixture output · no replay engine or live ledger is invoked.</p>
    <div className="moderation-replay-summary">{states.map(state => <div key={state}><b>{result.summary.states[state]}</b><span>{state.replaceAll('_', ' ')}</span></div>)}</div>
    <div className="moderation-grid">
      <NumberedPanel number="R.1" title="Instrument and source" gloss="Simulated provenance">
        <dl className="moderation-instrument"><dt>Source</dt><dd>{result.source}</dd>
          <dt>Instrument hash · illustrative</dt><dd>{result.instrument_hash}</dd>
          {Object.entries(result.instrument).map(([name, hash]) => <div key={name}><dt>{name.replaceAll('_', ' ')}</dt><dd>{hash}</dd></div>)}
        </dl>
        <p>Observed passes: <b>{result.summary.passes}</b></p>
        <p>Over-moderation: <b>{result.summary.over_moderation.false_positives} / {result.summary.over_moderation.evaluated}</b> evaluated.</p>
        {result.gaps.map(gap => <p className="moderation-notice" key={gap.from}>Recording gap: <time>{gap.from}</time> → <time>{gap.to}</time></p>)}
      </NumberedPanel>
      <NumberedPanel number="R.2" title="What the rules would have done" gloss="Simulated outcomes">
        <label className="moderation-toolbar">Evaluation state <select value={filter} onChange={event => {
          const value = event.currentTarget.value;
          if (value === 'all' || states.some(state => state === value)) setFilter(value as DrillState | 'all');
        }}><option value="all">All outcomes</option>{states.map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label>
        <WindowedRows key={filter} rows={outcomes} label="Simulated replay outcomes" row_key={item => item.message_id} row_height={messageHeight * 3}>
          {item => <div role="cell" className="moderation-review-row"><b>{item.message_id}</b>
            <span>{item.verdict && <VerdictChip verdict={item.verdict} />} {item.state.replaceAll('_', ' ')}</span>
            <small>{item.source} · {item.at}</small></div>}
        </WindowedRows>
      </NumberedPanel>
    </div>
  </>;
}
