import type { ModuleId } from '@castle-control/ui';
import type { FlowChamber, StewardRegistry } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import type { ShellSurface } from '../navigation.js';
import { keepSteward } from '../keep/steward-flows.js';
import { lotterySteward } from '../rooms/lottery/steward-flows.js';
import { moderatorSteward } from '../rooms/moderator/steward-flows.js';
import { visualsSteward } from '../rooms/visuals/steward-flows.js';
import { studioSteward } from '../rooms/studio/steward-flows.js';
import { streamSteward } from '../stream/steward-flows.js';
import { rehearsalSteward } from '../rehearsal/steward-flows.js';

/** The one table of chamber Stewards. Each module owns its own steward-flows.ts. */
export function stewardRegistry(snapshot: Snapshot): StewardRegistry {
  return {
    keep: keepSteward(snapshot),
    lottery: lotterySteward(snapshot),
    moderator: moderatorSteward(snapshot),
    visuals: visualsSteward(snapshot),
    studio: studioSteward(snapshot),
    stream: streamSteward(snapshot),
    rehearsal: rehearsalSteward(snapshot),
  };
}

/** The overview and the demo talk to the Keep's Steward. */
export function flowChamber(current: ModuleId | ShellSurface): FlowChamber {
  return current === 'overview' || current === 'demo' ? 'keep' : current;
}
