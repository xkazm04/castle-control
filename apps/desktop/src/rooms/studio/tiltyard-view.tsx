import { lazy, Suspense, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { TiltyardConnection } from './tiltyard-core.js';
import { DuelStage } from './duel-stage.jsx';
import { draftPicture } from './duel-model.js';
import type { DuelDraft } from './duel-model.js';
import type { DuelStageProps } from './duel-stage.jsx';
import { fixtureDuel, fixturePicture } from './duel-fixture.js';
import { duelHost } from './duel-host.js';

const CoreTiltyardView = lazy(() => import('./tiltyard-core-view.jsx'));
const LocalDuelDemos = lazy(() => import('./local-duel-demos.jsx'));
export type DuelView = 'duel' | 'show' | 'ladder';

/** FIXTURE duel: the TS engine with generated SIMULATED ballots. A Steward draft takes the stage until sealed or put away. */
export function FixtureDuel({ draft, tools, details }: { draft?: DuelDraft | undefined; tools?: ReactNode; details?: DuelStageProps['details'] }) {
  const state = useSyncExternalStore(fixtureDuel.subscribe, fixtureDuel.getSnapshot, fixtureDuel.getSnapshot);
  const live = useMemo(() => fixturePicture(state), [state]);
  useEffect(() => { duelHost.setPicture(live); }, [live]);
  const picture = draft && draft.entries.length ? draftPicture(draft) : live;
  const notice = picture.demo && picture.source === 'fixture' ? <p className="duel__banner" role="status">
    <span className="cc-sim">Simulated</span>{picture.phase === 'done'
      ? 'Demo finished: four sample contestants, generated ballots, three matches. Run it again or start your own duel from the Steward.'
      : 'Demo: generated ballots arrive, the tally moves, the window closes, the verdict lands, the next match opens. Three times speed.'}</p> : null;
  return <DuelStage picture={picture} program={live} on_event={fixtureDuel.send} tools={tools} notice={notice} details={details} />;
}

export default function TiltyardView({ connection, view = 'duel', draft, tools, details }: {
  connection?: TiltyardConnection | undefined; view?: DuelView; draft?: DuelDraft | undefined; tools?: ReactNode;
  details?: DuelStageProps['details'];
}) {
  if (view === 'show' || view === 'ladder') return <Suspense fallback={<p role="status">Loading local duel demos…</p>}>
    <LocalDuelDemos mode={view} />
  </Suspense>;
  return connection ? <Suspense fallback={<p role="status">Loading the core tournament…</p>}>
    <CoreTiltyardView connection={connection} draft={draft} tools={tools} details={details} />
  </Suspense> : <FixtureDuel draft={draft} tools={tools} details={details} />;
}
