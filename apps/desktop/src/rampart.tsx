import { ConnectionMark, GatehouseChip, InkButton, Mark, Stamp, StatusChip, ThemeToggle } from '@castle-control/ui';
import type { ConnectionState } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Snapshot } from './model.js';

function uptime(at: string, started_at?: string) {
  if (!started_at) return undefined;
  const seconds = Math.max(0, Math.floor((Date.parse(at) - Date.parse(started_at)) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

/** A rampart figure: an absent value reads as a quiet dash, and says "Unknown" to assistive tech. */
function Figure({ value, label }: { value: string | number | undefined; label: string }) {
  return <span className="cc-figure" data-known={value !== undefined}>
    <b>{value ?? <><span aria-hidden="true">—</span><span className="cc-sr">Unknown</span></>}</b><small>{label}</small>
  </span>;
}

function SimulatedConnection({ name }: { name: 'Twitch' | 'OBS' | 'Gatehouse' }) {
  return <span className="cc-rampart-link" role="img" aria-label={`${name} simulated`} title={`${name} simulated`}>
    <i aria-hidden="true" /><span aria-hidden="true">{name}</span>
  </span>;
}

/** App composition of kit primitives: absent summaries stay explicitly unknown.
 * The kit's boolean-only Rampart cannot represent absent stream/moderation data.
 * Reuse its existing layout classes without changing the shared kit or tokens. */
export function DesktopRampart({ snapshot, theme, on_theme_change, on_steward, steward = true }: {
  snapshot: Snapshot; theme: Theme; on_theme_change: (theme: Theme) => void; on_steward?: () => void;
  /** False on the Keep, where there is no Steward dock to talk to. */
  steward?: boolean;
}) {
  const { status, bridge } = snapshot;
  const fixture = snapshot.mode === 'fixture';
  const simulated = fixture || status?.simulated === true;
  const stream = simulated ? undefined : status?.stream;
  const gatehouse = simulated ? undefined : status?.gatehouse;
  const twitch: ConnectionState | undefined = !fixture && bridge ? ({ connected: 'connected', connecting: 'reconnecting', disconnected: 'down', error: 'down' } as const)[bridge.state] : undefined;
  return <header className="cc-rampart" data-role="status-bar">
    <a className="cc-brand" href="#/keep" aria-label="Castle Control, the whole keep">
      <Mark /><span className="cc-wordmark" data-text="Castle Control">Castle Control</span>
    </a>
    <div className="cc-live-group" aria-label="Stream status">
      {stream ? <Stamp kind={stream.live ? 'on-air' : 'off-air'} word={stream.live ? 'On air' : 'Offline'} />
        : simulated ? <Stamp kind="off-air" word="On air · simulated" /> : <StatusChip variant="dash">ON AIR unknown</StatusChip>}
      {/* Figures exist only on air: off air or simulated, the stamp already says nothing is broadcast. */}
      {stream?.live && <div className="cc-rampart-figures">
        <Figure label="viewers" value={stream.viewer_count} />
        <Figure label="uptime" value={status ? uptime(status.at, stream.started_at) : undefined} />
      </div>}
    </div>
    <span className="cc-separator" />
    <div className="cc-link-group" aria-label={fixture ? 'Connections · simulated' : 'Connections'}>
      {twitch ? <ConnectionMark name="Twitch" state={twitch} /> : simulated ? <SimulatedConnection name="Twitch" /> : <StatusChip variant="dash">Twitch unknown</StatusChip>}
      <a href="#/stream" title="Set up OBS">{!fixture && status ? <ConnectionMark name="OBS" state={status.obs_connected ? 'connected' : 'down'} />
        : simulated ? <SimulatedConnection name="OBS" /> : <StatusChip variant="dash">OBS unknown</StatusChip>}</a>
      {gatehouse ? <GatehouseChip armed={gatehouse.armed_rules} watching={gatehouse.shadow_rules}
        shield={gatehouse.shield} href="#/chamber/moderator" /> : <a href="#/chamber/moderator">{simulated
          ? <SimulatedConnection name="Gatehouse" /> : <StatusChip variant="dash">Gatehouse unknown</StatusChip>}</a>}
    </div>
    <span className="cc-spacer" />
    {simulated && <Stamp kind="simulated" />}
    <ThemeToggle theme={theme} onChange={on_theme_change} />
    {steward && <InkButton disabled={!on_steward} onClick={on_steward} title="Talk to the Steward (/)">Steward</InkButton>}
  </header>;
}
