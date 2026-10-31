import { lazy, Suspense } from 'react';
import { EmptyState, entranceStyle } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import type { Surface } from '../navigation.js';
import './surfaces.css';
import './room.css';
import SealSlot from '../rooms/seal-slot/index.jsx';
import { LiveSteward } from '@castle-control/ui/steward';
import type { StewardConnection } from '../client.js';
import { shellSealAuthority, shellStewardPort } from './core-steward.js';
import { StewardSealSlot } from './steward-slot.jsx';
import { RoomHeader } from './room-header.jsx';

const LotteryRoom = lazy(() => import('../rooms/lottery/index.jsx'));
const CoreLotteryRoom = lazy(() => import('../rooms/lottery/core.jsx'));
const ModeratorRoom = lazy(() => import('../rooms/moderator/index.jsx'));
const VisualsRoom = lazy(() => import('../rooms/visuals/room.jsx'));
const StudioRoom = lazy(() => import('../rooms/studio/room.jsx'));

export default function Room({ chamber, replay, snapshot, origin, connection, on_back, on_keep }: {
  chamber: ModuleId; replay: boolean; snapshot: Snapshot; origin: Surface;
  connection?: StewardConnection;
  on_open: (id: ModuleId) => void; on_back: () => void;
  on_keep?: () => void;
}) {
  const fixture = snapshot.mode === 'fixture';
  const port = shellStewardPort(connection);
  const authority = shellSealAuthority(connection);
  const seal_slot = port instanceof LiveSteward ? <StewardSealSlot key={chamber} chamber={chamber} port={port} authority={authority} />
    : <SealSlot key={chamber} chamber={chamber} enabled={fixture} authority={authority} />;
  return <section className="shell-room" data-chamber={chamber} aria-label="Chamber detail room">
    <RoomHeader key={chamber} chamber={chamber} replay={replay} origin={origin} fixture={fixture} on_back={on_back}
      {...(on_keep ? { on_keep } : {})} />
    <div className="shell-room-work">
      <div key={`${chamber}-${replay}`} className="shell-room-content cc-print-in" style={entranceStyle(0)}><Suspense fallback={<p role="status">Opening the room...</p>}>
        {fixture && chamber === 'lottery' ? <LotteryRoom snapshot={snapshot} replay={replay} seal_slot={seal_slot} />
          : chamber === 'lottery' ? <CoreLotteryRoom snapshot={snapshot} seal_slot={port instanceof LiveSteward ? seal_slot : undefined} />
          : chamber === 'moderator' ? <ModeratorRoom snapshot={snapshot} replay={replay} seal_slot={seal_slot} />
          : chamber === 'visuals' ? <VisualsRoom snapshot={snapshot} seal_slot={seal_slot} />
          : chamber === 'studio' ? <StudioRoom snapshot={snapshot} seal_slot={seal_slot} />
          : <><EmptyState title={chamber === 'studio' ? 'The map table is bare' : 'Room data is not configured'}
            description="No live actions are available in this room." />{seal_slot}</>}
      </Suspense></div>
    </div>
  </section>;
}
