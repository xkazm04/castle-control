import { ConnectionMark, GatehouseChip, InkButton, Mark, StatusChip, ThemeToggle } from '@castle-control/ui';
import type { ConnectionState } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Snapshot } from './model.js';

function uptime(at: string, started_at?: string) {
  if (!started_at) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.parse(at) - Date.parse(started_at)) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

/** App composition of kit primitives: absent summaries stay explicitly unknown.
 * The kit's boolean-only Rampart cannot represent absent stream/moderation data.
 * Reuse its existing layout classes without changing the shared kit or tokens. */
export function DesktopRampart({ snapshot, theme, on_theme_change }: {
  snapshot: Snapshot; theme: Theme; on_theme_change: (theme: Theme) => void;
}) {
  const { status, bridge } = snapshot;
  const simulated = snapshot.mode === 'fixture' || status?.simulated === true;
  const stream = simulated ? undefined : status?.stream;
  const gatehouse = simulated ? undefined : status?.gatehouse;
  const twitch: ConnectionState | undefined = !simulated && bridge ? ({ connected: 'connected', connecting: 'reconnecting', disconnected: 'down', error: 'down' } as const)[bridge.state] : undefined;
  return <header className="cc-rampart">
    <a className="cc-brand" href="#/lottery" aria-label="Castle Control, the whole keep">
      <Mark /><span className="cc-wordmark" data-text={'Castle\nControl'}>Castle<br />Control</span>
    </a>
    <div className="cc-live-group" aria-label="Stream status">
      {stream ? <span className="cc-air" data-live={stream.live}><i />{stream.live ? 'On air' : 'Offline'}</span>
        : <StatusChip variant="dash">{simulated ? 'ON AIR simulated' : 'ON AIR unknown'}</StatusChip>}
      <span className="cc-figure"><b>{stream?.live ? stream.viewer_count ?? 'Unknown' : stream ? '—' : 'Unknown'}</b><small>viewers</small></span>
      <span className="cc-figure"><b>{stream?.live && status ? uptime(status.at, stream.started_at) : stream ? '—' : 'Unknown'}</b><small>uptime</small></span>
    </div>
    <span className="cc-separator" />
    <div className="cc-link-group">
      {twitch ? <ConnectionMark name="Twitch" state={twitch} /> : <StatusChip variant="dash">{simulated ? 'Twitch simulated' : 'Twitch unknown'}</StatusChip>}
      {!simulated && status ? <ConnectionMark name="OBS" state={status.obs_connected ? 'connected' : 'down'} /> : <StatusChip variant="dash">{simulated ? 'OBS simulated' : 'OBS unknown'}</StatusChip>}
    </div>
    {gatehouse ? <GatehouseChip armed={gatehouse.armed_rules} watching={gatehouse.shadow_rules}
      shield={gatehouse.shield} href="#/moderator" /> : <a href="#/moderator"><StatusChip variant="dash">{simulated ? 'Gatehouse simulated' : 'Gatehouse unknown'}</StatusChip></a>}
    <span className="cc-spacer" />
    {simulated && <span className="cc-sample">Simulated</span>}
    <ThemeToggle theme={theme} onChange={on_theme_change} />
    <InkButton disabled title="The Steward arrives in a later milestone">Steward</InkButton>
  </header>;
}
