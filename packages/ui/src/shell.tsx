import type { ReactNode } from 'react';
import type { Theme } from '@castle-control/tokens';
import { ConnectionMark, GatehouseChip } from './chips.jsx';
import type { ConnectionState } from './chips.jsx';
import { InkButton, Mark, ThemeToggle } from './primitives.jsx';
import type { ModuleId } from './primitives.jsx';
import './shell.css';

export const chambers = [
  { id: 'lottery', number: '1', name: 'Lot Chamber', description: 'Lottery manager' },
  { id: 'moderator', number: '2', name: 'Gatehouse', description: 'AI moderator' },
  { id: 'visuals', number: '3', name: 'Beacons', description: 'Contribution visuals' },
  { id: 'studio', number: '4', name: 'Map Room', description: 'Extension studio' },
] as const;

// The shell owner can consume one table from an element's onKeyDown handler.
// This kit deliberately installs no global handlers or persistence.
export const keymap = [
  { key: '0', action: 'overview' },
  ...chambers.map(({ id, number }) => ({ key: number, action: id })),
  { key: 'Escape', action: 'back' },
  { key: '/', action: 'steward' },
  { key: 'Enter', action: 'open' },
  { key: 'Delete', action: 'tear' },
  { key: ' ', action: 'seal' },
] as const;

export type RampartProps = {
  on_air: boolean; viewers: string; uptime: string; twitch: ConnectionState; obs: ConnectionState;
  armed: number; watching: number; shield: boolean; gatehouse_href: string; home_href: string;
  theme: Theme; on_theme_change: (theme: Theme) => void;
  data_kind?: 'sample' | 'simulated'; on_settings?: () => void; on_steward?: () => void;
};

export function Rampart(props: RampartProps) {
  return <header className="cc-rampart">
    <a className="cc-brand" href={props.home_href} aria-label="Castle Control, the whole keep">
      <Mark /><span className="cc-wordmark" data-text={'Castle\nControl'}>Castle<br />Control</span>
    </a>
    <div className="cc-live-group">
      <span className="cc-air" data-live={props.on_air}><i />{props.on_air ? 'On air' : 'Offline'}</span>
      <span className="cc-figure"><b>{props.on_air ? props.viewers : 'Offline'}</b><small>viewers</small></span>
      <span className="cc-figure"><b>{props.on_air ? props.uptime : 'Offline'}</b><small>uptime</small></span>
    </div>
    <span className="cc-separator" />
    <div className="cc-link-group"><ConnectionMark name="Twitch" state={props.twitch} /><ConnectionMark name="OBS" state={props.obs} /></div>
    <GatehouseChip armed={props.armed} watching={props.watching} shield={props.shield} href={props.gatehouse_href} />
    <span className="cc-spacer" />
    {props.data_kind && <span className="cc-sample">{props.data_kind === 'sample' ? 'Sample data' : 'Simulated'}</span>}
    <InkButton size="icon" aria-label="Settings" onClick={props.on_settings} disabled={!props.on_settings}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 14h14" /><circle cx="7" cy="6" r="2" /><circle cx="13" cy="14" r="2" /></svg>
    </InkButton>
    <ThemeToggle theme={props.theme} onChange={props.on_theme_change} />
    <InkButton onClick={props.on_steward} disabled={!props.on_steward} title="Ask the Steward (/)">Steward</InkButton>
  </header>;
}

export type ChamberLink = { id: ModuleId; href: string; figure: string };
export function ChambersColumn({ current, links, home_href, brand_href, summary, on_navigate }: {
  current: ModuleId; links: readonly ChamberLink[]; home_href: string; brand_href: string; summary: ReactNode;
  on_navigate?: (module: ModuleId) => void;
}) {
  return <nav className="cc-chambers" aria-label="The four chambers">
    <p className="cc-kicker">Chambers · keys 1–4</p>
    {chambers.map(chamber => {
      const link = links.find(item => item.id === chamber.id);
      if (!link) return null;
      return <a key={chamber.id} className="cc-chamber" data-module={chamber.id} href={link.href}
        onClick={event => { if (on_navigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); on_navigate(chamber.id); } }}
        aria-current={current === chamber.id ? 'page' : undefined}>
        <span className="cc-chamber-number">{chamber.number}</span>
        <span className="cc-chamber-copy"><b>{chamber.name}</b><i>{chamber.description}</i><em>{link.figure}</em></span>
      </a>;
    })}
    <div className="cc-also"><a href={home_href}>The whole keep</a><a href={brand_href}>Brand sheet</a></div>
    <div className="cc-now">The hall now<br />{summary}</div>
    <div className="cc-colorbar" aria-hidden="true"><i /><i /><i /><i /></div>
  </nav>;
}

export function KitShell({ rampart, navigation, children }: { rampart: ReactNode; navigation: ReactNode; children: ReactNode }) {
  return <div className="cc-shell">{rampart}{navigation}<main className="cc-page">{children}</main></div>;
}
