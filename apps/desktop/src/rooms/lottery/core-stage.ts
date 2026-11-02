import type { CoreLotsPort } from '../../lots-core.js';
import { createDrawDisplay } from './display.js';
import { createRevealClock } from './playback.js';

/** Presentation state per core port: shape, appearance and reveal cursor never reach RPC. */
const stages = new WeakMap<CoreLotsPort, { display: ReturnType<typeof createDrawDisplay>; reveal: ReturnType<typeof createRevealClock> }>();
export function coreStage(port: CoreLotsPort) {
  let stage = stages.get(port);
  if (!stage) { stage = { display: createDrawDisplay(), reveal: createRevealClock() }; stages.set(port, stage); }
  return stage;
}
