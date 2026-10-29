import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { WindowedRows, rowHeight } from '@castle-control/ui';
import { coreBeaconsConnection } from '../../client.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import type { Snapshot } from '../../model.js';
import { BrowserSourceButton, BrowserSourceNotice, createBrowserSourceCopy } from './source-copy.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { LiveContributionFeed } from './live-feed.jsx';
import { EditableKindlingCurve } from './kindling-curve.jsx';
import { VisualEditor } from './visual-editor.jsx';
import { contribution_sources as sources, inputDescription, source_labels } from './contribution-input.js';
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
  return <section className="visuals-room visuals-core" aria-label="Core Beacons" aria-busy={state.busy}>
    <div className="visuals-room-layout">
      <div className="visuals-room-workbench">
        <p role="status" aria-live="polite">{state.notice}</p>
        <button type="button" disabled={state.busy} onClick={() => {
          void port.load(); void port.loadContributions({ limit: 100 });
        }}>Refresh Beacons</button>
        <h2>Beacons · core configurations</h2>
        <p>Live contribution totals and OBS delivery are unavailable in this connection. Money changes visuals only.</p>
        <BrowserSourceNotice state={copy_state} />
        <WindowedRows rows={state.visuals} label="Core beacon visuals" row_height={rowHeight * 4}
          row_key={item => item.visual_id} empty_state="No visuals loaded from the core.">
          {item => <article className="visuals-core-item">
            <button type="button" disabled={state.busy} aria-pressed={item.visual_id === state.selected}
              onClick={() => { port.select(item.visual_id); setCreating(false); }}>{item.name}</button>
            <p>{item.design_id ? `Design: ${item.design_id}` : 'No design assigned'} · {item.curve.ranges.length} control points</p>
            <BrowserSourceButton copy={source_copy} visual={item} busy={state.busy || copy_state.busy} />
          </article>}
        </WindowedRows>
        {visual && <p>Driven by: {inputDescription(visual.input)}</p>}
        <button type="button" disabled={state.busy} onClick={() => setCreating(true)}>New visual</button>
        {visual && <section className="visuals-core-form"><h2>Test fire · core simulation</h2>
          <p>Each test starts empty; it does not change live totals or saved configuration.</p>
          <button type="button" disabled={state.busy} onClick={() => { void port.simulate({
            visual_id: visual.visual_id, burst: { source: 'gift', amount: 50 },
          }); }}>Simulate 50 gift subs</button>
          <form onSubmit={event => {
            event.preventDefault(); const form = new FormData(event.currentTarget);
            const source = sources.find(item => item === form.get('source'));
            if (source) void port.simulate({ visual_id: visual.visual_id, burst: { source, amount: Number(form.get('amount')) } });
          }}>
            <label>Input source<select name="source" disabled={state.busy}>{sources.map(source =>
              <option key={source} value={source}>{source_labels[source]}</option>)}</select></label>
            <label>Amount (source units)<input name="amount" type="number" min="0" max="4294967295" step="1"
              defaultValue={1} required disabled={state.busy} /></label>
            <button type="submit" disabled={state.busy}>Simulate burst</button>
          </form>
          {state.simulation && state.simulation.intensity.visual_id === visual.visual_id
            && <output>{Math.round(state.simulation.intensity.intensity * 100)}% blaze · {state.simulation.label} · core result</output>}
        </section>}
      </div>
      <div className="visuals-room-details">
        {state.art_available && visual && <Suspense fallback={null}>
          <ArtSection key={visual.visual_id} port={port} visual={visual} />
        </Suspense>}
        <VisualEditor key={`visual-${creating ? 'new' : JSON.stringify(visual)}`} port={port} busy={state.busy}
          {...(!creating && visual ? { visual } : {})} />
        {visual && <EditableKindlingCurve visual={visual} port={port} busy={state.busy} />}
        <LiveContributionFeed read={state.contributions} on_refresh={() => { void port.loadContributions({ limit: 100 }); }} />
        <ContributionFeed events={state.events} origin="Core simulation" />
        {seal_slot}
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
