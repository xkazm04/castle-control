import type { ConsensusGetResult } from '@castle-control/contract';
import { useState } from 'react';
import { moderationCopy } from './moderation-copy.js';

/** Read-only visualization. Its only inputs are consensus snapshots, never a command callback. */
export function ConsensusChart({ results }: { results: readonly ConsensusGetResult[] }) {
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState<string>();
  const result = results[selected] ?? results[0];
  if (!result) return <p>No consensus history available.</p>;
  const start = Date.parse(result.at) - result.window_s * 1000;
  return <div className="moderation-chart">
    <div className="moderation-toolbar"><span className="cc-kicker">{moderationCopy.consensus} · consensus</span>
      <label>Messages <select value={selected} onChange={event => { setSelected(Number(event.currentTarget.value)); setDirection(undefined); }}>
        {results.map((item, index) => <option key={index} value={index}>{item.filter.kind === 'emote' ? item.filter.emote
          : item.filter.kind === 'all' ? 'All messages' : item.filter.kind === 'emotes' ? 'Emotes only' : 'Text only'}</option>)}
      </select></label>
    </div>
    <svg viewBox="0 0 760 210" role="img" aria-label={`Opinion direction history over ${result.window_s / 60} minutes; simulated`}>
      {[0.25, 0.5, 0.75].map(share => <line key={share} x1="0" x2="760" y1={200 - share * 180} y2={200 - share * 180} className="moderation-gridline" />)}
      {result.directions.map((item, index) => {
        const points = item.series.map(point => `${Math.max(0, Math.min(760, (Date.parse(point.at) - start) / (result.window_s * 1000) * 760))},${200 - point.share * 180}`).join(' ');
        return <g key={item.key} data-direction={index % 4} opacity={direction && direction !== item.key ? 0.15 : 1}>
          <polygon points={`0,200 ${points} 760,200`} className="moderation-band" />
          <polyline points={points} className="moderation-series"><title>{item.label}: {(item.share * 100).toFixed(1)}%</title></polyline>
        </g>;
      })}
    </svg>
    <div className="moderation-directions">{result.directions.map((item, index) => <button key={item.key} type="button"
      data-direction={index % 4} aria-pressed={direction === item.key} onClick={() => setDirection(direction === item.key ? undefined : item.key)}>
      <span>{item.label}</span><b>{(item.share * 100).toFixed(1)}%</b>
      <small>{item.delta_3m === undefined ? 'History unavailable' : `${item.delta_3m >= 0 ? '+' : ''}${(item.delta_3m * 100).toFixed(1)} pp / 3 min`}</small>
    </button>)}</div>
    <p className="moderation-meta">{result.window_s / 60} min · {result.shed_count} messages shed · barred messages excluded · simulated</p>
  </div>;
}
