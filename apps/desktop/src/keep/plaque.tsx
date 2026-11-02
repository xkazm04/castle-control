import { Stamp } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { keepReadModel } from './read-model.js';

export function LintelPlaque({ chamber, state, drafted, needs_you = false }: {
  chamber: { id: ModuleId; number: string; name: string };
  state: ReturnType<typeof keepReadModel>['states'][ModuleId]; drafted: boolean; needs_you?: boolean;
}) {
  return <div className={`keep-plaque${drafted ? ' drafted' : ''}`} data-role="plaque" data-room={chamber.id} data-module={chamber.id}>
    <div className="nm" data-role="plaque-name"><span className="keep-disc">{chamber.number}</span>{chamber.name}</div>
    <div className="wd" data-role="plaque-word">{state.plaque?.word ?? state.word}</div>
    {state.stamp && <Stamp {...state.stamp} />}
    {needs_you && <span className="keep-needs">needs you</span>}
    {drafted && <span className="pin">DRAFT · NOT ON AIR</span>}
  </div>;
}
