import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';

/** Steward flows for stream setup (#/stream). Module builders add flows here. */
export function streamSteward(snapshot: Snapshot): ChamberSteward {
  return {
    name: 'stream setup', flows: [], keywords: ['obs', 'scene', 'stream setup', 'browser source'],
    greeting: 'Stream setup. Tell me what to connect; nothing changes in OBS until you hold to seal.',
    catch_up: () => ({ say: snapshot.mode === 'fixture' ? 'Setup runs on sample data here. OBS is not connected.' : 'Setup reads the core for OBS status.',
      ...(snapshot.mode === 'fixture' ? { simulated: true } : {}) }),
  };
}
