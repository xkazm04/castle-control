import { chambers, Kbd, Stamp } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Surface } from '../navigation.js';

export function RoomHeader({ chamber, replay, origin, fixture, on_back, on_keep }: {
  chamber: ModuleId; replay: boolean; origin: Surface; fixture: boolean; on_back: () => void; on_keep?: () => void;
}) {
  const room = chambers.find(item => item.id === chamber) ?? chambers[0];
  return <header className="shell-room-header" data-role="room-title" data-module={chamber}>
    <div className="shell-room-heading">
      <h1 data-role="room-title-name">{`The ${room.name}`}</h1>
      <p className="shell-room-subtitle">{room.description}{replay && ' · The drill'}</p>
      {fixture && <Stamp kind="simulated" />}
    </div>
    <nav className="shell-room-links" aria-label="Breadcrumb" data-origin={origin}>
      <button type="button" className="shell-room-keep" onClick={on_keep ?? on_back}><span>The Keep</span> <Kbd>0</Kbd></button>
      <button type="button" data-role="room-back" onClick={on_back}>{`Back to the ${origin}`} <Kbd>Esc</Kbd></button>
    </nav>
  </header>;
}
