import { InkButton, Mark, Stamp, ThemeToggle } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Snapshot } from './model.js';

function uptime(at: string, started_at?: string) {
  if (!started_at) return undefined;
  const seconds = Math.max(0, Math.floor((Date.parse(at) - Date.parse(started_at)) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

/** live: on air · ok: connected · warn: reconnecting · down: disconnected/offline · sim: simulated · none: no value. */
type Tone = 'live' | 'ok' | 'warn' | 'down' | 'sim' | 'none';

/** One status-bar item: a state dot, a small-caps label and its value. No value reads "—" and the cell is muted. */
function Cell({ label, value, tone, name, href }: { label: string; value?: string; tone: Tone; name: string; href?: string }) {
  const empty = value === undefined;
  const body = <><i className="cc-cell__dot" aria-hidden="true" />
    <span className="cc-cell__text" aria-hidden="true"><small>{label}</small><b>{value ?? '—'}</b></span></>;
  const shared = { className: 'cc-cell', 'data-tone': tone, 'data-empty': empty || undefined, 'aria-label': name, title: name };
  return href ? <a href={href} {...shared}>{body}</a> : <span role="img" {...shared}>{body}</span>;
}

const connection = { connected: ['connected', 'ok'], reconnecting: ['reconnecting', 'warn'], down: ['disconnected', 'down'] } as const;

/** The status bar: every item is one Cell, absent summaries stay explicitly unknown (never offline or zero). */
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
  const twitch = !fixture && bridge ? ({ connected: 'connected', connecting: 'reconnecting', disconnected: 'down', error: 'down' } as const)[bridge.state] : undefined;
  const obs = !fixture && status ? (status.obs_connected ? 'connected' : 'down') : undefined;
  const live = stream?.live === true;
  return <header className="cc-rampart" data-role="status-bar">
    <a className="cc-brand" href="#/keep" aria-label="Castle Control, the whole keep">
      <Mark /><span className="cc-wordmark" data-text="Castle Control">Castle Control</span>
    </a>
    <div className="cc-cells" aria-label="Stream status">
      {stream ? <Cell label="Stream" value={live ? 'On air' : 'Offline'} tone={live ? 'live' : 'down'} name={live ? 'On air' : 'Offline'} />
        : simulated ? <Cell label="Stream" value="Simulated" tone="sim" name="On air is simulated: nothing is broadcast" />
          : <Cell label="Stream" tone="none" name="ON AIR unknown" />}
      <Cell label="Viewers" {...(live && stream.viewer_count !== undefined ? { value: String(stream.viewer_count) } : {})}
        tone={live && stream.viewer_count !== undefined ? 'ok' : 'none'} name={live && stream.viewer_count !== undefined ? `${stream.viewer_count} viewers` : 'Viewers unknown'} />
      {(() => {
        const time = live && status ? uptime(status.at, stream.started_at) : undefined;
        return <Cell label="Uptime" {...(time ? { value: time } : {})} tone={time ? 'ok' : 'none'} name={time ? `Uptime ${time}` : 'Uptime unknown'} />;
      })()}
    </div>
    <div className="cc-cells" aria-label={fixture ? 'Connections · simulated' : 'Connections'}>
      {twitch ? <Cell label="Twitch" value={connection[twitch][0]} tone={connection[twitch][1]} name={`Twitch: ${connection[twitch][0]}`} />
        : simulated ? <Cell label="Twitch" value="simulated" tone="sim" name="Twitch simulated" />
          : <Cell label="Twitch" tone="none" name="Twitch unknown" />}
      {obs ? <Cell label="OBS" value={connection[obs][0]} tone={connection[obs][1]} name={`OBS: ${connection[obs][0]}`} href="#/stream" />
        : simulated ? <Cell label="OBS" value="simulated" tone="sim" name="OBS simulated" href="#/stream" />
          : <Cell label="OBS" tone="none" name="OBS unknown" href="#/stream" />}
      {gatehouse ? <Cell label="Gatehouse" href="#/chamber/moderator" tone={gatehouse.shield ? 'warn' : gatehouse.armed_rules > 0 ? 'ok' : 'sim'}
        value={`${gatehouse.shield ? 'Bridge up · ' : ''}Armed ${gatehouse.armed_rules} · Watching ${gatehouse.shadow_rules}`}
        name={`Moderator: ${gatehouse.armed_rules} rules armed (they act), ${gatehouse.shadow_rules} watching (shadow: reports only). ${gatehouse.shield ? 'Bridge up: Shield Mode is on.' : 'Open the Gatehouse.'}`} />
        : simulated ? <Cell label="Gatehouse" value="simulated" tone="sim" name="Gatehouse simulated" href="#/chamber/moderator" />
          : <Cell label="Gatehouse" tone="none" name="Gatehouse unknown" href="#/chamber/moderator" />}
    </div>
    <span className="cc-spacer" />
    {simulated && <Stamp kind="simulated" />}
    <ThemeToggle theme={theme} onChange={on_theme_change} />
    {steward && <InkButton disabled={!on_steward} onClick={on_steward} title="Talk to the Steward (/)">Steward</InkButton>}
  </header>;
}
