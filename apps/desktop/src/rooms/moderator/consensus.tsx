import { useState } from 'react';
import type { ConsensusGetResult } from '@castle-control/contract';
import { SectionHeading, StageFrame } from '@castle-control/ui';
import { illustrativeConsensus } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

export function consensusLabel(result: ConsensusGetResult) {
  return result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind === 'all' ? copy.all_messages
    : result.filter.kind === 'emotes' ? copy.emotes_only : copy.text_only;
}

/** Room-local, read-only presentation. No action port is accepted. */
export function ConsensusTiles({ result }: { result: ConsensusGetResult }) {
  return <><div className="moderator-tiles">{result.directions.map((item, index) => <div className="moderator-tile" key={item.key} data-direction={index % 4}>
    <span>{item.label}</span><b>{(item.share * 100).toFixed(1)}%</b>
    <small>{item.delta_3m === undefined ? copy.history_unavailable : copy.consensus_delta(item.delta_3m)}</small>
  </div>)}</div></>;
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
  const directions = ['go-left', 'hype', 'skip-boss', 'go-right'] as const;
  return <section className="moderator-consensus moderator-block">
    <SectionHeading title={copy.consensus} gloss={copy.consensus_caption} count={copy.illustrative} />
    <p className="moderator-hint">{copy.consensus_hint}</p>
    <StageFrame variant="print" className="moderator-print">
      <svg viewBox="0 0 560 170" preserveAspectRatio="none" role="img" aria-label={copy.consensus_plot}>
        {directions.map((key, index) => {
          const edge = (end: number) => illustrativeConsensus.map((row, minute) =>
            `${minute / 14 * 560},${170 - directions.slice(0, end).reduce((sum, direction) => sum + row[direction], 0) / 100 * 170}`);
          return <polygon key={key} points={[...edge(index + 1), ...edge(index).reverse()].join(' ')} fill={`var(--${inks[index]})`}><title>{key}</title></polygon>;
        })}
      </svg><figcaption className="moderator-print-caption"><span>{copy.min_start}</span><span>{copy.min_end}</span></figcaption>
    </StageFrame>
    <p className="moderator-small moderator-reference">{copy.consensus_reference}</p>
    <div className="moderator-legend">{results[0]?.directions.map((item, index) => <span key={item.key} data-direction={index % 4}><i aria-hidden="true" />{item.label}</span>)}</div>
    <ConsensusSelection results={results} selected={selected} on_select={setSelected} />
  </section>;
}
