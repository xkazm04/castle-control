import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';

/**
 * Steward flows for the Gatehouse. Module builders: define flows with defineFlow() in this
 * folder, list them in `flows`, and fill `demo` with the "Play demo" flow.
 */
export function moderatorSteward(snapshot: Snapshot): ChamberSteward {
  return { ...roomSteward('moderator', snapshot, ['ban', 'timeout', 'held', 'moderate', 'gatehouse', 'vote', 'poll', 'rule']), flows: [] };
}
