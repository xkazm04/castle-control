import { chambers, RoomTitle, Stamp } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { appOverviewFrame, appOverviewTarget, appRoomTarget, frameTransform, keepRooms } from '@castle-control/keep-art';
import type { ArtNode } from '@castle-control/keep-art';
import type { CSSProperties } from 'react';
import { KeepArt, keepTree } from '../keep/keep-art.jsx';
import type { Surface } from '../navigation.js';
import { shellRoles } from './roles.jsx';

// Preserve the shared tree; only each room crop's light overlays differ.
const roomArt = Object.fromEntries(chambers.map(({ id }): [ModuleId, ArtNode] => [id, {
  ...keepTree, children: (keepTree.children ?? []).map(node => {
    if (!node.room || !node.cls) return node;
    const on = node.cls.includes('dim') ? node.room !== id : node.cls.includes('litglow') && node.room === id;
    return on ? { ...node, cls: [...node.cls, 'on'] } : node;
  }),
}])) as Record<ModuleId, ArtNode>;

export function roomCamera(chamber: ModuleId) {
  const room = keepRooms[chamber];
  const camera = frameTransform(room.appFrame ?? room.frame, appRoomTarget, 'cover');
  return `translate(${camera.ox}px, ${camera.oy}px) scale(${camera.s})`;
}

export function RoomHeader({ chamber, replay, origin, fixture, on_back, on_keep }: {
  chamber: ModuleId; replay: boolean; origin: Surface; fixture: boolean; on_back: () => void; on_keep?: () => void;
}) {
  const overview = frameTransform(appOverviewFrame, appOverviewTarget, 'contain');
  const style: CSSProperties & { '--room-camera-from': string } = {
    '--room-camera-from': `translate(${overview.ox}px, ${overview.oy}px) scale(${overview.s})`,
    transform: roomCamera(chamber),
  };
  return <div className="shell-room-header">
    <div className="shell-room-band" data-role="room-band" data-room={chamber} aria-hidden="true">
      <div className="shell-room-plane">
        <div className="shell-room-camera" style={style}><KeepArt node={roomArt[chamber]} /></div>
      </div>
    </div>
    {shellRoles(RoomTitle({ chamber, ...(replay ? { detail: 'The drill' } : {}),
      ...(fixture ? { stamp: <Stamp kind="simulated" /> } : {}),
      back_label: `Back to the ${origin}`, on_back }), on_keep)}
  </div>;
}
