import { useId, useState } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ConsensusFilter, ConsensusGetResult } from '@castle-control/contract';
import { FieldGroup, InkButton } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ConsensusTiles, consensusLabel } from './consensus.jsx';
import { ClockTime } from './presentation.jsx';
import { RoomKeyBadge } from '../../shell/steward-keys.jsx';

/** The y-range follows the data (90th percentile, headroom), so warm-up spikes do not squash the lines. */
function plotTop(result: ConsensusGetResult) {
  // Fit on the data after the first minute of chat: the first one or two messages read as 100%.
  const start = Math.min(...result.directions.flatMap(direction => direction.series.filter(point => point.share > 0).map(point => Date.parse(point.at))));
  const settled = result.directions.flatMap(direction => direction.series.filter(point => Date.parse(point.at) >= start + 60000).map(point => point.share));
  const shares = (settled.length ? settled : result.directions.flatMap(direction => direction.series.map(point => point.share))).filter(Number.isFinite).sort((a, b) => a - b);
  const p90 = shares[Math.floor((shares.length - 1) * 0.9)] ?? 0;
  return Math.min(1, Math.max(0.2, Math.ceil(p90 * 1.25 * 10) / 10));
}

function CorePlot({ result, compact = false }: { result: ConsensusGetResult; compact?: boolean }) {
  const inks = ['azure', 'or', 'gules', 'ink'] as const;
  const height = 140;
  const top = plotTop(result);
  const y = (share: number) => Math.max(0, height - Math.min(share, top) / top * height);
  const ticks = [0, top / 2, top];
  const svg = <svg className="gh-chart" viewBox={`0 0 560 ${height}`} preserveAspectRatio="none"
    role="img" aria-label={copy.core_consensus_plot}>
    {ticks.map(share => <path key={share} className="gh-grid" d={`M0 ${y(share).toFixed(1)}H560`} />)}
    {result.directions.map((direction, index) => {
      const points = direction.series.map((point, position) => `${(position / Math.max(1, direction.series.length - 1) * 560).toFixed(1)},${y(point.share).toFixed(1)}`).join(' ');
      return <polyline key={direction.key} className={direction.key === 'other' ? 'gh-other' : undefined} points={points} fill="none" stroke={`var(--${inks[index % 4]})`}><title>{direction.label}</title></polyline>;
    })}
  </svg>;
  return <div className={`gh-chart-frame${compact ? '' : ' gh-chart-frame--full'}`} role="group" aria-label={copy.core_opinion_directions}><div className="gh-chart-plot">{svg}
    {ticks.map(share => <span key={share} className="gh-chart-tick" aria-hidden="true" style={{ top: `${(y(share) / height * 100).toFixed(2)}%` }}>{Math.round(share * 100)}%</span>)}</div>
    <span className="gh-chart-time" aria-hidden="true"><span>{Math.round(result.window_s / 60)} min ago</span><span>now</span></span></div>;
}

export function CoreConsensus({ state, port, compact = false }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort; compact?: boolean }) {
  const emote_id = useId();
  const [kind, setKind] = useState<ConsensusFilter['kind']>('all');
  const [emote, setEmote] = useState('');
  const result = state.consensus;
  // One note when no direction has a 3-minute history, rather than one per direction.
  const history = result?.directions.some(direction => direction.delta_3m !== undefined) ?? false;
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
    {result ? <>{!compact && <p>{consensusLabel(result)}</p>}<CorePlot result={result} compact={compact} /><ConsensusTiles result={result} compact={compact || !history} />
      {!compact && !history && <p className="moderator-small">{copy.history_unavailable}</p>}
      {!compact && <p className="moderator-small">{copy.core_consensus_summary(result.shed_count, result.window_s, '')}<ClockTime at={result.at} /></p>}
      {!result.directions.length && <EmptyState compact title={copy.core_directions_empty} />}</> : <EmptyState compact title={copy.core_consensus_empty} />}
  </section>;
}
