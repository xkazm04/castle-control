import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { maproomTurnRun, parseMethodParams } from '@castle-control/contract';
import { SAMPLE } from '@castle-control/duel';
import { CoreChat, Tiltyard, tiltyardWords } from '@castle-control/ui/duel';
import type { TiltyardConnection, TiltyardCore, TiltyardCoreState } from './tiltyard-core.js';
import { coreTurn, createTiltyardCore } from './tiltyard-core.js';
import { DuelSourceAction } from './tiltyard-source.jsx';

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
const coreWords = { ...tiltyardWords, chat: { ...tiltyardWords.chat, tally_label: 'Core counted ballots' }, modes: {
  ...tiltyardWords.modes,
  show: { ...tiltyardWords.modes.show, detail: 'Local demo · not sent to the core or OBS' },
  chat: { ...tiltyardWords.modes.chat, detail: 'Core tournament · shared with Duel on stream' },
  ladder: { ...tiltyardWords.modes.ladder, detail: 'Local demo · not sent to the core or OBS' },
} };

/** Pure status leaf also used in error/disconnection tests. */
export function TiltyardCoreNotice({ state }: { state: TiltyardCoreState }) {
  return <>
    {!state.connected && <p role="status">Core disconnected · duel controls are unavailable until reconnect.</p>}
    {state.loading && <p role="status">Loading the core tournament…</p>}
    {state.busy && <p role="status">Waiting for the core…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
  </>;
}
function CoreTiltyard({ model }: { model: TiltyardCore }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  useEffect(() => model.start(), [model]);
  const disabled = !state.connected || state.loading || state.busy;
  const run = (event: Parameters<typeof coreTurn>[0]) => {
    // The core's native clock owns ticks; only human events cross this adapter.
    if (event.kind === 'tick') return;
    if (!state.stage?.session && event.kind === 'enter') void model.run(sampleTournament());
    else void model.run(coreTurn(event));
  };
  return <>
    <p className="studio-tiltyard-sample">SAMPLE starter contestants · Gatehouse ballots counted by the core · Shared with OBS. Showdown and Ladder are local demos.</p>
    <TiltyardCoreNotice state={state} />
    <DuelSourceAction mode="core" busy={disabled} on_copy={() => { void model.copySource(); }} />
    <button type="button" disabled={disabled} onClick={() => { void model.refresh(); }}>Refresh tournament</button>
    <Tiltyard lists={SAMPLE} words={coreWords} initial_mode="chat" label="The Tiltyard, duel stage"
      chat_control={{ phase: state.stage?.session?.phase ?? 'empty', simulated: state.stage?.session?.simulated ?? false,
        on_event: run, content: <fieldset className="studio-core-duel" disabled={disabled}>
          <legend>Core Chat tournament</legend>
          <CoreChat {...(state.stage?.session ? { session: state.stage.session } : {})} words={coreWords}
            on_action={action => { void model.run(action); }} on_start={() => { void model.run(sampleTournament()); }} />
        </fieldset> }} />
  </>;
}

/** Load the core contracts and adapter only when the shell supplies a core connection. */
export default function CoreTiltyardView({ connection }: { connection: TiltyardConnection }) {
  const model = useMemo(() => createTiltyardCore(connection), [connection]);
  return <CoreTiltyard model={model} />;
}
