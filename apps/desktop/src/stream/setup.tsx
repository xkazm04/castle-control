import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { SealButton, Stamp, WindowedRows } from '@castle-control/ui';
import { stewardDock, useFlowDraft } from '@castle-control/ui/steward-flow';
import { tokens } from '@castle-control/tokens';
import { fixtureVisuals } from '../beacons-fixture.js';
import { SurfaceHead } from '../keep/surface-head.jsx';
import { createStreamSetup, streamPresets } from './setup-model.js';
import type { StreamRow, StreamSetupModel, StreamState } from './setup-model.js';
import type { StreamConnection } from './obs-core.js';
import { addAllFlow, addSourceFlow, attachStreamSetup } from './steward-flows.js';
import type { AddSourceDraft } from './steward-flows.js';
import './setup.css';
import '@castle-control/ui/fused/surface.css';
import '@castle-control/ui/fused/folio.css';

const statusCopy: Record<StreamState['obs'], string> = {
  unknown: 'OBS status unknown · refresh to check', connected: 'OBS is listening',
  down: 'OBS is not listening · enable obs-websocket v5 in OBS', simulated: 'SIMULATED',
};
const rowHeight = Number.parseFloat(tokens.layout['row-h']) * 6;
const orientation = { '1080p': 'landscape', '720p': 'landscape', vertical: 'portrait' } as const;

/** Sample art per output kind: illustrative thumbnails, never a capture of the real source. */
function thumb(row: StreamRow): string {
  if (row.vote_bar) return '/art/preset-heraldic-votebar.webp';
  if (row.duel) return '/art/preset-heraldic-hexmap.webp';
  if (row.href) return '/art/preset-heraldic-urn.webp';
  const design = fixtureVisuals.find(visual => visual.visual_id === row.visual_id)?.design_id;
  return design === 'camera-frame' || design === 'border' ? '/art/preset-heraldic-frame2.webp' : '/art/preset-heraldic-altar.webp';
}
const phaseStamp = (phase: StreamRow['phase']) => phase === 'added' ? 'cc-stamp--ok' : phase === 'refused' || phase === 'unavailable' ? 'cc-stamp--blocked' : 'cc-stamp--local';

/** Leaf parts accept state/ids as props so ordinary function-call tests stay valid. */
export function StreamSetupRow({ row, state, model, drafting = false }: { row: StreamRow; state: StreamState; model: StreamSetupModel; drafting?: boolean }) {
  const size = streamPresets[state.preset];
  const usable = Boolean(row.visual_id || row.vote_bar || row.duel);
  return <article className="cc-sheet stream-output" data-phase={row.phase} data-drafting={drafting ? 'true' : undefined} aria-label={row.name}>
    <div className="stream-thumb"><img src={thumb(row)} alt="" /><span className="cc-sim">Sample art</span></div>
    <div className="stream-output__body">
      <header><h2>{row.name}</h2><span className={`cc-stamp cc-stamp--inked ${phaseStamp(row.phase)}`}>{row.phase}</span></header>
      {usable ? <>
        <p className="stream-meta">{size.width} × {size.height} · Scene: {state.scene_name}</p>
        <div className="stream-output-actions">
          <button className="cc-btn" type="button" disabled={state.busy} onClick={() => { void model.copy(row.id); }}>Copy browser-source URL</button>
          <SealButton variant="proclaim" disabled={!model.canAdd(row.id)} on_seal={() => { void model.add(row.id); }} />
        </div>
      </> : <p><a className="cc-link" href={row.href}>Open the Lot Chamber</a></p>}
      <p className="stream-output-notice" role="status" aria-live="polite">{row.notice ?? 'Hold to add this visual as a browser source in OBS.'}</p>
    </div>
  </article>;
}

/** The canvas, measured: the chosen size drawn to scale on the scene. */
export function CanvasPlan({ preset, scene, drafted }: { preset: StreamState['preset']; scene: string; drafted: boolean }) {
  const size = streamPresets[preset];
  const box = { w: 240, h: 150 };
  const scale = Math.min(box.w / size.width, box.h / size.height);
  const w = Math.round(size.width * scale); const h = Math.round(size.height * scale);
  const x = 40 + (box.w - w) / 2; const y = 22 + (box.h - h) / 2;
  return <div className="stream-plan" data-drafted={drafted ? 'true' : undefined}>
    <span className="stream-fig">Fig. I<em>the canvas, measured</em></span>
    <svg viewBox="0 0 300 200" role="img" aria-label={`Plan of the OBS canvas at ${size.width} by ${size.height}`}>
      <rect className="pl-ground" x={x} y={y} width={w} height={h} />
      <rect className="pl-src" x={x + 5} y={y + 5} width={Math.max(0, w - 10)} height={Math.max(0, h - 10)} />
      <text className="pl-cap" x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">browser source</text>
      <line className="pl-dim" x1={x} y1={y - 10} x2={x + w} y2={y - 10} />
      <text className="pl-num" x={x + w / 2} y={y - 14} textAnchor="middle">{size.width}</text>
      <line className="pl-dim" x1={x - 12} y1={y} x2={x - 12} y2={y + h} />
      <text className="pl-num" x={x - 16} y={y + h / 2} textAnchor="middle" transform={`rotate(-90 ${x - 16} ${y + h / 2})`}>{size.height}</text>
      <text className="pl-lab" x={x} y={y + h + 20}>scene · {scene}</text>
    </svg>
    <div className="stream-size"><span>Source size</span><b>{size.width} × {size.height}</b><small>{preset} · {orientation[preset]}{drafted ? ' · draft' : ''}</small></div>
  </div>;
}

