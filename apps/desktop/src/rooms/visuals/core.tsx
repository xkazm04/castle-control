import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
function CorePicture({ state, publication, actions }: {
  state: CoreBeaconsSnapshot; publication: ReturnType<typeof useStewardDraft>; actions: ReactNode;
}) {
  const sandbox = useSyncExternalStore(fixtureBeacons().subscribe, fixtureBeacons().getSnapshot, fixtureBeacons().getSnapshot);
  if (publication?.flow === flow_ids.demo) {
    return <div className="visuals-sandbox" data-testid="beacons-sandbox">
      <p className="visuals-sandbox__band" role="status"><span className="cc-sim">Simulated</span>
        <b>Demo sandbox · SIMULATED · nothing touches your core</b>
        <span>Sample beacons on a generated night. Your own beacons come back when the demo ends.</span></p>
      <BeaconStage view={stageView(sandbox.visuals, sandbox.selected, publication)} burst="sandbox" />
    </div>;
  }
  if (publication?.flow === light_flow_id) {
    const visual = lightVisual(publication.draft as LightDraft, state.visuals);
    const view: StageView = { item: { visual, gift_weight: 1, total: 0, intensity: 0 }, mode: 'draft', flow: light_flow_id,
      spark: 'sample', simulated: false, stamp: 'Draft · not saved yet' };
    return <BeaconStage view={view} burst="draft" reading="A new beacon · saved to your core on your hold" />;
  }
  const items = coreItems(state);
  const selected = state.visuals.find(item => item.visual_id === state.selected);
  if (!items.length) return null;
  const view = stageView(items, state.selected ?? '', publication);
  return <BeaconStage view={view} burst={String(state.events[0]?.id ?? 'none')} actions={actions} eyebrow="In your core"
    {...(view.mode === 'rest' ? { reading: coreReading(state, selected) } : {})} notice={view.mode === 'rest' ? state.notice : undefined} />;
}

/** An empty core: an honest picture that points to the Steward, never a wall of blanks. */
function CoreEmpty({ state, start }: { state: CoreBeaconsSnapshot; start: (id: string) => void }) {
  const loading = state.phase === 'idle' || state.phase === 'loading';
  const failed = state.phase === 'error';
  return <section className="visuals-stage visuals-stage--empty" aria-label="Beacon picture" data-mode="empty">
    <figure className="visuals-monitor" data-intensity="0.000">
      <div className="visuals-monitor__screen">
        <img className="visuals-monitor__scene" src="/art/malakor-lair-wide.webp" alt="" />
        <span className="cc-sim visuals-monitor__sim">Sample picture</span>
      </div>
      <figcaption className="cc-sr">Your stream with no beacon yet · sample picture</figcaption>
    </figure>
    <div className="visuals-stage__read">
      <p className="visuals-stage__eyebrow">Your core</p>
      <h2 className="visuals-stage__name">{loading ? 'Reading your beacons…' : failed ? 'Beacons did not answer' : 'No beacon yet'}</h2>
      <p className="visuals-stage__line">{failed ? copy.core_failed(state.error?.code ?? 'unavailable')
        : 'A beacon is an altar, a camera frame or a border on your stream that glows brighter as gift subs and subs arrive, and cools when chat goes quiet. Light your first one with the Steward, or play the demo to see one at work.'}</p>
      <div className="visuals-stage__actions">
        <button type="button" className="cc-btn cc-btn--chamber" disabled={loading} onClick={() => start(light_flow_id)}>Light a beacon</button>
        <button type="button" className="cc-btn cc-btn--quiet" onClick={() => start(flow_ids.demo)}>Play demo</button>
      </div>
    </div>
  </section>;
}

export function ConnectedBeacons({ port, seal_slot, steward }: { port: CoreBeaconsPort; seal_slot?: ReactNode; steward?: ChamberSteward }) {
  const view = useMemo(() => createBeaconsView(port), [port]);
  const state = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const publication = useStewardDraft('visuals');
  const board = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { void port.load(); void port.loadContributions({ limit: 100 }); }, [port]);
  useEffect(() => { void port.loadArtStatus(); }, [port]);
  const drafting = publication?.flow;
  useEffect(() => { if (drafting && board.current) board.current.scrollTop = 0; }, [drafting]);
  const start = (id: string) => {
    const found = steward?.demo?.id === id ? steward.demo : steward?.flows.find(item => item.id === id);
    if (found) stewardDock.open(found);
  };
  const disabled = state.busy || state.phase === 'error';
  const empty = state.visuals.length === 0 && !drafting;
  const sandbox = publication?.flow === flow_ids.demo;
  const plates = state.visuals.map(item => ({ visual: item,
    ...(state.simulation?.intensity.visual_id === item.visual_id ? { intensity: state.simulation.intensity.intensity } : {}),
  }));
  return <section className="visuals-room visuals-core" aria-label="Core Beacons" aria-busy={state.busy}>
    <div className="visuals-board" ref={board}>
      {empty ? <CoreEmpty state={state} start={start} /> : <CorePicture state={state} publication={publication} actions={<>
        <button type="button" className="cc-btn cc-btn--chamber" onClick={() => start(flow_ids.tune)}>Tune this beacon</button>
        <button type="button" className="cc-btn" onClick={() => start(flow_ids.test)}>Test fire</button>
        <button type="button" className="cc-btn" onClick={() => start(flow_ids.replay)}>Replay a night</button>
        <button type="button" className="cc-btn cc-btn--quiet" onClick={() => start(flow_ids.demo)}>Play demo</button>
      </>} />}
      {!sandbox && state.visuals.length > 0 && <section className="visuals-picker" aria-labelledby="visuals-picker-title">
        <h2 className="visuals-picker__title" id="visuals-picker-title">Your beacons <em>choose the one on screen · saved in your core</em>
          <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet visuals-picker__add" onClick={() => start(light_flow_id)}>Light another</button></h2>
        <BeaconPlates visuals={plates} selected={state.selected ?? ''} core busy={disabled}
          on_select={item => port.select(item.visual.visual_id)} />
      </section>}
      <details className="cc-disclosure visuals-more" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>More <span>configuration · control points · appearance · core simulation · browser source · feeds</span></summary>
        <div className="cc-disclosure__body visuals-more__body">
          <CoreBench port={view} state={state} seal_slot={seal_slot} />
        </div>
      </details>
    </div>
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
