import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';

/**
 * Steward flows for the Lot Chamber. Module builders: define flows with defineFlow() in this
 * folder, list them in `flows`, and fill `demo` with the "Play demo" flow.
 */
export function lotterySteward(snapshot: Snapshot): ChamberSteward {
  return { ...roomSteward('lottery', snapshot, ['draw', 'giveaway', 'raffle', 'lottery', 'lots', 'winner']), flows: [] };
}
