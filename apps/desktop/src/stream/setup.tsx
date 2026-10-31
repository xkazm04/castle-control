import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HeraldicCard, InkButton, SealButton, StatusChip, WindowedRows } from '@castle-control/ui';
import { tokens } from '@castle-control/tokens';
import { createStreamSetup, streamPresets } from './setup-model.js';
import type { StreamRow, StreamSetupModel, StreamState } from './setup-model.js';
import type { StreamConnection } from './obs-core.js';
import './setup.css';

const statusCopy: Record<StreamState['obs'], string> = {
  unknown: 'OBS status unknown · refresh to check', connected: 'OBS is listening',
  down: 'OBS is not listening · enable obs-websocket v5 in OBS', simulated: 'SIMULATED',
};
const rowHeight = Number.parseFloat(tokens.layout['row-h']) * 7;

/** Leaf parts accept state/ids as props so ordinary function-call tests stay valid. */
export function StreamSetupRow({ row, state, model }: { row: StreamRow; state: StreamState; model: StreamSetupModel }) {
  const size = streamPresets[state.preset];
  return <HeraldicCard className="stream-output" variant="raised" aria-label={row.name}>
    <header><h2>{row.name}</h2><StatusChip variant="dash">{row.phase}</StatusChip></header>
    {row.visual_id || row.vote_bar ? <>
      <p>{size.width} × {size.height} · Scene: {state.scene_name}</p>
      <div className="stream-output-actions">
        <InkButton disabled={state.busy} onClick={() => { void model.copy(row.id); }}>Copy browser-source URL</InkButton>
        <SealButton variant="proclaim" disabled={!model.canAdd(row.id)} on_seal={() => { void model.add(row.id); }} />
      </div>
    </> : <a href={row.href}>Open the Lot Chamber</a>}
    <p className="stream-output-notice" role="status" aria-live="polite">{row.notice ?? 'Hold to add this visual as a browser source in OBS.'}</p>
  </HeraldicCard>;
}

export function StreamSetupContent({ model, state, on_back }: { model: StreamSetupModel; state: StreamState; on_back: () => void }) {
  const size = streamPresets[state.preset];
  return <section className="stream-workspace" aria-label="On stream · Set up OBS">
    <header className="stream-heading">
      <InkButton onClick={on_back}>Back to the keep</InkButton><h1>On stream <span>Set up OBS</span></h1>
    </header>
    <HeraldicCard variant="raised" aria-label="OBS connection and source size">
      <div className="stream-status"><StatusChip variant="dash">{statusCopy[state.obs]}</StatusChip>
        <InkButton disabled={state.busy} onClick={() => { void model.refresh(); }}>Refresh OBS and outputs</InkButton></div>
      <p>Choose an existing scene in OBS. Hold to add a transparent browser source, then inspect its placement in OBS.</p>
      <div className="stream-fields">
        <label>Scene name<input aria-label="Scene name" defaultValue={state.scene_name} disabled={state.busy}
          aria-invalid={Boolean(state.scene_error)} aria-describedby="stream-scene-error"
          onChange={event => { model.setScene(event.currentTarget.value); }} /></label>
        <label>Source size<select aria-label="Source size" value={state.preset} disabled={state.busy}
          onChange={event => { model.setPreset(event.currentTarget.value); }}>
          {Object.entries(streamPresets).map(([preset, size]) => <option key={preset} value={preset}>
            {preset} · {size.width} × {size.height}</option>)}
        </select></label>
        <strong>{size.width} × {size.height}</strong>
      </div>
      <p id="stream-scene-error" role="status">{state.scene_error ?? state.preset_error ?? state.notice}</p>
    </HeraldicCard>
    <p>Beacons visuals and the aggregate-only Gatehouse vote bar use the size above. Lot plates become available after a sealed draw.
      {' '}<a href="#/chamber/visuals">Configure visuals in Beacons</a>.</p>
    <WindowedRows rows={state.rows} row_key={row => row.id} label="OBS outputs" row_height={rowHeight}>
      {row => <StreamSetupRow row={row} state={state} model={model} />}
    </WindowedRows>
  </section>;
}

/** The page alone owns the store subscription; importing the shell never loads this module. */
export default function StreamSetup({ mode, connection, on_back }: {
  mode: 'fixture' | 'core'; connection?: StreamConnection; on_back: () => void;
}) {
  const model = useMemo(() => createStreamSetup(mode === 'fixture' ? { mode } : { mode, ...connection }), [mode, connection]);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  useEffect(() => { void model.refresh(); }, [model]);
  return <StreamSetupContent model={model} state={state} on_back={on_back} />;
}