export function StreamSetupContent({ model, state, on_back, draft }: { model: StreamSetupModel; state: StreamState; on_back: () => void; draft?: AddSourceDraft }) {
  const preset = draft?.preset ?? state.preset;
  const scene = draft?.scene || state.scene_name;
  const ready = state.rows.filter(row => (row.visual_id || row.vote_bar || row.duel) && row.phase !== 'added').length;
  return <section className="stream-workspace" aria-label="On stream · Set up OBS">
    <SurfaceHead className="stream-heading" title="Set up OBS" versal trail={[{ label: 'On stream', href: '#/demo' }]} on_back={on_back}
      subtitle="On stream · deliver each visual to OBS as a local browser source."
      mark={state.obs === 'simulated' ? <span className="cc-sim">Simulated</span> : undefined} />
    <div className="stream-body">
      <div className="stream-side">
        <section className="cc-panel stream-charter" data-chamber="visuals" aria-label="OBS connection and source size">
          <div className="cc-panel__head"><h2 className="cc-panel__title">OBS connection and source size</h2></div>
          <div className="cc-panel__body">
            <div className="stream-status">{state.obs === 'simulated' ? <Stamp kind="simulated" word={statusCopy[state.obs]} />
              : <span className={`cc-stamp cc-stamp--inked ${state.obs === 'connected' ? 'cc-stamp--ok' : 'cc-stamp--waiting'}`}>{statusCopy[state.obs]}</span>}
              <button className="cc-btn cc-btn--sm" type="button" disabled={state.busy} onClick={() => { void model.refresh(); }}>Refresh OBS and outputs</button></div>
            <p className="stream-lead">Choose an existing scene in OBS. Hold to add a transparent browser source, then inspect its placement in OBS.</p>
            <div className="stream-fields">
              <label className="cc-field">Scene name<input className="cc-input" aria-label="Scene name" defaultValue={state.scene_name} disabled={state.busy}
                aria-invalid={Boolean(state.scene_error)} aria-describedby="stream-scene-error"
                onChange={event => { model.setScene(event.currentTarget.value); }} /></label>
              <label className="cc-field">Source size<select className="cc-select" aria-label="Source size" value={state.preset} disabled={state.busy}
                onChange={event => { model.setPreset(event.currentTarget.value); }}>
                {Object.entries(streamPresets).map(([id, size]) => <option key={id} value={id}>{id} · {size.width} × {size.height}</option>)}
              </select></label>
            </div>
            <CanvasPlan preset={preset} scene={scene} drafted={Boolean(draft?.preset || draft?.scene)} />
            <p className="cc-gloss-note" id="stream-scene-error" role="status">{state.scene_error ?? state.preset_error ?? state.notice}</p>
          </div>
        </section>
        <p className="stream-note">Beacons visuals, Duel and the aggregate-only Gatehouse vote bar use the size above. Lot plates become available after a sealed draw.
          {' '}<a href="#/chamber/visuals">Configure visuals in Beacons</a>.</p>
      </div>
      <section className="cc-folio stream-folio" aria-label="Outputs">
        <div className="stream-outs-head"><h2 className="cc-rubric">Outputs · browser sources</h2><div className="cc-orn" aria-hidden="true"><i /></div>
          <span className="cc-stamp cc-stamp--local cc-stamp--inked">{state.rows.length} outputs</span></div>
        <div className="stream-steward">
          <p>The Steward walks you through it: pick an output, the scene and the size, then hold.</p>
          <button className="cc-btn cc-btn--chamber cc-btn--sm" type="button" disabled={!ready} onClick={() => { stewardDock.open(state.obs === 'simulated' ? { ...addSourceFlow, simulated: true } : addSourceFlow); }}>Add a source</button>
          <button className="cc-btn cc-btn--sm" type="button" disabled={!ready} onClick={() => { stewardDock.open(state.obs === 'simulated' ? { ...addAllFlow, simulated: true } : addAllFlow); }}>Add every output</button>
        </div>
        <WindowedRows rows={state.rows} row_key={row => row.id} label="OBS outputs" row_height={rowHeight}>
          {row => <StreamSetupRow row={row} state={state} model={model} drafting={draft?.all ? row.phase !== 'added' && !row.href : draft?.output === row.id} />}
        </WindowedRows>
      </section>
    </div>
  </section>;
}

/** The page alone owns the store subscription; importing the shell never loads this module. */
export default function StreamSetup({ mode, connection, on_back }: {
  mode: 'fixture' | 'core'; connection?: StreamConnection; on_back: () => void;
}) {
  const model = useMemo(() => createStreamSetup(mode === 'fixture' ? { mode } : { mode, ...connection }), [mode, connection]);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  useEffect(() => { void model.refresh(); }, [model]);
  useEffect(() => attachStreamSetup(model), [model]);
  const one = useFlowDraft(addSourceFlow);
  const all = useFlowDraft(addAllFlow);
  const draft = one ?? all;
  return <StreamSetupContent model={model} state={state} on_back={on_back} {...(draft ? { draft } : {})} />;
}
