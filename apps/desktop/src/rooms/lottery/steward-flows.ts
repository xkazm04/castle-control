import type { AnyStewardFlow, ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { lotLive } from './live.js';
import { castFlow, coreDemoFlow, demoFlow, proveFlow, setupFlow } from './flow-steps.js';
import { coreFlows } from './flow-core.js';

export { castFlow, demoFlow, proveFlow, setupFlow } from './flow-steps.js';

/** The dock offers two flow chips beside Play demo and Catch me up: lead with what the draw needs next. */
function byPhase(setup: AnyStewardFlow, cast: AnyStewardFlow, prove: AnyStewardFlow | undefined): AnyStewardFlow[] {
  const phase = lotLive.get().phase;
  const ordered = phase === 'sealed' ? [cast, setup, prove] : phase === 'cast' ? [prove, setup, cast] : [setup, prove, cast];
  return ordered.filter((flow): flow is AnyStewardFlow => flow !== undefined);
}

/** Core mode: the greeting names the first step the core's draws need. */
function coreGreeting(): string {
  const live = lotLive.get();
  if (!live.draws.length) return 'The Lot Chamber on your core: no draw yet. Set up a draw creates one in a few small steps; Play demo shows a fair draw in a SIMULATED sandbox first. Nothing acts until you hold to seal.';
  const name = live.draw?.name ?? 'your draw';
  return live.phase === 'cast' ? `The Lot Chamber on your core: ${name} is cast. Prove it, or set up the next draw.`
    : live.phase === 'sealed' ? `The Lot Chamber on your core: ${name} is sealed. Cast the lots once its public round arrives.`
      : `The Lot Chamber on your core: ${name} is open, ${live.entries} lots in the roll. Set it up and seal it when chat has joined.`;
}
function coreCatchUp() {
  const live = lotLive.get();
  return { say: coreGreeting(), lines: [
    { label: 'Draws on the core', value: String(live.draws.length) },
    ...(live.draw ? [{ label: 'Selected', value: live.draw.name }, { label: 'Lots', value: String(live.entries) }] : []),
    ...(live.round ? [{ label: 'Round', value: live.round }] : []),
    ...(live.winners.length ? [{ label: 'Winners', value: live.winners.join(', ') }] : []),
  ] };
}

/**
 * Steward flows for the Lot Chamber: "Set up a draw", "Cast the lots", "Prove it" and a
 * SIMULATED "Play demo". Fixture mode drives the generated preview; core mode drives the
 * core's own draws, seal and cast, and plays the demo in a local sandbox that never touches the core. Every flow acts only from its hold to seal.
 */
export function lotterySteward(snapshot: Snapshot): ChamberSteward {
  const room = roomSteward('lottery', snapshot, ['draw', 'giveaway', 'raffle', 'lottery', 'lots', 'winner']);
  if (snapshot.mode !== 'fixture') {
    const core = coreFlows(snapshot);
    return { ...room, demo: coreDemoFlow as AnyStewardFlow,
      get greeting() { return coreGreeting(); },
      catch_up: coreCatchUp,
      get flows() { return byPhase(core.setup as AnyStewardFlow, core.cast as AnyStewardFlow,
        lotLive.get().writ ? core.prove as AnyStewardFlow : undefined); } };
  }
  return { ...room, demo: demoFlow as AnyStewardFlow,
    greeting: 'The Lot Chamber: giveaways nobody can call rigged. Set up a draw, cast it, prove it, or play the demo; nothing acts until you hold to seal.',
    get flows() { return byPhase(setupFlow as AnyStewardFlow, castFlow as AnyStewardFlow, proveFlow as AnyStewardFlow); } };
}
