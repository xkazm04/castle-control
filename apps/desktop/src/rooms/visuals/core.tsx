import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { ContributionSource, Visual, VisualId, DesignId } from '@castle-control/contract';
import { WindowedRows, rowHeight } from '@castle-control/ui';
import { coreBeaconsConnection } from '../../client.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import type { Snapshot } from '../../model.js';
import { BrowserSourceButton, BrowserSourceNotice, createBrowserSourceCopy } from './source-copy.jsx';
import { ContributionFeed } from './event-feed.jsx';
import './room.css';
import './core.css';

function VisualEditor({ visual, port, busy }: { visual?: Visual; port: CoreBeaconsPort; busy: boolean }) {
  return <form className="visuals-core-form" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const visual_id = form.get('visual_id'); const name = form.get('name'); const design_id = form.get('design_id');
    if (typeof visual_id !== 'string' || typeof name !== 'string' || typeof design_id !== 'string') return;
    // Brands are checked by the port's generated schema before transport.
    void port.upsert({ visual: { visual_id: visual_id as VisualId, name,
      ...(design_id.trim() ? { design_id: design_id as DesignId } : {}),
      curve: visual?.curve ?? { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } } });
  }}>
    <h2>{visual ? 'Edit visual configuration' : 'Create a visual'}</h2>
    <label>Visual ID<input name="visual_id" defaultValue={visual?.visual_id ?? ''} readOnly={!!visual} disabled={busy} required /></label>
    <label>Visual name<input name="name" defaultValue={visual?.name ?? ''} disabled={busy} required /></label>
    <label>Design ID (optional)<input name="design_id" defaultValue={visual?.design_id ?? ''} disabled={busy} /></label>
    {!visual && <p>New curves start at 0 intensity for 0 units and 100% for 50 units, with no decay. Edit after saving.</p>}
    <button type="submit" disabled={busy}>Save visual to core</button>
  </form>;
}

function CurveEditor({ visual, port, busy }: { visual: Visual; port: CoreBeaconsPort; busy: boolean }) {
  return <form className="visuals-core-form" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void port.setCurve({ visual_id: visual.visual_id, curve: {
      ranges: visual.curve.ranges.map((_point, index) => ({ total: Number(form.get(`total-${index}`)),
        intensity: Number(form.get(`intensity-${index}`)) / 100 })),
      decay: form.get('decay') === 'exponential'
        ? { kind: 'exponential', half_life_s: Number(form.get('half_life_s')) } : { kind: 'none' },
    } });
  }}>
    <h2>Kindling curve · contribution to intensity</h2>
    <p>Use the native units of the input you simulate. The core validates ordering and decay.</p>
    {visual.curve.ranges.map((point, index) => <fieldset key={index} disabled={busy}>
      <legend>Control point {index + 1}</legend>
      <label>Contribution total<input name={`total-${index}`} type="number" min="0" max="4294967295" step="1"
        required defaultValue={point.total} /></label>
      <label>Intensity (%)<input name={`intensity-${index}`} type="number" min="0" max="100" step="any"
        required defaultValue={point.intensity * 100} /></label>
    </fieldset>)}
    <label>Decay<select name="decay" defaultValue={visual.curve.decay.kind} disabled={busy}>
      <option value="none">No decay</option><option value="exponential">Exponential</option>
    </select></label>
    <label>Half-life (seconds, exponential only)<input name="half_life_s" type="number" min="1" step="1" disabled={busy}
      defaultValue={visual.curve.decay.kind === 'exponential' ? visual.curve.decay.half_life_s : 300} /></label>
    <button type="submit" disabled={busy}>Save curve to core</button>
  </form>;
}

const sources: readonly ContributionSource[] = ['gift', 'subscribe', 'resub', 'cheer', 'bits_use',
  'hype_train', 'channel_points', 'charity', 'goal', 'power_up'];

export function ConnectedBeacons({ port, seal_slot }: { port: CoreBeaconsPort; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const source_copy = useMemo(() => createBrowserSourceCopy(port), [port]);
  const copy_state = useSyncExternalStore(source_copy.subscribe, source_copy.getSnapshot, source_copy.getSnapshot);
  const [creating, setCreating] = useState(false);
  useEffect(() => { void port.load(); }, [port]);
  const visual = state.visuals.find(item => item.visual_id === state.selected);
  return <section className="visuals-room visuals-core" aria-label="Core Beacons" aria-busy={state.busy}>
    <div className="visuals-room-layout">
      <div className="visuals-room-workbench">
        <p role="status" aria-live="polite">{state.notice}</p>
        <button type="button" disabled={state.busy} onClick={() => { void port.load(); }}>Refresh Beacons</button>
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
              <option key={source} value={source}>{source.replaceAll('_', ' ')}</option>)}</select></label>
            <label>Amount (source units)<input name="amount" type="number" min="0" max="4294967295" step="1"
              defaultValue={1} required disabled={state.busy} /></label>
            <button type="submit" disabled={state.busy}>Simulate burst</button>
          </form>
          {state.simulation && state.simulation.intensity.visual_id === visual.visual_id
            && <output>{Math.round(state.simulation.intensity.intensity * 100)}% blaze · {state.simulation.label} · core result</output>}
        </section>}
      </div>
      <div className="visuals-room-details">
        <VisualEditor key={`visual-${creating ? 'new' : JSON.stringify(visual)}`} port={port} busy={state.busy}
          {...(!creating && visual ? { visual } : {})} />
        {visual && <CurveEditor key={JSON.stringify(visual)} visual={visual} port={port} busy={state.busy} />}
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
