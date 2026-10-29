import { useState, useSyncExternalStore } from 'react';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ReactNode } from 'react';
import type { Snapshot } from '../../model.js';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { BeaconArtwork } from './artwork.jsx';
import { ProposalLayers } from './proposal-layers.jsx';
import { Offerings } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import { KindlingCurve } from './kindling-curve.jsx';
import CoreVisualsRoom from './core.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { InputPicker } from './input-picker.jsx';
import { inputDescription } from './contribution-input.js';
import './room.css';

function IntensityRanges({ item }: { item: PreviewVisual }) {
  return <div className="visuals-room-ranges" role="group" aria-label={`${item.visual.name} intensity ranges · weighted subs to blaze`}>
    {item.visual.curve.ranges.map((point, index, points) => <span key={point.total} data-tier-start={point.total}
      className={item.total >= point.total && (!points[index + 1] || item.total < (points[index + 1]?.total ?? 0))
        ? 'visuals-room-tier-active' : undefined}>
      <b>{point.total}{points[index + 1] ? `–${points[index + 1]?.total}` : '+'}</b><br />
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
      <p className="visuals-room-description">{item.visual.design_id === 'altar' ? 'On-screen object'
        : item.visual.design_id === 'camera-frame' ? 'Camera frame' : 'Screen border'} · gifts + subs ·{' '}
        {item.visual.curve.decay.kind === 'none' ? 'No decay' : `Halves every ${item.visual.curve.decay.half_life_s / 60} min`}</p>
      <p className="visuals-room-description">Driven by: {inputDescription(item.visual.input)} · simulated configuration</p>
      <p className="visuals-room-now">Now: <strong>{Math.round(item.intensity * 100)}% blaze</strong>{' '}
        <span>({item.total.toFixed(1)} weighted subs)</span> · simulated</p>
      <IntensityRanges item={item} />
    </article>)}
  </section>;
}

export function VisualsWork({ queue, port, seal_slot }: { queue?: ProposalQueue; port?: BeaconsPort; seal_slot?: ReactNode }) {
  const [adapter, setAdapter] = useState(() => port ?? createBeaconsPreview());
  const preview = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const selected = preview.visuals.find(item => item.visual.visual_id === preview.selected);
  if (!selected) return <p role="status">No simulated visual is available.</p>;
  return <section className="visuals-room" aria-label="Beacons work">
    <div className="visuals-room-layout">
      <div className="visuals-room-workbench">
        <figure className="visuals-room-layer" data-on-air="false">
          <figcaption className="room-caption"><h2>{selected.visual.name}</h2>
            Simulated blaze from gifts and subs · {selected.visual.curve.decay.kind === 'none'
              ? 'no decay' : `halving every ${selected.visual.curve.decay.half_life_s / 60} minutes`}</figcaption>
          <BeaconArtwork item={selected} hero />
          <ProposalLayers chamber="visuals" {...(queue ? { queue } : {})} />
        </figure>
        <InputPicker source={selected.visual.input?.source ?? ''} busy={false} on_change={adapter.input} />
        <p>Simulated configuration only. Test fires use gifts/subs independently; live routing is a separate core step.</p>
        <KindlingCurve item={selected} />
        <details className="visuals-room-test-tools"><summary>Test fire · local preview controls</summary>
          <TestFire port={adapter} selected={selected} on_end={() => setAdapter(createBeaconsPreview())} />
          <p>Money changes looks only. This room has no OBS connection.</p>
        </details>
        <p className="visuals-room-status" role="status" aria-live="polite">{preview.notice}</p>
      </div>
      <div className="visuals-room-details">
        <VisualSelector visuals={preview.visuals} selected={preview.selected} on_select={item => adapter.select(item.visual.visual_id)} />
        <Offerings />
        <ContributionFeed events={preview.events} origin="Local preview" />
        {seal_slot}
      </div>
    </div>
  </section>;
}

export default function VisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <CoreVisualsRoom snapshot={snapshot} seal_slot={seal_slot} />;
  return <VisualsWork seal_slot={seal_slot} />;
}
