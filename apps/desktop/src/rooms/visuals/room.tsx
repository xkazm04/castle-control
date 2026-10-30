import { useState, useSyncExternalStore } from 'react';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ReactNode } from 'react';
import type { Snapshot } from '../../model.js';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { ProposalLayers } from './proposal-layers.jsx';
import { Offerings } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import { KindlingCurve } from './kindling-curve.jsx';
import CoreVisualsRoom from './core.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { InputPicker } from './input-picker.jsx';
import { BeaconPlates } from './plates.jsx';
import { BeaconBay, BeaconBench, SealPanel } from './bench.jsx';
import './room.css';

export function VisualSelector({ visuals, selected, on_select, draft }: {
  visuals: readonly PreviewVisual[]; selected: string; on_select: (item: PreviewVisual) => void; draft?: ReactNode;
}) {
  return BeaconPlates({ visuals, selected, on_select, draft });
}

export function VisualsWork({ queue, port, seal_slot }: { queue?: ProposalQueue; port?: BeaconsPort; seal_slot?: ReactNode }) {
  const [adapter, setAdapter] = useState(() => port ?? createBeaconsPreview());
  const preview = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const selected = preview.visuals.find(item => item.visual.visual_id === preview.selected);
  if (!selected) return <p role="status">{copy.no_visual}</p>;
  return <section className="visuals-room" aria-label={copy.work}>
    <div className="visuals-board">
      <VisualSelector visuals={preview.visuals} selected={preview.selected} on_select={item => adapter.select(item.visual.visual_id)}
        draft={<ProposalLayers chamber="visuals" {...(queue ? { queue } : {})} />} />
      <BeaconBench name={selected.visual.name} notice={preview.notice}>
        <BeaconBay title={copy.driven_by} gloss={copy.input_gloss}>
          <InputPicker source={selected.visual.input?.source ?? ''} busy={false} on_change={adapter.input} />
          <p className="visuals-note">{copy.fixture_input_note}</p>
        </BeaconBay>
        <BeaconBay title={copy.curve} gloss={copy.curve_gloss}><KindlingCurve item={selected} /></BeaconBay>
        <BeaconBay title={copy.test_fire} gloss={copy.test_gloss}>
          <TestFire port={adapter} selected={selected} on_end={() => setAdapter(createBeaconsPreview())} />
        </BeaconBay>
      </BeaconBench>
      <div className="visuals-room-details visuals-panels">
        <Offerings />
        <ContributionFeed events={preview.events} origin="Local preview" />
        <SealPanel>{seal_slot}</SealPanel>
      </div>
    </div>
  </section>;
}

export default function VisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <CoreVisualsRoom snapshot={snapshot} seal_slot={seal_slot} />;
  return <VisualsWork seal_slot={seal_slot} />;
}
