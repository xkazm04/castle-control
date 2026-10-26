import { useState, useSyncExternalStore } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { BeaconArtwork } from './artwork.jsx';
import { ProposalLayers } from './proposal-layers.jsx';
import { Offerings } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import './room.css';

function IntensityRanges({ item }: { item: PreviewVisual }) {
  return <div className="visuals-room-ranges" aria-label={`${item.visual.name} intensity ranges`}>
    {item.visual.curve.ranges.map((point, index, points) => <span key={point.total}>
      <b>{point.total}{points[index + 1] ? `–${points[index + 1]?.total}` : '+'}</b> weighted subs<br />
      {Math.round(point.intensity * 100)}% intensity
    </span>)}
  </div>;
}

export function VisualSelector({ visuals, selected, on_select }: {
  visuals: readonly PreviewVisual[]; selected: string; on_select: (item: PreviewVisual) => void;
}) {
  return <section className="visuals-room-visuals" aria-label="Beacon visuals">
    {visuals.map(item => <article key={item.visual.visual_id}>
      <button type="button" className="visuals-room-select" aria-pressed={item.visual.visual_id === selected}
        onClick={() => on_select(item)}>{item.visual.name}</button>
      <BeaconArtwork item={item} />
      <p><strong>{Math.round(item.intensity * 100)}% blaze</strong> · simulated<br />
        {item.visual.curve.decay.kind === 'none' ? 'No decay' : `Halves every ${item.visual.curve.decay.half_life_s / 60} min`}</p>
      <IntensityRanges item={item} />
    </article>)}
  </section>;
}

export function VisualsWork({ queue, port }: { queue?: ProposalQueue; port?: BeaconsPort }) {
  const [adapter, setAdapter] = useState(() => port ?? createBeaconsPreview());
  const preview = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const selected = preview.visuals.find(item => item.visual.visual_id === preview.selected);
  if (!selected) return <p role="status">No simulated visual is available.</p>;
  return <section className="visuals-room" aria-label="Beacons work">
    <div className="visuals-room-layout">
      <div className="visuals-room-workbench">
        <h2>{selected.visual.name}</h2>
        <p className="visuals-room-subtitle">Contribution visuals · local sand table</p>
        <div className="visuals-room-layer" data-on-air="false">
          <BeaconArtwork item={selected} hero />
          <ProposalLayers chamber="visuals" {...(queue ? { queue } : {})} />
        </div>
        <TestFire port={adapter} selected={selected} on_end={() => setAdapter(createBeaconsPreview())} />
        <p role="status" aria-live="polite">{preview.notice}</p>
        <p>Money changes looks only. This room has no OBS connection.</p>
      </div>
      <div className="visuals-room-details">
        <VisualSelector visuals={preview.visuals} selected={preview.selected} on_select={item => adapter.select(item.visual.visual_id)} />
        <Offerings />
      </div>
    </div>
  </section>;
}

export default function VisualsRoom({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.mode !== 'fixture') return <EmptyState title="Beacons are not configured"
    description="No live visuals are connected. Configure the Beacons before using this room." />;
  return <VisualsWork />;
}
