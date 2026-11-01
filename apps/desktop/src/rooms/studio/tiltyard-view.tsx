import { lazy, Suspense } from 'react';
import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { Tiltyard, tiltyardWords } from '@castle-control/ui/duel';
import type { TiltyardConnection } from './tiltyard-core.js';

const CoreTiltyardView = lazy(() => import('./tiltyard-core-view.jsx'));

/** Fixture journeys retain the original TS engine; core Chat loads through its own lazy door. */
export default function TiltyardView({ connection }: { connection?: TiltyardConnection }) {
  return connection ? <Suspense fallback={<p role="status">Loading the core tournament…</p>}>
    <CoreTiltyardView connection={connection} />
  </Suspense> : <Tiltyard lists={SAMPLE} ballots={simulateChatPages} words={tiltyardWords} label="The Tiltyard, duel stage" />;
}
