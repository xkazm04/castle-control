import { useId, useState } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ConsensusFilter, ConsensusGetResult } from '@castle-control/contract';
import { FieldGroup, InkButton, StageFrame } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ConsensusTiles, consensusLabel } from './consensus.jsx';
import { ClockTime } from './presentation.jsx';
import { RoomKeyBadge } from '../../shell/steward-keys.jsx';

function CorePlot({ result, compact = false }: { result: ConsensusGetResult; compact?: boolean }) {
  const inks = ['azure', 'or', 'gules', 'ink'] as const;
  return <StageFrame variant="print" className="moderator-print" aria-label={copy.core_opinion_directions}><svg viewBox={compact ? '0 0 560 130' : '0 0 560 170'} role="img" aria-label={copy.core_consensus_plot}>
    {result.directions.map((direction, index) => {
      const height = compact ? 130 : 170;
      const points = direction.series.map((point, position) => `${position / Math.max(1, direction.series.length - 1) * 560},${height - point.share * height}`).join(' ');
      return <polyline key={direction.key} points={points} fill="none" stroke={`var(--${inks[index % 4]})`}><title>{direction.label}</title></polyline>;
    })}
  </svg></StageFrame>;
}

export function CoreConsensus({ state, port, compact = false }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort; compact?: boolean }) {
  const emote_id = useId();
  const [kind, setKind] = useState<ConsensusFilter['kind']>('all');
  const [emote, setEmote] = useState('');
  const result = state.consensus;
  return <section className={`moderator-consensus moderator-block moderator-core-consensus${compact ? ' gh-herald--compact' : ''}`}>
    {!compact && <p className="gh-sm">{copy.core_consensus_note}</p>}
    {!compact && <form onSubmit={event => {
      event.preventDefault();
      if (state.busy || (kind === 'emote' && !emote.trim())) return;
      void port.consensus({ filter: kind === 'emote' ? { kind, emote: emote.trim() } : { kind }, window_s: 900 });
    }}>
      <div className="moderator-chip-toggles" role="group" aria-label={copy.core_consensus_filters}>
        <RoomKeyBadge room="moderator" action="filter" />
        {(['all', 'emotes', 'text', 'emote'] as const).map(value => <InkButton size="room" type="button" className="moderator-chip-toggle" key={value}
          disabled={state.busy} aria-label={compact ? value === 'all' ? copy.all_messages : value === 'emotes' ? copy.emotes_only : value === 'text' ? copy.text_only : copy.one_emote : undefined}
          aria-pressed={kind === value} onClick={() => setKind(value)}>
          {compact ? value === 'all' ? 'All' : value === 'emotes' ? 'Emotes' : value === 'text' ? 'Text' : 'Emote'
            : value === 'all' ? copy.all_messages : value === 'emotes' ? copy.emotes_only : value === 'text' ? copy.text_only : copy.one_emote}</InkButton>)}
      </div>
      {kind === 'emote' && <FieldGroup label={copy.emote} control_id={emote_id}><input id={emote_id} value={emote} required disabled={state.busy}
        onChange={event => setEmote(event.currentTarget.value)} /></FieldGroup>}
      <InkButton size="room" type="submit" disabled={state.busy || (kind === 'emote' && !emote.trim())}>{copy.refresh_consensus}</InkButton>
    </form>}
    {result ? <>{!compact && <p>{consensusLabel(result)}</p>}<CorePlot result={result} compact={compact} /><ConsensusTiles result={result} compact={compact} />
      {!compact && <p className="moderator-small">{copy.core_consensus_summary(result.shed_count, result.window_s, '')}<ClockTime at={result.at} /></p>}
      {!result.directions.length && <EmptyState compact title={copy.core_directions_empty} />}</> : <EmptyState compact title={copy.core_consensus_empty} />}
  </section>;
}
