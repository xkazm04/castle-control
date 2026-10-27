import { lazy, Suspense } from 'react';
import { chambers, EmptyState } from '@castle-control/ui';
import type { MouseEvent } from 'react';
import type { ModuleId } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import type { Surface } from '../navigation.js';
import './surfaces.css';
import './room.css';
import SealSlot from '../rooms/seal-slot/index.jsx';

const LotteryRoom = lazy(() => import('../rooms/lottery/index.jsx'));
const CoreLotteryRoom = lazy(() => import('../rooms/lottery/core.jsx'));
const ModeratorRoom = lazy(() => import('../rooms/moderator/index.jsx'));
const VisualsRoom = lazy(() => import('../rooms/visuals/room.jsx'));
const StudioRoom = lazy(() => import('../rooms/studio/room.jsx'));

function follow(event: MouseEvent<HTMLAnchorElement>, action: () => void) {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.button === 0) {
    event.preventDefault(); action();
  }
}

// The room owns this expanded header; the shared kit and keymap stay unchanged.
function RoomHeader({ chamber, replay, origin, fixture, on_open, on_back }: {
  chamber: ModuleId; replay: boolean; origin: Surface; fixture: boolean;
  on_open: (id: ModuleId) => void; on_back: () => void;
}) {
  const current = chambers.find(item => item.id === chamber) ?? chambers[0];
  return <header className="shell-room-header">
    <div className="shell-room-heading">
      <nav aria-label="Breadcrumb"><a href="#/keep">The keep</a><span aria-hidden="true"> › </span>
        <span aria-current={replay ? undefined : 'page'}>The {current.name} ({current.description})</span>
        {replay && <><span aria-hidden="true"> › </span><span aria-current="page">The drill</span></>}
      </nav>
      <div className="shell-room-title"><h1>{`The ${current.name}`}</h1>
        <p>Chamber {current.number} of 4 · {current.description}</p>
        {fixture && <span className="shell-room-simulated">SIMULATED</span>}
      </div>
    </div>
    <nav className="cc-room-locator" aria-label="Chamber locator">{chambers.map(item =>
      <a key={item.id} href={`#/chamber/${item.id}`} aria-label={`${item.number}: ${item.name}`}
        aria-current={item.id === chamber ? 'location' : undefined}
        onClick={event => follow(event, () => on_open(item.id))}>{item.number}</a>)}</nav>
    <a className="shell-room-back" href={`#/${origin}`} onClick={event => follow(event, on_back)}>
      Back to the {origin} <kbd>Esc</kbd></a>
  </header>;
}

export default function Room({ chamber, replay, snapshot, origin, on_open, on_back }: {
  chamber: ModuleId; replay: boolean; snapshot: Snapshot; origin: Surface;
  on_open: (id: ModuleId) => void; on_back: () => void;
}) {
  const fixture = snapshot.mode === 'fixture';
  const seal_slot = <SealSlot key={chamber} chamber={chamber} enabled={fixture} />;
  return <section className="shell-room" data-chamber={chamber} aria-label="Chamber detail room">
    <RoomHeader chamber={chamber} replay={replay} origin={origin} fixture={fixture} on_open={on_open} on_back={on_back} />
    <div className="shell-room-work">
      <div className="shell-room-content"><Suspense fallback={<p role="status">Opening the room...</p>}>
        {fixture && chamber === 'lottery' ? <LotteryRoom snapshot={snapshot} replay={replay} seal_slot={seal_slot} />
          : chamber === 'lottery' ? <CoreLotteryRoom snapshot={snapshot} seal_slot={seal_slot} />
          : fixture && chamber === 'moderator' ? <ModeratorRoom snapshot={snapshot} replay={replay} seal_slot={seal_slot} />
          : fixture && chamber === 'visuals' ? <VisualsRoom snapshot={snapshot} seal_slot={seal_slot} />
          : fixture && chamber === 'studio' ? <StudioRoom snapshot={snapshot} seal_slot={seal_slot} />
          : <><EmptyState title={chamber === 'studio' ? 'The map table is bare' : 'Room data is not configured'}
            description="No live actions are available in this room." />{seal_slot}</>}
      </Suspense></div>
    </div>
  </section>;
}
