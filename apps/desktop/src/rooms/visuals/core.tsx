import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ReactNode } from 'react';
import type { Visual } from '@castle-control/contract';
import { stewardDock, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import { coreBeaconsConnection } from '../../client.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { CoreBeaconsPort, CoreBeaconsSnapshot } from '../../beacons-core.js';
import type { PreviewVisual } from '../../beacons-model.js';
import type { Snapshot } from '../../model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { ChamberSection } from '@castle-control/ui/chamber';
import { BeaconDeck } from './deck.jsx';
import { BeaconPlates } from './plates.jsx';
import { createBeaconsView } from './core-view.js';
import { CoreBench } from './core-bench.jsx';
import { light_flow_id, lightVisual } from './core-flows.js';
import type { LightDraft } from './core-flows.js';
import { fixtureBeacons } from './stage-state.js';
import { flow_ids, stageView } from './stage-view.js';
import type { StageView } from './stage-view.js';
import { BeaconStage } from './stage.jsx';
import { visualsSteward } from './steward-flows.js';
import './room.css';
import './core.css';

/** Core visuals as picture items: no live total is read here; the last core test fire shows its blaze. */
export function coreItems(state: CoreBeaconsSnapshot): PreviewVisual[] {
  return state.visuals.map(visual => ({ visual, gift_weight: 1, total: 0,
    intensity: state.simulation?.intensity.visual_id === visual.visual_id ? state.simulation.intensity.intensity : 0 }));
}

function coreReading(state: CoreBeaconsSnapshot, visual: Visual | undefined): string {
  const simulation = state.simulation;
  if (visual && simulation?.intensity.visual_id === visual.visual_id)
    return `Last test fire · ${Math.round(simulation.intensity.intensity * 100)}% · counted by your core`;
  return 'Live blaze shows on stream · test fire to see it react here';
}

/** The core room's one picture: the selected core beacon, a draft, or the demo sandbox. */
function CorePicture({ state, publication, compose }: {
  state: CoreBeaconsSnapshot; publication: ReturnType<typeof useStewardDraft>;
  compose: (picture: ReactNode, reading: ReactNode, in_picture?: string) => ReactNode;
}) {
  const sandbox = useSyncExternalStore(fixtureBeacons().subscribe, fixtureBeacons().getSnapshot, fixtureBeacons().getSnapshot);
  if (publication?.flow === flow_ids.demo) {
    return <BeaconStage view={stageView(sandbox.visuals, sandbox.selected, publication)} burst="sandbox"
      compose={(picture, reading) => compose(picture, <><p className="visuals-sandbox__band" role="status" data-testid="beacons-sandbox">
        Demo sandbox · SIMULATED · nothing touches your core. Sample beacons on a generated night. Your own beacons come back when the demo ends.
      </p>{reading}</>)} />;
  }
  if (publication?.flow === light_flow_id) {
    const visual = lightVisual(publication.draft as LightDraft, state.visuals);
    const view: StageView = { item: { visual, gift_weight: 1, total: 0, intensity: 0 }, mode: 'draft', flow: light_flow_id,
      spark: 'sample', simulated: false, stamp: 'Draft · not saved yet' };
    return <BeaconStage view={view} burst="draft" compose={compose} reading="A new beacon · saved to your core on your hold" />;
  }
  const items = coreItems(state);
  const selected = state.visuals.find(item => item.visual_id === state.selected);
  if (!items.length) return null;
  const view = stageView(items, state.selected ?? '', publication);
  return <BeaconStage view={view} burst={String(state.events[0]?.id ?? 'none')}
    compose={(picture, reading) => compose(picture, reading, view.item.visual.visual_id)} eyebrow="In your core"
    {...(view.mode === 'rest' ? { reading: coreReading(state, selected) } : {})} notice={view.mode === 'rest' ? state.notice : undefined} />;
}

/** An empty core: an honest picture that points to the Steward, never a wall of blanks. */
function CoreEmpty({ state, start, compose }: { state: CoreBeaconsSnapshot; start: (id: string) => void;
  compose: (picture: ReactNode, reading: ReactNode) => ReactNode }) {
  const loading = state.phase === 'idle' || state.phase === 'loading';
  const failed = state.phase === 'error';
  return compose(<section className="visuals-stage visuals-stage--picture visuals-stage--empty" aria-label="Beacon picture" data-mode="empty"><figure className="visuals-monitor" data-intensity="0.000">
      <div className="visuals-monitor__screen">
        <img className="visuals-monitor__scene" src="/art/malakor-lair-wide.webp" alt="" />
        <span className="cc-sim visuals-monitor__sim">Sample picture</span>
      </div>
      <figcaption className="cc-sr">Your stream with no beacon yet · sample picture</figcaption>
    </figure></section>, <div className="visuals-stage__read">
      <p className="visuals-stage__eyebrow">Your core</p>
      <EmptyState compact glyph={false} title={loading ? 'Reading your beacons…' : failed ? 'Beacons did not answer' : 'No beacon yet'}
        description={failed ? copy.core_failed(state.error?.code ?? 'unavailable')
          : 'A beacon is an altar, a camera frame or a border on your stream that glows brighter as gift subs and subs arrive, and cools when chat goes quiet. Light your first one with the Steward, or play the demo to see one at work.'}
        action={<>
          <button type="button" className="cc-btn cc-btn--chamber" disabled={loading} onClick={() => start(light_flow_id)}>Light a beacon</button>
          <button type="button" className="cc-btn cc-btn--quiet" onClick={() => start(flow_ids.demo)}>Play demo</button>
        </>} />
    </div>);
}

export function ConnectedBeacons({ port, seal_slot, steward }: { port: CoreBeaconsPort; seal_slot?: ReactNode; steward?: ChamberSteward }) {
  const view = useMemo(() => createBeaconsView(port), [port]);
  const state = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const publication = useStewardDraft('visuals');
  const [open, setOpen] = useState(false);
  useEffect(() => { void port.load(); void port.loadContributions({ limit: 100 }); }, [port]);
  useEffect(() => { void port.loadArtStatus(); }, [port]);
  const drafting = publication?.flow;
  const start = (id: string) => {
    const found = steward?.demo?.id === id ? steward.demo : steward?.flows.find(item => item.id === id);
    if (found) stewardDock.open(found);
  };
  const disabled = state.busy || state.phase === 'error';
  const empty = state.visuals.length === 0 && !drafting;
  const plates = state.visuals.map(item => ({ visual: item,
    ...(state.simulation?.intensity.visual_id === item.visual_id ? { intensity: state.simulation.intensity.intensity } : {}),
  }));
  const selected = state.visuals.find(item => item.visual_id === state.selected);
  const compose = (picture: ReactNode, reading: ReactNode, in_picture?: string) => <BeaconDeck picture={picture} reading={reading}
    open={open} on_open={() => setOpen(true)} on_close={() => setOpen(false)} core
    caption={publication ? 'Draft / sample picture · SIMULATED · not on air' : 'Core configuration · sample picture · SIMULATED'}
    preview={publication ? <p>{selected?.name ?? 'Beacon'} · draft · not on air</p> : <p>Nothing in Preview. Ask the Steward to draft one.</p>}
    program={<p>{selected?.name ?? 'No beacon saved'}<br />Live blaze shows on stream · live total shows on stream</p>}
    picker={plates.length > 0 ? <BeaconPlates visuals={plates} selected={in_picture ?? state.selected ?? ''} core compact busy={disabled || Boolean(publication)}
      on_select={item => port.select(item.visual.visual_id)} /> : <p>{state.phase === 'error' ? copy.core_failed(state.error?.code ?? 'unavailable') : 'No beacons in your core yet. Ask the Steward to light one.'}</p>}
    actions={<>
      <button type="button" className="cc-btn" disabled={disabled || !selected} onClick={() => start(flow_ids.test)}>Test fire</button>
      <button type="button" className="cc-btn" disabled={disabled || !selected} onClick={() => start(flow_ids.replay)}>Replay a night</button>
      <button type="button" className="cc-btn" disabled={disabled || Boolean(publication) || !selected || selected.curve.decay.kind === 'none'} onClick={() => {
        if (!selected || disabled || selected.curve.decay.kind !== 'exponential') return;
        void view.setCurve({ visual_id: selected.visual_id, curve: { ...selected.curve,
          decay: { ...selected.curve.decay, half_life_s: Math.max(1, Math.round(selected.curve.decay.half_life_s / 2)) } } });
      }}>Halve the decay</button>
    </>}
    drawer={<>
      <div className="visuals-deck-actions">
        <button type="button" className="cc-btn" disabled={!selected} onClick={event =>
          event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLSelectElement>('#beacon-colour')?.focus()}>Tonight’s theme</button>
        <button type="button" className="cc-btn cc-btn--quiet" disabled={disabled || !selected} onClick={() => start(flow_ids.tune)}>Tune this beacon</button>
        <button type="button" className="cc-btn cc-btn--quiet" disabled={disabled} onClick={() => start(light_flow_id)}>Light another</button>
        <button type="button" className="cc-btn" onClick={() => start(flow_ids.demo)}>Play demo</button>
      </div>
      <ChamberSection title="Every beacon, every tier"><BeaconPlates visuals={plates} selected={state.selected ?? ''} core busy={disabled}
        on_select={item => port.select(item.visual.visual_id)} /></ChamberSection>
      <CoreBench port={view} state={state} seal_slot={seal_slot} />
    </>} />;
  return <section className="visuals-room visuals-core visuals-deck" aria-label="Core Beacons" aria-busy={state.busy}>
    {state.phase === 'error' && <p className="visuals-deck-error" role="alert">{copy.core_failed(state.error?.code ?? 'unavailable')}
      {state.visuals.length > 0 && ` ${copy.core_retained}`} <button type="button" className="cc-btn" onClick={() => { void port.load(); }}>Refresh Beacons</button></p>}
    {empty ? <CoreEmpty state={state} start={start} compose={compose} /> : <CorePicture state={state} publication={publication} compose={compose} />}
  </section>;
}

export default function CoreVisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const connection = coreBeaconsConnection(snapshot);
  const [steward] = useState(() => visualsSteward(snapshot));
  if (!connection) return <section className="visuals-room"><p role="status">Beacons are not configured. Local connection unavailable; reopen the desktop shell.</p>{seal_slot}</section>;
  try { connection.port ??= createCoreBeaconsPort(connection.launch, connection.transport); }
  catch { return <section className="visuals-room"><p role="status">Local Beacons connection is invalid. Reopen the desktop shell.</p>{seal_slot}</section>; }
  return <ConnectedBeacons port={connection.port} seal_slot={seal_slot} steward={steward} />;
}
