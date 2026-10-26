import { lazy, Suspense } from 'react';
import { Breadcrumb, EmptyState } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import type { Surface } from '../navigation.js';
import './surfaces.css';
import './room.css';
import SealSlot from '../rooms/seal-slot/index.jsx';

const LotteryRoom = lazy(() => import('../rooms/lottery/index.jsx'));
const ModeratorRoom = lazy(() => import('../rooms/moderator/index.jsx'));
const BeaconsPage = lazy(() => import('../beacons-page.jsx').then(module => ({ default: module.BeaconsPage })));

export default function Room({ chamber, replay, snapshot, origin, on_open, on_back }: {
  chamber: ModuleId; replay: boolean; snapshot: Snapshot; origin: Surface;
  on_open: (id: ModuleId) => void; on_back: () => void;
}) {
  const fixture = snapshot.mode === 'fixture';
  return <section className="shell-room" aria-label="Chamber detail room">
    <Breadcrumb chamber={chamber} {...(replay ? { detail: 'The drill' } : {})} back_href={`#/${origin}`}
      on_back={on_back} on_navigate={on_open} />
    <div className="shell-room-work">
      <div className="shell-room-content"><Suspense fallback={<p role="status">Opening the room...</p>}>
        {fixture && chamber === 'lottery' ? <LotteryRoom snapshot={snapshot} replay={replay} />
          : fixture && chamber === 'moderator' ? <ModeratorRoom snapshot={snapshot} replay={replay} />
          : fixture && chamber === 'visuals' ? <BeaconsPage />
          : <EmptyState title={chamber === 'studio' ? 'The map table is bare' : 'Room data is not configured'}
            description="No live actions are available in this room." />}
      </Suspense></div>
      <SealSlot key={chamber} chamber={chamber} enabled={fixture} />
    </div>
  </section>;
}
