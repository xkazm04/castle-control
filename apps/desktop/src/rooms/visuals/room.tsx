import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { stewardDock, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { ReactNode } from 'react';
import type { Snapshot } from '../../model.js';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { ProposalLayers } from './proposal-layers.jsx';
import { Offerings } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import { createFixtureCurveEditor, FixtureCurve } from './fixture-curve.jsx';
import { NightReplay } from './replay.jsx';
import { FixtureSourceCopy } from './source-copy.jsx';
import { createAppearanceSession } from './appearance-state.js';
import { AppearanceControls } from './appearance.jsx';
import CoreVisualsRoom from './core.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { InputPicker } from './input-picker.jsx';
import { BeaconPlates } from './plates.jsx';
import { BeaconBay, BeaconBench, SealPanel } from './bench.jsx';
import { fixtureBeacons } from './stage-state.js';
import { flow_ids, stageView } from './stage-view.js';
import { BeaconStage } from './stage.jsx';
import { visualsSteward } from './steward-flows.js';
import './room.css';

export function VisualSelector({ visuals, selected, on_select, draft }: {
  visuals: readonly PreviewVisual[]; selected: string; on_select: (item: PreviewVisual) => void; draft?: ReactNode;
}) {
  return BeaconPlates({ visuals, selected, on_select, draft });
}

const fixtureSnapshot: Snapshot = { mode: 'fixture', phase: 'ready' };

export function VisualsWork({ queue = proposalQueue, port, seal_slot }: { queue?: ProposalQueue; port?: BeaconsPort; seal_slot?: ReactNode }) {
  const [adapter] = useState(() => port ?? fixtureBeacons());
  const [appearance] = useState(createAppearanceSession);
  const [steward] = useState(() => visualsSteward(fixtureSnapshot));
  const preview = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const proposals = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const pending = proposals.proposals.filter(item => item.chamber === 'visuals' && isPending(item)).length;
  const publication = useStewardDraft('visuals');
  const [open, setOpen] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const drafting = publication?.flow;
  // A flow's draft is drawn in the picture: bring the picture back into view when one starts.
  useEffect(() => { if (drafting && board.current) board.current.scrollTop = 0; }, [drafting]);
  useEffect(() => { if (pending > 0) setOpen(true); }, [pending]);
  const selected = preview.visuals.find(item => item.visual.visual_id === preview.selected);
  // One editor per selected visual: the night replay and the bench drag the same draft.
  const editor = useMemo(() => preview.visuals.some(item => item.visual.visual_id === preview.selected)
    ? createFixtureCurveEditor(adapter) : undefined, [adapter, preview.selected]);
  if (!selected || !editor) return <p role="status">{copy.no_visual}</p>;
  const view = stageView(preview.visuals, preview.selected, publication);
  const flow = (id: string) => steward.flows.find(item => item.id === id);
  const start = (id: string) => { const found = id === steward.demo?.id ? steward.demo : flow(id); if (found) stewardDock.open(found); };
  return <section className="visuals-room" aria-label={copy.work}>
    <div className="visuals-board" ref={board}>
      <BeaconStage view={view} burst={preview.events[0]?.id ?? 'none'} notice={view.mode === 'rest' ? preview.notice : undefined}
        actions={<>
          <button type="button" className="cc-btn cc-btn--chamber" onClick={() => start(flow_ids.tune)}>Tune this beacon</button>
          <button type="button" className="cc-btn" onClick={() => start(flow_ids.test)}>Test fire</button>
          <button type="button" className="cc-btn" onClick={() => start(flow_ids.replay)}>Replay a night</button>
          <button type="button" className="cc-btn cc-btn--quiet" onClick={() => start(flow_ids.demo)}>Play demo</button>
        </>} />
      <section className="visuals-picker" aria-labelledby="visuals-picker-title">
        <h2 className="visuals-picker__title" id="visuals-picker-title">The beacons <em>choose the one on screen</em></h2>
        <VisualSelector visuals={preview.visuals} selected={preview.selected} on_select={item => adapter.select(item.visual.visual_id)}
          draft={<ProposalLayers chamber="visuals" queue={queue} />} />
      </section>
      <details className="cc-disclosure visuals-more" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>More <span>night replay workbench · control points · appearance · browser source · feed{pending > 0 ? ` · ${pending} awaiting your seal` : ''}</span></summary>
        <div className="cc-disclosure__body visuals-more__body">
          <NightReplay item={selected} editor={editor} visuals={preview.visuals} on_select={adapter.select} queue={queue} />
          <BeaconBench name={selected.visual.name} notice={preview.notice}>
            <BeaconBay title={copy.driven_by} gloss={copy.input_gloss}>
              <InputPicker source={selected.visual.input?.source ?? ''} busy={false} on_change={adapter.input} />
              <p className="visuals-note">{copy.fixture_input_note}</p>
              <AppearanceControls session={appearance} visual={selected.visual} design_port={adapter}
                intensity={selected.intensity} burst={preview.events[0]?.id ?? 0} />
            </BeaconBay>
            <BeaconBay title={copy.curve} gloss={copy.curve_gloss}>
              <FixtureCurve key={preview.selected} item={selected} port={adapter} editor={editor} />
            </BeaconBay>
            <BeaconBay title={copy.test_fire} gloss={copy.test_gloss}>
              <TestFire port={adapter} selected={selected} on_end={adapter.end} />
              <FixtureSourceCopy port={adapter} visual={selected.visual} appearance={appearance} />
            </BeaconBay>
          </BeaconBench>
          <div className="visuals-room-details visuals-panels">
            <Offerings />
            <ContributionFeed events={preview.events} origin="Local preview" />
            <SealPanel>{seal_slot}</SealPanel>
          </div>
        </div>
      </details>
    </div>
  </section>;
}

export default function VisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <CoreVisualsRoom snapshot={snapshot} seal_slot={seal_slot} />;
  return <VisualsWork seal_slot={seal_slot} />;
}
