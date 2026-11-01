import { useState } from 'react';
import { InkButton } from './primitives.jsx';
import { rowWindow } from './windowed-rows.jsx';
import './rule-table.css';

export type RuleRow = { id: string; name: string; match: string; action: string; hits?: string; mode: 'shadow' | 'armed' };

/** One windowing rule, shared with WindowedRows. */
export function visibleRange(total: number, scroll_top: number) {
  return rowWindow(total, scroll_top);
}

export function RuleTable({ rules, onModeChange }: { rules: readonly RuleRow[]; onModeChange: (id: string, mode: RuleRow['mode']) => void }) {
  const [scrollTop, setScrollTop] = useState(0);
  const range = visibleRange(rules.length, scrollTop);
  return <div className="cc-rule-scroll" role="region" aria-label="Moderation rules" tabIndex={0}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
    <table className="cc-rule-table" aria-rowcount={rules.length + 1}>
      <thead><tr><th scope="col">Rule</th><th scope="col">Matches</th><th scope="col">Does</th><th scope="col" className="cc-rule-hits">Hits</th><th scope="col">Mode</th></tr></thead>
      <tbody>
        {range.before > 0 && <tr aria-hidden="true" className="cc-table-spacer"><td colSpan={5} style={{ height: range.before }} /></tr>}
        {rules.slice(range.start, range.end).map((rule, index) => <tr key={rule.id} aria-rowindex={range.start + index + 2}>
          <th scope="row">{rule.name}</th><td>{rule.match}</td><td>{rule.action}</td><td className="cc-rule-hits">{rule.hits ?? '—'}</td><td>
            <InkButton size="small" variant={rule.mode === 'armed' ? 'plate' : 'ghost'}
              aria-label={`${rule.name}: ${rule.mode === 'armed' ? 'Armed, acts' : 'Watching, reports only'}`}
              aria-pressed={rule.mode === 'armed'} onClick={() => onModeChange(rule.id, rule.mode === 'armed' ? 'shadow' : 'armed')}>
              {rule.mode === 'armed' ? 'Armed' : 'Watching'}
            </InkButton>
          </td></tr>)}
        {range.after > 0 && <tr aria-hidden="true" className="cc-table-spacer"><td colSpan={5} style={{ height: range.after }} /></tr>}
      </tbody>
    </table>
    {rules.length === 0 && <p className="cc-no-rules">No rules configured. New rules start watching.</p>}
  </div>;
}
