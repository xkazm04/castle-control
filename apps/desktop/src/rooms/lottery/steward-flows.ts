import type { AnyStewardFlow, ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { lotLive } from './live.js';
import { castFlow, demoFlow, proveFlow, setupFlow } from './flow-steps.js';
import { coreFlows } from './flow-core.js';

export { castFlow, demoFlow, proveFlow, setupFlow } from './flow-steps.js';

/** The dock offers two flow chips beside Play demo and Catch me up: lead with what the draw needs next. */
function byPhase(setup: AnyStewardFlow, cast: AnyStewardFlow, prove: AnyStewardFlow | undefined): AnyStewardFlow[] {
  const phase = lotLive.get().phase;
  const ordered = phase === 'sealed' ? [cast, setup, prove] : phase === 'cast' ? [prove, setup, cast] : [setup, prove, cast];
  return ordered.filter((flow): flow is AnyStewardFlow => flow !== undefined);
}

/**
 * Steward flows for the Lot Chamber: "Set up a draw", "Cast the lots", "Prove it" and a
 * SIMULATED "Play demo". Fixture mode drives the generated preview; core mode drives the
 * core's own draws, seal and cast. Every flow acts only from its hold to seal.
 */
export function lotterySteward(snapshot: Snapshot): ChamberSteward {
  const room = roomSteward('lottery', snapshot, ['draw', 'giveaway', 'raffle', 'lottery', 'lots', 'winner']);
  if (snapshot.mode !== 'fixture') {
    const core = coreFlows(snapshot);
    return { ...room, get flows() { return byPhase(core.setup as AnyStewardFlow, core.cast as AnyStewardFlow,
      lotLive.get().writ ? core.prove as AnyStewardFlow : undefined); } };
  }
  return { ...room, demo: demoFlow as AnyStewardFlow,
    greeting: 'The Lot Chamber: set up a draw, seal it, cast it, and prove it fair. Nothing acts until you hold to seal.',
    get flows() { return byPhase(setupFlow as AnyStewardFlow, castFlow as AnyStewardFlow, proveFlow as AnyStewardFlow); } };
}
