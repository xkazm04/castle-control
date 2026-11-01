import { Stamp } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { keepRooms } from '@castle-control/keep-art';
import type { keepReadModel } from './read-model.js';

export function LintelPlaque({ chamber, state, drafted }: {
  chamber: { id: ModuleId; number: string; name: string };
  state: ReturnType<typeof keepReadModel>['states'][ModuleId]; drafted: boolean;
}) {
  const anchor = keepRooms[chamber.id].plaque;
  return <div className={`keep-plaque${drafted ? ' drafted' : ''}`} data-role="plaque" data-room={chamber.id}
    style={{ left: anchor?.x, top: anchor?.y }}>
    <div className="nm" data-role="plaque-name">{chamber.number} · {chamber.name}</div>
    <div className="wd" data-role="plaque-word">{state.word}</div>
    <div className="ln" data-role="plaque-line">{state.line}</div>
    {state.stamp && <Stamp {...state.stamp} />}
    {drafted && <span className="pin">DRAFT · NOT ON AIR</span>}
  </div>;
}
