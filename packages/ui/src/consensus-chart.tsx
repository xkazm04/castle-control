import { useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from './primitives.jsx';
import './consensus-chart.css';

export type ConsensusDirection = {
  key: string; label: string; share: number; change_label: string;
  series: readonly { at: string; share: number }[];
};
export type ConsensusResult = {
  label: string; at: string; window_s: number; aria_label: string; summary: ReactNode;
  directions: readonly ConsensusDirection[];
};
export type ConsensusChartProps = {
  results: readonly ConsensusResult[]; title: ReactNode; filter_label: string; empty_state: ReactNode;
};

/** Read-only visualization: the caller supplies labels and snapshots, never a command port. */
export function ConsensusChart({ results, title, filter_label, empty_state }: ConsensusChartProps) {
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState<string>();
  const index = Math.max(0, Math.min(selected, results.length - 1));
  const result = results[index];
  if (!result) return <EmptyState compact title={empty_state} />;
  const span = result.window_s * 1000;
  const start = Date.parse(result.at) - span;
  return <div className="cc-consensus-chart">
    <div className="cc-consensus-toolbar"><span className="cc-kicker">{title}</span>
      <label>{filter_label} <select value={index} onChange={event => { setSelected(Number(event.currentTarget.value)); setDirection(undefined); }}>
        {results.map((item, index) => <option key={index} value={index}>{item.label}</option>)}
      </select></label>
    </div>
    <svg viewBox="0 0 760 210" role="img" aria-label={result.aria_label}>
      {[0.25, 0.5, 0.75].map(share => <line key={share} x1="0" x2="760" y1={200 - share * 180} y2={200 - share * 180} className="cc-consensus-gridline" />)}
      {result.directions.map((item, index) => {
        const points = item.series.flatMap(point => {
          const x = (Date.parse(point.at) - start) / span * 760;
          return Number.isFinite(x) && Number.isFinite(point.share)
            ? [`${Math.max(0, Math.min(760, x))},${200 - Math.max(0, Math.min(1, point.share)) * 180}`] : [];
        }).join(' ');
        return <g key={item.key} data-direction={index % 4} opacity={direction && direction !== item.key ? 0.15 : 1}>
          <polygon points={`0,200 ${points} 760,200`} className="cc-consensus-band" />
          <polyline points={points} className="cc-consensus-series"><title>{item.label}: {(item.share * 100).toFixed(1)}%</title></polyline>
        </g>;
      })}
    </svg>
    <div className="cc-consensus-directions">{result.directions.map((item, index) => <button key={item.key} type="button"
      data-direction={index % 4} aria-pressed={direction === item.key} onClick={() => setDirection(direction === item.key ? undefined : item.key)}>
      <span>{item.label}</span><b>{(item.share * 100).toFixed(1)}%</b><small>{item.change_label}</small>
    </button>)}</div>
    <p className="cc-consensus-meta">{result.summary}</p>
  </div>;
}
