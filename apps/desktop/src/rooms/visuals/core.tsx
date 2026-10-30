import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CardBody, CardHead, HeraldicCard, InkButton, WindowedRows, rowHeight } from '@castle-control/ui';
import { coreBeaconsConnection } from '../../client.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import type { Snapshot } from '../../model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { BrowserSourceButton, BrowserSourceNotice, createBrowserSourceCopy } from './source-copy.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { LiveContributionFeed } from './live-feed.jsx';
import { EditableKindlingCurve } from './kindling-curve.jsx';
import { VisualEditor } from './visual-editor.jsx';
import { contribution_sources as sources, inputDescription, source_labels } from './contribution-input.js';
import { BeaconPlates } from './plates.jsx';
import { BeaconBay, BeaconBench, SealPanel } from './bench.jsx';
import './room.css';
import './core.css';

const ArtSection = lazy(() => import('./art.jsx'));

export function ConnectedBeacons({ port, seal_slot }: { port: CoreBeaconsPort; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const source_copy = useMemo(() => createBrowserSourceCopy(port), [port]);
  const copy_state = useSyncExternalStore(source_copy.subscribe, source_copy.getSnapshot, source_copy.getSnapshot);
  const [creating, setCreating] = useState(false);
  useEffect(() => { void port.load(); void port.loadContributions({ limit: 100 }); }, [port]);
  useEffect(() => { void port.loadArtStatus(); }, [port]);
  const visual = state.visuals.find(item => item.visual_id === state.selected);
  const plates = state.visuals.map(item => ({ visual: item,
    ...(state.simulation?.intensity.visual_id === item.visual_id ? { intensity: state.simulation.intensity.intensity } : {}),
  }));
  return <section className="visuals-room visuals-core" aria-label="Core Beacons" aria-busy={state.busy}>
    <div className="visuals-board">
      <BeaconPlates visuals={plates} selected={state.selected ?? ''} core busy={state.busy}
        on_select={item => { port.select(item.visual.visual_id); setCreating(false); }} />
      <BeaconBench name={visual?.name ?? copy.visuals} notice={state.notice}>
        <BeaconBay title={copy.driven_by} gloss={copy.core_input}>
          <h2>Beacons · core configurations</h2>
          <p>Live contribution totals and OBS delivery are unavailable in this connection. Money changes visuals only.</p>
          <InkButton size="wrap" disabled={state.busy} onClick={() => {
            void port.load(); void port.loadContributions({ limit: 100 });
          }}>Refresh Beacons</InkButton>
          {visual && <p>Driven by: {inputDescription(visual.input)}</p>}
          <InkButton size="wrap" disabled={state.busy} onClick={() => setCreating(true)}>New visual</InkButton>
          <VisualEditor key={`visual-${creating ? 'new' : JSON.stringify(visual)}`} port={port} busy={state.busy}
            {...(!creating && visual ? { visual } : {})} />
        </BeaconBay>
        <BeaconBay title={copy.curve} gloss={copy.core_curve}>
          {visual && <EditableKindlingCurve visual={visual} port={port} busy={state.busy} />}
        </BeaconBay>
        <BeaconBay title={copy.test_fire} gloss={copy.core_test}>
          {visual && <section className="visuals-core-form"><h2>Test fire · core simulation</h2>
            <p>Each test starts empty; it does not change live totals or saved configuration.</p>
            <div className="visuals-fire-grid">
              <InkButton size="wrap" variant="offset" ink="or" disabled={state.busy} onClick={() => { void port.simulate({
                visual_id: visual.visual_id, burst: { source: 'gift', amount: 50 },
              }); }}>Simulate 50 gift subs</InkButton>
              <InkButton size="wrap" disabled={state.busy} onClick={() => { void port.simulate({
                visual_id: visual.visual_id, burst: { source: 'subscribe', amount: 1 },
              }); }}>{copy.fire_sub}</InkButton>
            </div>
            <form onSubmit={event => {
              event.preventDefault(); const form = new FormData(event.currentTarget);
              const source = sources.find(item => item === form.get('source'));
              if (source) void port.simulate({ visual_id: visual.visual_id, burst: { source, amount: Number(form.get('amount')) } });
            }}>
              <label>Input source<select name="source" disabled={state.busy}>{sources.map(source =>
                <option key={source} value={source}>{source_labels[source]}</option>)}</select></label>
              <label>Amount (source units)<input name="amount" type="number" min="0" max="4294967295" step="1"
                defaultValue={1} required disabled={state.busy} /></label>
              <InkButton size="wrap" type="submit" disabled={state.busy}>Simulate burst</InkButton>
            </form>
            {state.simulation && state.simulation.intensity.visual_id === visual.visual_id
              && <output>{Math.round(state.simulation.intensity.intensity * 100)}% blaze · {state.simulation.label} · core result</output>}
          </section>}
        </BeaconBay>
      </BeaconBench>
      <div className="visuals-room-details visuals-panels">
        <HeraldicCard variant="panel">
          <CardHead title={copy.core_controls} />
          <CardBody>
            <BrowserSourceNotice state={copy_state} />
            <WindowedRows rows={state.visuals} label="Core beacon visuals" row_height={rowHeight * 4}
              row_key={item => item.visual_id} empty_state="No visuals loaded from the core.">
              {item => <article className="visuals-core-item">
                <h3>{item.name}</h3>
                <p>{item.design_id ? `Design: ${item.design_id}` : 'No design assigned'} · {item.curve.ranges.length} control points</p>
                <BrowserSourceButton copy={source_copy} visual={item} busy={state.busy || copy_state.busy} />
              </article>}
            </WindowedRows>
            {state.art_available && visual && <Suspense fallback={null}>
              <ArtSection key={visual.visual_id} port={port} visual={visual} />
            </Suspense>}
          </CardBody>
        </HeraldicCard>
        <div className="visuals-core-feeds">
          <LiveContributionFeed read={state.contributions} on_refresh={() => { void port.loadContributions({ limit: 100 }); }} />
          <ContributionFeed events={state.events} origin="Core simulation" />
        </div>
        <SealPanel>{seal_slot}</SealPanel>
      </div>
    </div>
  </section>;
}

export default function CoreVisualsRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const connection = coreBeaconsConnection(snapshot);
  if (!connection) return <section className="visuals-room"><p role="status">Beacons are not configured. Local connection unavailable; reopen the desktop shell.</p>{seal_slot}</section>;
  try { connection.port ??= createCoreBeaconsPort(connection.launch, connection.transport); }
  catch { return <section className="visuals-room"><p role="status">Local Beacons connection is invalid. Reopen the desktop shell.</p>{seal_slot}</section>; }
  return <ConnectedBeacons port={connection.port} seal_slot={seal_slot} />;
}
