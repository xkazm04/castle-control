import { Stamp } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { keepReadModel } from './read-model.js';

/** Where each lintel plaque centres under the window's four lights (percent of the window width). */
const plaqueLeft: Record<ModuleId, string> = { lottery: '16.04%', moderator: '38.68%', visuals: '61.32%', studio: '83.96%' };

export function LintelPlaque({ chamber, state, drafted }: {
  chamber: { id: ModuleId; number: string; name: string };
  state: ReturnType<typeof keepReadModel>['states'][ModuleId]; drafted: boolean;
}) {
  return <div className={`keep-plaque${drafted ? ' drafted' : ''}`} data-role="plaque" data-room={chamber.id} data-module={chamber.id}
    style={{ left: plaqueLeft[chamber.id] }}>
    <div className="nm" data-role="plaque-name">{chamber.number} · {chamber.name}</div>
    <div className="wd" data-role="plaque-word">{state.plaque?.word ?? state.word}</div>
    <div className="ln" data-role="plaque-line">{state.plaque?.line ?? state.line}</div>
    {state.stamp && <Stamp {...state.stamp} />}
    {drafted && <span className="pin">DRAFT · NOT ON AIR</span>}
  </div>;
}
