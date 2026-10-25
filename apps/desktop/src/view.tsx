import { ChambersColumn, EmptyState, KitShell, NumberedPanel, PageHeader, StatusChip, ThemeFrame, chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Ref } from 'react';
import type { Snapshot } from './model.js';
import { DesktopRampart } from './rampart.jsx';
import { simulatedSourceLabel } from './simulated.js';
import './view.css';

const emptyStates = {
  lottery: { title: 'No lots in the urn yet', description: 'Draw setup and verifiable results arrive with the Lot Chamber milestone.' },
  moderator: { title: 'The portcullis is clear', description: 'The moderation room and held queue arrive with the Gatehouse milestone.' },
  visuals: { title: 'No beacon is lit', description: 'Contribution visuals and the designer arrive with the Beacons milestone.' },
  studio: { title: 'The map table is bare', description: 'Extension designs and viewer previews arrive with the Map Room milestone.' },
} as const;

export type ViewProps = {
  current: ModuleId; snapshot: Snapshot; theme: Theme;
  on_navigate: (id: ModuleId) => void; on_theme_change: (theme: Theme) => void;
  search: string; on_search: (text: string) => void; search_ref?: Ref<HTMLInputElement>;
};

export function DesktopView(props: ViewProps) {
  const current = chambers.find(chamber => chamber.id === props.current) ?? chambers[0];
  const empty = emptyStates[current.id];
  const simulated = props.snapshot.mode === 'fixture' || props.snapshot.status?.simulated === true;
  const matches = props.search.trim() ? chambers.filter(chamber => `${chamber.name} ${chamber.description}`.toLowerCase().includes(props.search.trim().toLowerCase())) : [];
  return <ThemeFrame theme={props.theme} module={current.id}>
    <KitShell rampart={<DesktopRampart snapshot={props.snapshot} theme={props.theme} on_theme_change={props.on_theme_change} />}
      navigation={<ChambersColumn current={current.id} on_navigate={props.on_navigate}
        links={chambers.map(chamber => ({ id: chamber.id, href: `#/${chamber.id}`, figure: 'Not configured' }))}
        home_href="#/lottery" brand_href="#shell-info" summary={simulated ? 'Simulated room · no live actions' : 'Room details not yet available'} />}>
      {simulated && <div className="desktop-simulated" role="status">{props.snapshot.mode === 'fixture'
        ? simulatedSourceLabel : 'SIMULATED SOURCE · core reports simulated data'}</div>}
      <div className="desktop-search">
        <label htmlFor="chamber-search">Find a chamber <kbd>/</kbd></label>
        <input id="chamber-search" type="search" ref={props.search_ref} value={props.search}
          onChange={event => props.on_search(event.currentTarget.value)} placeholder="Search chambers" />
        {props.search.trim() && <div aria-label="Matching chambers">{matches.length ? matches.map(chamber =>
          <a key={chamber.id} href={`#/${chamber.id}`} onClick={event => { event.preventDefault(); props.on_navigate(chamber.id); }}>{chamber.name}</a>) : <p>No matching chamber.</p>}</div>}
      </div>
      <PageHeader number={Number(current.number)} title={current.name} description={current.description}
        actions={<StatusChip variant="dash">Not configured</StatusChip>} />
      {props.snapshot.phase !== 'ready' && <p className="desktop-notice" role="status">{props.snapshot.message ?? 'Connecting to the core; status is unknown.'}</p>}
      <NumberedPanel number={`${current.number}.1`} title={current.description} gloss="Not configured">
        <EmptyState title={empty.title} description={empty.description} />
      </NumberedPanel>
      <p id="shell-info" className="desktop-note">Castle Control · working name · not affiliated with Twitch. Shared paper and dark-stock design. Keys 1–4 open chambers; / focuses search.</p>
    </KitShell>
  </ThemeFrame>;
}
