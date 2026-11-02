import { useState } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ConsensusGetResult } from '@castle-control/contract';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { RoomKeyBadge } from '../../shell/steward-keys.jsx';

export function consensusLabel(result: ConsensusGetResult) {
  return result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind === 'all' ? copy.all_messages
    : result.filter.kind === 'emotes' ? copy.emotes_only : copy.text_only;
}

/** Room-local, read-only presentation. No action port is accepted. */
export function ConsensusTiles({ result, compact = false }: { result: ConsensusGetResult; compact?: boolean }) {
  // Keep the four opinion tiles; report the unassigned remainder beneath them.
  return <><div className="moderator-tiles">{result.directions.filter(item => item.key !== 'other').map((item, index) => <div className="moderator-tile" key={item.key} data-direction={index % 4}>
    <i aria-hidden="true">{['i', 'ii', 'iii', 'iv'][index % 4]}</i><span>{item.label}</span><b>{(item.share * 100).toFixed(1)}%</b>
    {!compact && <small>{item.delta_3m === undefined ? copy.history_unavailable : copy.consensus_delta(item.delta_3m)}</small>}
  </div>)}</div>{result.directions.filter(item => item.key === 'other').map(item =>
    <p className="moderator-small" key={item.key}>{item.label} · {(item.share * 100).toFixed(1)}%</p>)}</>;
}

/** Controlled toggles permit fixture selection without changing shared ConsensusChart. */
export function ConsensusSelection({ results, selected, on_select }: {
  results: readonly ConsensusGetResult[]; selected: number; on_select: (index: number) => void;
}) {
  const result = results[selected];
  return <><div className="moderator-chip-toggles" role="group" aria-label={copy.consensus_filters}>
    {results.map((item, index) => <button type="button" className="moderator-chip-toggle" key={consensusLabel(item)}
      aria-pressed={index === selected} onClick={() => on_select(index)}>{consensusLabel(item)}</button>)}
  </div>{result ? <><ConsensusTiles result={result} /><p className="moderator-small">{copy.consensus_summary(result.shed_count)}</p></>
    : <EmptyState compact title={copy.consensus_empty} />}</>;
}

const roman = ['i', 'ii', 'iii', 'iv', 'v'];

/** The herald's chart: one inked line per direction over the window, the leader washed beneath. */
export function Consensus({ results, selected: chosen, on_select, caption, compact = false }: {
  results: readonly ConsensusGetResult[]; selected?: number | undefined; on_select?: ((index: number) => void) | undefined;
  compact?: boolean;
  /** Optional note under the chart, e.g. that the Play demo moved it. */
  caption?: string | undefined;
}) {
  const [own, setOwn] = useState(0);
  const selected = chosen ?? own;
  const result = results[selected];
  const directions = result?.directions ?? [];
  const timeline = directions[0]?.series ?? [];
  const first = timeline[0];
  const last = timeline.at(-1);
  const start = first ? copy.consensus_minute(0) : '';
  const duration = first && last ? (Date.parse(last.at) - Date.parse(first.at)) / 60000 : 0;
  const end = copy.consensus_minute(duration);
  const top = Math.max(0.5, Math.ceil(Math.max(0, ...directions.flatMap(item => item.series.map(point => point.share))) * 10) / 10);
  const left = compact ? 8 : 60, right = compact ? 348 : 640, bottom = compact ? 78 : 236;
  const x = (at: string) => left + (first ? (Date.parse(at) - Date.parse(first.at)) / 60000 : 0) / (duration || 1) * (right - left);
  const y = (share: number) => bottom - share / top * (compact ? 70 : 220);
  const line = (index: number) => (directions[index]?.series ?? []).map(point => `${x(point.at).toFixed(1)},${y(point.share).toFixed(1)}`);
  const ticks = Array.from({ length: Math.round(top * 10) + 1 }, (_, index) => index / 10);
  return <section className="moderator-consensus gh-herald-chart" aria-label={copy.consensus}>
    <div className="gh-chartbar">{!compact && <p className="moderator-hint">{copy.consensus_hint}</p>}
      <ConsensusFilters results={results} selected={selected} on_select={on_select ?? setOwn} compact={compact} /></div>
    <svg className="gh-chart cc-folio-chart" viewBox={compact ? '0 0 360 86' : '0 0 700 262'} role="img" aria-label={copy.consensus_plot}>
      {ticks.map(share => <g key={share}><path className="fc-rule" d={`M${left} ${y(share)}H${right}`} />
        {!compact && <text className="fc-lab" x="52" y={y(share) + 4} textAnchor="end">{Math.round(share * 100)}%</text>}</g>)}
      {!compact && <><path className="fc-rule fc-rule--margin" d="M60 16V236" /><path className="fc-rule fc-rule--base" d="M60 236H640" />
      <text className="fc-labc" x="60" y="256">{start}</text><text className="fc-labc" x="640" y="256" textAnchor="end">{end}</text></>}
      {!compact && timeline.length > 4 && <><path className="fc-now" d={`M${x(timeline[timeline.length - 4]?.at ?? '')} 16V236`} />
        <text className="fc-lab" x={x(timeline[timeline.length - 4]?.at ?? '') + 4} y="28">last 3 min</text></>}
      {directions[0] && <polygon className="fc-area" points={[...line(0), `${x(last?.at ?? '')},${bottom}`, `${left},${bottom}`].join(' ')} />}
      {directions.map((item, index) => <g key={item.key}><polyline className="fc-case" points={line(index).join(' ')} />
        <polyline className={`fc-line fc-s${index % 4}`} points={line(index).join(' ')}><title>{item.label}</title></polyline></g>).reverse()}
      {directions.map((item, index) => !compact && last && <g key={item.key}><circle className={`fc-end fc-e${index % 4}`} cx="640" cy={y(item.share)} r="9" />
        <text className="fc-num" x="640" y={y(item.share) + 4}>{roman[index] ?? ''}</text></g>)}
    </svg>
    {!compact && (first && last && directions[0] ? <p className="moderator-small moderator-reference">
      {copy.consensus_reference(start, end, directions[0].label, directions[0].share)}</p> : <EmptyState compact title={copy.consensus_empty} />)}
    {result ? <><ConsensusTiles result={result} compact={compact} />{!compact && <p className="cc-gloss-note">{copy.consensus_summary(result.shed_count)}{caption ? ` · ${caption}` : ''}</p>}</>
      : <EmptyState compact title={copy.consensus_empty} />}
  </section>;
}

function ConsensusFilters({ results, selected, on_select, compact }: {
  results: readonly ConsensusGetResult[]; selected: number; on_select: (index: number) => void; compact: boolean;
}) {
  return <div className="cc-seg cc-seg--sm moderator-chip-toggles" role="group" aria-label={copy.consensus_filters}>
    <RoomKeyBadge room="moderator" action="filter" />
    {results.map((item, index) => <button type="button" className="moderator-chip-toggle" key={consensusLabel(item)}
      aria-label={compact ? consensusLabel(item) : undefined} aria-pressed={index === selected} onClick={() => on_select(index)}>
      {compact ? item.filter.kind === 'all' ? 'All' : item.filter.kind === 'emotes' ? 'Emotes' : item.filter.kind === 'text' ? 'Text' : item.filter.emote : consensusLabel(item)}</button>)}
  </div>;
}
