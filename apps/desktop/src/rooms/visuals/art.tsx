import { useMemo, useSyncExternalStore } from 'react';
import type { Visual } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import { createArtGeneration } from './art-state.js';
import type { ArtGeneration, ArtState } from './art-state.js';
import './art.css';

type Controls = { art: ArtGeneration; state: ArtState };

export function GenerateButton({ art, state, disabled }: Controls & { disabled: boolean }) {
  return <button type="button" disabled={disabled || state.busy || state.confirming}
    onClick={() => art.requestConfirmation()}>Generate</button>;
}

export function ConfirmButton({ art, state }: Controls) {
  return <button type="button" disabled={state.busy || !state.confirming}
    onClick={() => art.confirm()}>Confirm and spend credits</button>;
}

export function ArtControls({ art, state, visual }: Controls & { visual: Visual }) {
  return <section className="visuals-core-form visuals-art" aria-label="Generate art" aria-busy={state.busy}>
    <h2>Generate art</h2>
    <p>For {visual.name}. Generates one 512 by 512 image in its local design package.</p>
    {!visual.design_id && <p>Save a design ID for this visual before generating art.</p>}
    <label>Art prompt<input value={state.prompt} disabled={state.busy || state.confirming} required
      onChange={event => art.edit('prompt', event.currentTarget.value)} /></label>
    <label>Leonardo model ID<input value={state.model_id} disabled={state.busy || state.confirming} required
      onChange={event => art.edit('model_id', event.currentTarget.value)} /></label>
    <GenerateButton art={art} state={state} disabled={!visual.design_id} />
    <p>The 30-a-day generation cap is not enforced by the app. Keep count yourself.</p>
    {state.confirming && <div role="group" aria-label="Confirm art generation">
      <p>This uses the streamer's own Leonardo key and costs credits. Generate this image?</p>
      <ConfirmButton art={art} state={state} />
      <button type="button" onClick={() => art.cancel()}>Cancel</button>
    </div>}
    {state.busy && <p role="status">Generating art. Waiting for the core result.</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.result && <div>
      <h3>Returned assets</h3>
      {state.result.assets.length === 0 && <p>No assets returned. The receipt still records the cost.</p>}
      <ul>{state.result.assets.map(asset => <li key={asset.asset}>
        Generated (Leonardo): <code>{asset.asset}</code> ({asset.provenance})
      </li>)}</ul>
      <h3>Cost receipt from core</h3>
      <pre>{JSON.stringify(state.result.costs, null, 2)}</pre>
    </div>}
  </section>;
}

export default function ArtSection({ port, visual }: { port: CoreBeaconsPort; visual: Visual }) {
  const art = useMemo(() => createArtGeneration(port, visual.design_id), [port, visual.design_id]);
  const state = useSyncExternalStore(art.subscribe, art.getSnapshot, art.getSnapshot);
  const core = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  return <ArtControls art={art} state={{ ...state, busy: state.busy || core.art_busy }} visual={visual} />;
}
