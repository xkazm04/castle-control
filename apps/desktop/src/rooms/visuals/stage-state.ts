import { createBeaconsPreview } from '../../beacons-model.js';
import type { BeaconsPort } from '../../beacons-model.js';
import { night_duration_s } from '../../beacons-replay.js';
import { createReplayClock } from './replay-clock.js';

/**
 * The fixture room and its Steward flows share one local preview, so a sealed flow
 * changes the very picture the streamer is looking at. Simulated and in-process only.
 */
let shared: BeaconsPort | undefined;
export function fixtureBeacons(): BeaconsPort {
  shared ??= createBeaconsPreview();
  return shared;
}
/** Tests start from the generated fixture again. */
export function resetFixtureBeacons(): BeaconsPort {
  shared = createBeaconsPreview();
  return shared;
}

/** The chamber picture's night cursor. The picture drives it; the Steward's narration reads it. */
export const stageClock = createReplayClock(night_duration_s, 30);
/** The picture plays a 48-minute night in about 24 s: four clock seconds per real tick at 30x. */
export const stage_pace = 4;
