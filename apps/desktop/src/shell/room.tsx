import { lazy, Suspense } from 'react';
import { Breadcrumb, EmptyState } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import type { Surface } from '../navigation.js';
import './surfaces.css';

const LotsPage = lazy(() => import('../lots-page.jsx').then(module => ({ default: module.LotsPage })));
const ModerationPage = lazy(() => import('../moderation-page.jsx').then(module => ({ default: module.ModerationPage })));
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
        {fixture && chamber === 'lottery' ? <LotsPage />
          : fixture && chamber === 'moderator' ? <ModerationPage replay={replay} />
          : fixture && chamber === 'visuals' ? <BeaconsPage />
          : <EmptyState title={chamber === 'studio' ? 'The map table is bare' : 'Room data is not configured'}
            description="No live actions are available in this room." />}
      </Suspense></div>
      <aside className="shell-seal-slot" aria-label="Seal slot">
        <h2>Proposal · awaiting your seal</h2><p>No proposals. The Steward is not wired yet.</p>
        <p>Nothing acts until you hold to seal.</p>
      </aside>
    </div>
  </section>;
}
