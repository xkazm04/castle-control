import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';

/**
 * Steward flows for the Beacons. Module builders: define flows with defineFlow() in this
 * folder, list them in `flows`, and fill `demo` with the "Play demo" flow.
 */
export function visualsSteward(snapshot: Snapshot): ChamberSteward {
  return { ...roomSteward('visuals', snapshot, ['beacon', 'visual', 'altar', 'overlay', 'frame', 'border']), flows: [] };
}
