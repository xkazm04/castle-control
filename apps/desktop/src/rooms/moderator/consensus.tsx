import { useState } from 'react';
import type { ConsensusGetResult } from '@castle-control/contract';
import { SectionHeading, StageFrame } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';

export function consensusLabel(result: ConsensusGetResult) {
  return result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind === 'all' ? copy.all_messages
    : result.filter.kind === 'emotes' ? copy.emotes_only : copy.text_only;
}

/** Room-local, read-only presentation. No action port is accepted. */
export function ConsensusTiles({ result }: { result: ConsensusGetResult }) {
  // Keep the four opinion tiles; report the unassigned remainder beneath them.
  return <><div className="moderator-tiles">{result.directions.filter(item => item.key !== 'other').map((item, index) => <div className="moderator-tile" key={item.key} data-direction={index % 4}>
    <span>{item.label}</span><b>{(item.share * 100).toFixed(1)}%</b>
    <small>{item.delta_3m === undefined ? copy.history_unavailable : copy.consensus_delta(item.delta_3m)}</small>
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
    : <p>{copy.consensus_empty}</p>}</>;
}

export function Consensus({ results }: { results: readonly ConsensusGetResult[] }) {
  const [selected, setSelected] = useState(0);
  const inks = ['azure', 'or', 'gules', 'ink'] as const;
  const result = results[selected];
  const directions = result?.directions ?? [];
  const timeline = directions[0]?.series ?? [];
  const first = timeline[0];
  const last = timeline.at(-1);
  const start = first ? copy.consensus_minute(0) : '';
  const duration = first && last ? (Date.parse(last.at) - Date.parse(first.at)) / 60000 : 0;
  const end = copy.consensus_minute(duration);
  const edge = (count: number) => timeline.map((point, index) => {
    const elapsed = first ? (Date.parse(point.at) - Date.parse(first.at)) / 60000 : 0;
    const share = directions.slice(0, count).reduce((sum, direction) => sum + (direction.series[index]?.share ?? 0), 0);
    return `${elapsed / (duration || 1) * 560},${170 - share * 170}`;
  });
  return <section className="moderator-consensus moderator-block">
    <SectionHeading title={copy.consensus} gloss={copy.consensus_caption} count={copy.illustrative} />
    <p className="moderator-hint">{copy.consensus_hint}</p>
    <StageFrame variant="print" className="moderator-print">
      <svg viewBox="0 0 560 170" preserveAspectRatio="none" role="img" aria-label={copy.consensus_plot}>
        {directions.map((item, index) => {
          return <polygon key={item.key} points={[...edge(index + 1), ...edge(index).reverse()].join(' ')} fill={`var(--${inks[index] ?? 'muted'})`}><title>{item.label}</title></polygon>;
        })}
      </svg><figcaption className="moderator-print-caption"><span>{start}</span><span>{end}</span></figcaption>
    </StageFrame>
    {first && last && directions[0] ? <p className="moderator-small moderator-reference">
      {copy.consensus_reference(start, end, directions[0].label, directions[0].share)}</p> : <p>{copy.consensus_empty}</p>}
    <div className="moderator-legend">{directions.map((item, index) => <span key={item.key} data-direction={index}>
      <i aria-hidden="true" style={index >= inks.length ? { background: 'var(--muted)' } : undefined} />{item.label}</span>)}</div>
    <ConsensusSelection results={results} selected={selected} on_select={setSelected} />
  </section>;
}
