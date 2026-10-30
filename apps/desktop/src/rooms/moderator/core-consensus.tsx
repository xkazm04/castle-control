import { useState } from 'react';
import type { ConsensusFilter, ConsensusGetResult } from '@castle-control/contract';
import { SectionHeading, StageFrame } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ConsensusTiles, consensusLabel } from './consensus.jsx';

function CorePlot({ result }: { result: ConsensusGetResult }) {
  const inks = ['azure', 'or', 'gules', 'ink'] as const;
  return <StageFrame variant="print" className="moderator-print" aria-label={copy.core_opinion_directions}><svg viewBox="0 0 560 170" preserveAspectRatio="none" role="img" aria-label={copy.core_consensus_plot}>
    {result.directions.map((direction, index) => {
      const points = direction.series.map((point, position) => `${position / Math.max(1, direction.series.length - 1) * 560},${170 - point.share * 170}`).join(' ');
      return <polyline key={direction.key} points={points} fill="none" stroke={`var(--${inks[index % 4]})`}><title>{direction.label}</title></polyline>;
    })}
  </svg></StageFrame>;
}

export function CoreConsensus({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const [kind, setKind] = useState<ConsensusFilter['kind']>('all');
  const [emote, setEmote] = useState('');
  const result = state.consensus;
  return <section className="moderator-consensus moderator-block moderator-core-consensus">
    <SectionHeading title={copy.consensus} gloss={copy.core_consensus_gloss} />
    <p>{copy.core_consensus_note}</p>
    <form onSubmit={event => {
      event.preventDefault();
      void port.consensus({ filter: kind === 'emote' ? { kind, emote } : { kind }, window_s: 900 });
    }}>
      <div className="moderator-chip-toggles" role="group" aria-label={copy.core_consensus_filters}>
        {(['all', 'emotes', 'text', 'emote'] as const).map(value => <button type="button" className="moderator-chip-toggle" key={value}
          disabled={state.busy} aria-pressed={kind === value} onClick={() => setKind(value)}>
          {value === 'all' ? copy.all_messages : value === 'emotes' ? copy.emotes_only : value === 'text' ? copy.text_only : copy.one_emote}</button>)}
      </div>
      {kind === 'emote' && <label>{copy.emote}<input value={emote} required disabled={state.busy}
        onChange={event => setEmote(event.currentTarget.value)} /></label>}
      <button type="submit" disabled={state.busy || (kind === 'emote' && !emote.trim())}>{copy.refresh_consensus}</button>
    </form>
    {result ? <><p>{consensusLabel(result)}</p><CorePlot result={result} /><ConsensusTiles result={result} />
      <p className="moderator-small">{copy.core_consensus_summary(result.shed_count, result.window_s, result.at)}</p>
      {!result.directions.length && <p>{copy.core_directions_empty}</p>}</> : <p>{copy.core_consensus_empty}</p>}
  </section>;
}
