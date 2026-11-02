import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { maproomTurnRun, parseMethodParams } from '@castle-control/contract';
import { SAMPLE } from '@castle-control/duel';
import { stewardDock } from '@castle-control/ui/steward-flow';
import type { TiltyardConnection, TiltyardCore, TiltyardCoreState } from './tiltyard-core.js';
import { coreTurn, createTiltyardCore } from './tiltyard-core.js';
import { DuelSourceAction } from './tiltyard-source.jsx';
import { DuelStage } from './duel-stage.jsx';
import { corePicture, draftPicture } from './duel-model.js';
import type { DuelDraft } from './duel-model.js';
import { DEMO_KEY, duelHost } from './duel-host.js';
import { startDuelFlow } from './steward-flows.js';

/** SAMPLE text is a starter list, not a second tournament. Seed ranks stay decimal strings. */
export function sampleTournament() {
  const { title, prompt, items, key, window_ms } = SAMPLE.chat;
  return parseMethodParams(maproomTurnRun, {
    action: {
      kind: 'start', key, window_ms,
      list: {
        title, prompt,
        items: items.map((item, index) => ({ ...item, seed: String(index + 1) })),
      },
    },
  }).action;
}

/** A sealed Steward draft as the core's start action, parsed at the contract door. */

/** Pure status leaf also used in error/disconnection tests. */
export function TiltyardCoreNotice({ state }: { state: TiltyardCoreState }) {
  return <div className="duel__notices">
    {!state.connected && <p role="status">Core disconnected · duel controls are unavailable until reconnect.</p>}
    {state.loading && <p role="status">Loading the core tournament…</p>}
    {state.busy && <p role="status">Waiting for the core…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
  </div>;
}

function CoreTiltyard({ model, draft, tools }: { model: TiltyardCore; draft?: DuelDraft | undefined; tools?: ReactNode }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  useEffect(() => model.start(), [model]);
  useEffect(() => {
    duelHost.setCore({ run: action => model.run(action), copySource: () => model.copySource(),
      outcome: () => { const { error, notice } = model.getSnapshot(); return { ...(error ? { error } : {}), ...(notice ? { notice } : {}) }; } });
    return () => { duelHost.setCore(undefined); };
  }, [model]);
  const live = useMemo(() => corePicture(state.stage?.session, DEMO_KEY), [state.stage]);
  useEffect(() => { duelHost.setPicture(live); }, [live]);
  const disabled = !state.connected || state.loading || state.busy;
  const picture = draft && draft.entries.length ? draftPicture(draft) : live;
  const run = (event: Parameters<typeof coreTurn>[0]) => {
    // The core's native clock owns ticks; only human events cross this adapter.
    if (event.kind === 'tick') return;
    void model.run(coreTurn(event));
  };
  const empty = <div className="duel-empty">
    <h3 className="duel-empty__title">No duel on the core yet</h3>
    <p>Start one from the Steward: pick a list, check the first match on this stage, then hold to seal. Chat ballots pass
      the Gatehouse and the core counts them; Duel on stream shows the same match in OBS.</p>
    <div className="cc-actions">
      <button type="button" className="cc-btn cc-btn--primary" onClick={() => stewardDock.open(startDuelFlow('core'))}>Start a duel…</button>
      <button type="button" className="cc-btn" disabled={disabled} onClick={() => { void model.run(sampleTournament()); }}>Start sample tournament</button>
    </div>
    <p className="duel-empty__fine">The sample uses SAMPLE starter contestants. Showdown and Ladder under More are local demos.</p>
  </div>;
  return <DuelStage picture={picture} on_event={run} frozen={disabled} empty={empty}
    notice={<TiltyardCoreNotice state={state} />}
    tools={<>
      <DuelSourceAction mode="core" busy={disabled} on_copy={() => { void model.copySource(); }} />
      <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet" disabled={disabled} onClick={() => { void model.refresh(); }}>Refresh</button>
      {tools}
    </>} />;
}

/** Load the core contracts and adapter only when the shell supplies a core connection. */
export default function CoreTiltyardView({ connection, draft, tools }: {
  connection: TiltyardConnection; draft?: DuelDraft | undefined; tools?: ReactNode;
}) {
  const model = useMemo(() => createTiltyardCore(connection), [connection]);
  return <CoreTiltyard model={model} draft={draft} tools={tools} />;
}
