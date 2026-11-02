import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChamberSection } from '@castle-control/ui/chamber';
import { EmptyState } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { stewardDock, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { ReactNode } from 'react';
import type { Snapshot } from '../../model.js';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { ProposalLayers } from './proposal-layers.jsx';
import { createFixtureCurveEditor } from './fixture-curve.jsx';
import { createAppearanceSession } from './appearance-state.js';
import CoreVisualsRoom from './core.jsx';
import { BeaconPlates } from './plates.jsx';
import { fixtureBeacons } from './stage-state.js';
import { flow_ids, stageView } from './stage-view.js';
import { BeaconStage } from './stage.jsx';
import { visualsSteward } from './steward-flows.js';
import { BeaconDeck } from './deck.jsx';
import { FixtureBench } from './fixture-bench.jsx';
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
  useEffect(() => { if (pending > 0) setOpen(true); }, [pending]);
  const selected = preview.visuals.find(item => item.visual.visual_id === preview.selected);
  // One editor per selected visual: the night replay and the bench drag the same draft.
  const editor = useMemo(() => preview.visuals.some(item => item.visual.visual_id === preview.selected)
    ? createFixtureCurveEditor(adapter) : undefined, [adapter, preview.selected]);
  if (!selected || !editor) return <EmptyState compact title={copy.no_visual} />;
  const view = stageView(preview.visuals, preview.selected, publication);
  const flow = (id: string) => steward.flows.find(item => item.id === id);
  const start = (id: string) => { const found = id === steward.demo?.id ? steward.demo : flow(id); if (found) stewardDock.open(found); };
  return <section className="visuals-room visuals-deck" aria-label={copy.work}>
    <BeaconStage view={view} burst={preview.events[0]?.id ?? 'none'} notice={view.mode === 'rest' ? preview.notice : undefined}
      compose={(picture, reading, details) => <BeaconDeck picture={picture} reading={reading} open={open} on_open={() => setOpen(true)} on_close={() => setOpen(false)}
        caption={view.stamp ?? 'Local preview · SIMULATED · no live input'}
        preview={<>{proposals.proposals.filter(item => item.chamber === 'visuals' && isPending(item)).slice(0, 2).map(item =>
          <p key={item.id} className="visuals-preview-draft">{item.title}<br />Draft · revision {item.revision} · not on air</p>)}{publication
          ? <p>{view.item.visual.name} · {view.stamp ?? 'Draft · not on air'}</p>
          : pending === 0 && <p>Nothing in Preview. Ask the Steward to draft one.</p>}</>}
        program={<p>{selected.visual.name}<br />{Math.round(selected.intensity * 100)}% blaze · SIMULATED local preview</p>}
        picker={<BeaconPlates visuals={preview.visuals} selected={view.item.visual.visual_id} compact busy={Boolean(publication)}
          on_select={item => adapter.select(item.visual.visual_id)} />}
        weighting={<label className="visuals-weight">Gift-sub weighting<RoomKeyBadge room="visuals" action="tune" />
          <input type="range" min="1" max="6" step="1" value={view.item.gift_weight} disabled={Boolean(publication)}
            onChange={event => adapter.weight(Number(event.currentTarget.value))} />
          <output>{view.item.gift_weight}×</output></label>}
        actions={<>
          <button type="button" className="cc-btn" onClick={() => start(flow_ids.test)}><RoomKeyBadge room="visuals" action="test" />Test fire</button>
          <button type="button" className="cc-btn" onClick={() => start(flow_ids.replay)}><RoomKeyBadge room="visuals" action="replay" />Replay a night</button>
        </>}
        drawer={<>
          <div className="visuals-deck-actions">
            <button type="button" className="cc-btn" disabled={Boolean(publication) || selected.visual.curve.decay.kind === 'none'} onClick={() => {
              const decay = selected.visual.curve.decay;
              if (decay.kind === 'exponential') adapter.decay({ ...decay, half_life_s: Math.max(1, Math.round(decay.half_life_s / 2)) });
            }}><RoomKeyBadge room="visuals" action="decay" />Halve the decay</button>
            <button type="button" className="cc-btn" onClick={event =>
              event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLSelectElement>('#beacon-colour')?.focus()}>Tonight’s theme</button>
            <button type="button" className="cc-btn cc-btn--quiet" onClick={() => start(flow_ids.tune)}><RoomKeyBadge room="visuals" action="tune" />Tune this beacon</button>
            <button type="button" className="cc-btn" onClick={() => start(flow_ids.demo)}>Play demo</button>
          </div>
          <ChamberSection title="Reading and sample night">{details}</ChamberSection>
          <ChamberSection title="Every beacon, every tier"><BeaconPlates visuals={preview.visuals} selected={preview.selected}
            on_select={item => adapter.select(item.visual.visual_id)} /></ChamberSection>
          <ProposalLayers chamber="visuals" queue={queue} />
          <FixtureBench selected={selected} editor={editor} preview={preview} adapter={adapter} queue={queue} appearance={appearance} seal_slot={seal_slot} />
        </>} />}
    />
  </section>;
}

export default function VisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <CoreVisualsRoom snapshot={snapshot} seal_slot={seal_slot} />;
  return <VisualsWork seal_slot={seal_slot} />;
}
