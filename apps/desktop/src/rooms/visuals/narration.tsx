import { useMemo, useSyncExternalStore } from 'react';
import type { Visual } from '@castle-control/contract';
import type { sampleNight } from '../../beacons-nights.js';
import { nightBursts } from '../../beacons-replay.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { stageClock } from './stage-state.js';
import { narrate } from './stage-narration.js';

/** Live narration for a Steward card: reads the same night cursor the picture plays. */
export function NightNarration({ name, night, trace, curve }: {
  name: string; night: ReturnType<typeof sampleNight>; trace: ReplayTrace; curve: Visual['curve'];
}) {
  const time = useSyncExternalStore(stageClock.subscribe, stageClock.getSnapshot, stageClock.getSnapshot);
  const counted = useMemo(() => new Set(nightBursts(night.offerings).map(burst => burst.offering)), [night]);
  return <p className="visuals-narration" aria-live="off">
    {narrate({ name: name.toLowerCase(), offerings: night.offerings, counted, trace, curve, position: time.position_s })}
  </p>;
}
