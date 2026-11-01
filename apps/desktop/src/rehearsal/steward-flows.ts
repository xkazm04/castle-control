import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';

/** Steward flows for the Dress rehearsal (#/rehearsal). Module builders add the rehearsal steps flow here. */
export function rehearsalSteward(snapshot: Snapshot): ChamberSteward {
  return {
    name: 'the Dress rehearsal', flows: [], keywords: ['rehearsal', 'rehearse', 'dress rehearsal', 'dry run'],
    greeting: 'Dress rehearsal. Every run here is SIMULATED; nothing reaches a real viewer.',
    catch_up: () => ({ say: snapshot.mode === 'fixture' ? 'No rehearsal has run in this sample session.' : 'Rehearsal status comes from the core.', simulated: true }),
  };
}
