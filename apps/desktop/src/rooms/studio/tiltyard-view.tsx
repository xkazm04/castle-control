import { lazy, Suspense, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { Tiltyard, tiltyardWords } from '@castle-control/ui/duel';
import type { TiltyardConnection } from './tiltyard-core.js';
import { DuelStage } from './duel-stage.jsx';
import { draftPicture } from './duel-model.js';
import type { DuelDraft } from './duel-model.js';
import { fixtureDuel, fixturePicture } from './duel-fixture.js';
import { duelHost } from './duel-host.js';

const CoreTiltyardView = lazy(() => import('./tiltyard-core-view.jsx'));
export type DuelView = 'duel' | 'show' | 'ladder';

const demoWords = { ...tiltyardWords, modes: {
  ...tiltyardWords.modes,
  show: { ...tiltyardWords.modes.show, detail: 'Local demo · you pick · not sent anywhere' },
  ladder: { ...tiltyardWords.modes.ladder, detail: 'Local demo · not sent anywhere' },
} };

/** Showdown and Ladder: the original local engines, offered from More. */
export function LocalDuelDemos({ mode }: { mode: 'show' | 'ladder' }) {
  return <Tiltyard key={mode} lists={SAMPLE} ballots={simulateChatPages} words={demoWords} initial_mode={mode}
    modes={['show', 'ladder']} label="Local duel demos · Showdown and Ladder" />;
}

/** FIXTURE duel: the TS engine with generated SIMULATED ballots. A Steward draft takes the stage until sealed or put away. */
export function FixtureDuel({ draft, tools }: { draft?: DuelDraft | undefined; tools?: ReactNode }) {
  const state = useSyncExternalStore(fixtureDuel.subscribe, fixtureDuel.getSnapshot, fixtureDuel.getSnapshot);
  const live = useMemo(() => fixturePicture(state), [state]);
  useEffect(() => { duelHost.setPicture(live); }, [live]);
  const picture = draft && draft.entries.length ? draftPicture(draft) : live;
  const notice = picture.demo && picture.source === 'fixture' ? <p className="duel__banner" role="status">
    <span className="cc-sim">Simulated</span>{picture.phase === 'done'
      ? 'Demo finished: four sample contestants, generated ballots, three matches. Run it again or start your own duel from the Steward.'
      : 'Demo: generated ballots arrive, the tally moves, the window closes, the verdict lands, the next match opens. Three times speed.'}</p> : null;
  return <DuelStage picture={picture} on_event={fixtureDuel.send} tools={tools} notice={notice} />;
}

export default function TiltyardView({ connection, view = 'duel', draft, tools }: {
  connection?: TiltyardConnection | undefined; view?: DuelView; draft?: DuelDraft | undefined; tools?: ReactNode;
}) {
  if (view === 'show' || view === 'ladder') return <LocalDuelDemos mode={view} />;
  return connection ? <Suspense fallback={<p role="status">Loading the core tournament…</p>}>
    <CoreTiltyardView connection={connection} draft={draft} tools={tools} />
  </Suspense> : <FixtureDuel draft={draft} tools={tools} />;
}
