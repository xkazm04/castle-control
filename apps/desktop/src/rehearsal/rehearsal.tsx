import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Notice, SealButton, Stamp, WindowedRows } from '@castle-control/ui';
import { stewardDock, useFlowDraft } from '@castle-control/ui/steward-flow';
import type { AnyStewardFlow } from '@castle-control/ui/steward-flow';
import { tokens } from '@castle-control/tokens';
import { streamPresets } from '../stream/presets.js';
import { SurfaceHead } from '../keep/surface-head.jsx';
import { createRehearsalModel } from './rehearsal-model.js';
import type { RehearsalModel, RehearsalRow, RehearsalState } from './rehearsal-model.js';
import type { RehearsalConnection } from './rehearsal-core.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';
import { rehearsalShell } from './rehearsal-shell.js';
import { attachRehearsal } from './rehearsal-bridge.js';
import { cleanupFlow, connectAddress, connectFlow, pickedRows, scenarioFlow, sceneFlow } from './steward-flows.js';
import type { ConnectDraft, ScenarioDraft, SceneDraft } from './steward-flows.js';
import './rehearsal.css';
import '@castle-control/ui/fused/surface.css';
import '@castle-control/ui/fused/folio.css';

/** The masked field is uncontrolled, cleared before any asynchronous work, and never a read-model field. */
export function submitConnection(fields: { host: string; port: string; password: { value: string }; remember: boolean }, model: RehearsalModel) {
  const params = { host: fields.host, port: Number(fields.port), password: fields.password.value, remember: fields.remember };
  fields.password.value = '';
  return model.connect(params);
}

/** Submit the page's connection form: the one path both the direct button and the Steward's seal take. */
export function submitForm(form: HTMLFormElement, model: RehearsalModel) {
  const password = form.querySelector<HTMLInputElement>('[name="password"]');
  const host = form.querySelector<HTMLInputElement>('[name="host"]');
  const port = form.querySelector<HTMLInputElement>('[name="port"]');
  const remember = form.querySelector<HTMLInputElement>('[name="remember"]');
  if (!password || !host || !port || !remember) return undefined;
  return submitConnection({ host: host.value, port: port.value, password, remember: remember.checked }, model);
}

export type RehearsalDrafts = { connect?: ConnectDraft; scene?: SceneDraft; scenario?: ScenarioDraft; cleanup?: boolean };
const open = (flow: AnyStewardFlow) => () => { stewardDock.open(flow); };

export function RehearsalConnectionCard({ model, state, draft }: { model: RehearsalModel; state: RehearsalState; draft?: ConnectDraft }) {
  return <section className="cc-panel rh-panel" data-drafting={draft ? 'true' : undefined} aria-label={copy.connection}>
    <div className="cc-panel__head"><h2 className="cc-panel__title">{copy.connection}</h2>
      <span className="cc-stamp cc-stamp--waiting cc-stamp--inked">{copy[state.obs]}</span></div>
    <div className="cc-panel__body">
      <form className="rehearsal-fields" autoComplete="off" onSubmit={event => {
        event.preventDefault();
        void submitForm(event.currentTarget, model);
      }}>
        <label className="cc-field">{copy.host}<input className="cc-input" name="host" defaultValue="127.0.0.1" required disabled={state.busy} /></label>
        <label className="cc-field">{copy.port}<input className="cc-input" name="port" type="number" min="1" max="65535" defaultValue="4455" required disabled={state.busy} /></label>
        <label className="cc-field rh-secret" data-wanted={draft?.secret === 'yes' ? 'true' : undefined}>{copy.password}
          <input className="cc-input" name="password" type="password" autoComplete="off" aria-describedby="rehearsal-password-help" disabled={state.busy} /></label>
        <label className="cc-choice rehearsal-remember"><input name="remember" type="checkbox" defaultChecked={false} disabled={state.busy} />{copy.remember}</label>
        <p className="cc-gloss-note" id="rehearsal-password-help">{copy.password_help} Typed here only; the Steward never sees it.</p>
        <button className="cc-btn cc-btn--chamber" type="submit" disabled={state.busy}>{copy.connect}</button>
      </form>
      <p className="rh-notice" role="status" aria-live="polite">{state.connection_notice}</p>
    </div>
  </section>;
}

export function RehearsalOutputRow({ row, state, model }: { row: RehearsalRow; state: RehearsalState; model: RehearsalModel }) {
  return <article className="cc-sheet rehearsal-output" data-phase={row.phase} aria-label={row.name}>
    <header><h3>{row.name}</h3><span className={`cc-stamp cc-stamp--inked ${row.phase === 'added' ? 'cc-stamp--ok' : row.phase === 'idle' ? 'cc-stamp--local' : 'cc-stamp--blocked'}`}>{copy.phases[row.phase]}</span></header>
    <div className="rh-out-acts">
      <label className="cc-field">{copy.size}<select className="cc-select" aria-label={`${row.name} source size`} value={row.preset} disabled={state.busy}
        onChange={event => { model.setPreset(row.id, event.currentTarget.value); }}>
        {Object.entries(streamPresets).map(([id, size]) => <option key={id} value={id}>{id} · {size.width} × {size.height}</option>)}
      </select></label>
      <SealButton variant="proclaim" disabled={!model.canAdd(row.id)} on_seal={() => { void model.add(row.id); }} />
    </div>
    <p className="rh-notice" role="status" aria-live="polite">{row.notice}</p>
    {row.kind === 'lot' && row.draw_id && <p className="rh-notice">{copy.seal_lot} <a href="#/chamber/lottery">{copy.lot_chamber}</a></p>}
  </article>;
}

function ScenarioCard({ model, state }: { model: RehearsalModel; state: RehearsalState }) {
  const disabled = state.busy || !state.status?.active;
  return <section className="cc-panel rh-panel" aria-label={copy.scenarios}>
    <div className="cc-panel__head"><h2 className="cc-panel__title">{copy.scenarios}</h2><span className="cc-sim">{state.status?.active ? 'Session active' : 'Session stopped'}</span></div>
    <div className="cc-panel__body">
      <p className="cc-gloss-note">{state.status?.active ? copy.active : copy.stopped}</p>
      <div className="rehearsal-actions">
        <button className="cc-btn cc-btn--sm" type="button" disabled={disabled} onClick={() => { void model.scenario('lots_fill'); }}>{copy.lot}</button>
        <button className="cc-btn cc-btn--sm" type="button" disabled={disabled} onClick={() => { void model.scenario('vote_round'); }}>{copy.vote}</button>
        <button className="cc-btn cc-btn--sm" type="button" disabled={disabled} onClick={() => { void model.scenario('duel_round'); }}>{copy.duel}</button>
      </div>
      <div className="rh-beacon">
        <label className="cc-field">{copy.visual}<select className="cc-select" value={state.visual_id} disabled={disabled || !state.visuals.length}
          onChange={event => { model.setVisual(event.currentTarget.value); }}>
          {!state.visuals.length && <option value="">{copy.no_visual}</option>}
          {state.visuals.map(visual => <option key={visual.visual_id} value={visual.visual_id}>{visual.name}</option>)}
        </select></label>
        <button className="cc-btn cc-btn--sm" type="button" disabled={disabled || !state.visual_id} onClick={() => { void model.scenario('beacon_fire'); }}>{copy.beacon}</button>
      </div>
      {!state.visuals.length && <a className="cc-link" href="#/chamber/visuals">{copy.beacons}</a>}
      <label className="rh-crowd">{copy.crowd} <output>{state.crowd}</output><input type="range" min="0" max="600" step="1" value={state.crowd}
        disabled={disabled} onChange={event => { model.setCrowd(Number(event.currentTarget.value)); }} /></label>
      <p className="rh-notice" role="status" aria-live="polite">{state.scenario_notice}</p>
      {state.status && <time className="rh-notice" dateTime={state.status.at}>Status at {state.status.at}</time>}
    </div>
  </section>;
}

type Station = { no: string; key: string; label: string; value: string; line: string; lit: boolean; drafting: boolean; action: string; flow: AnyStewardFlow };

/** The status picture: five stations of the rehearsal, lit as each is ready, marked while the Steward drafts one. */
export function RehearsalBoard({ state, ready, drafts = {} }: { state: RehearsalState; ready: boolean; drafts?: RehearsalDrafts }) {
  const added = state.rows.filter(row => row.phase === 'added');
  const planned = drafts.scene ? pickedRows(state, drafts.scene.pick) : [];
  const stations: Station[] = [
    { no: 'I', key: 'obs', label: 'OBS', value: !ready ? 'Your own' : state.obs === 'connected' ? 'Connected' : state.obs === 'disconnected' ? 'Not connected' : 'Unknown',
      line: drafts.connect ? `Draft · ${connectAddress(drafts.connect)}` : state.connection_notice || 'Your own OBS, over its WebSocket', lit: ready && state.obs === 'connected',
      drafting: Boolean(drafts.connect), action: 'Connect my OBS', flow: connectFlow },
    { no: 'II', key: 'scene', label: 'Scene', value: !ready ? 'Its own' : state.scene_ready ? 'Ready' : 'Not set up',
      line: copy.scene_name, lit: ready && state.scene_ready, drafting: Boolean(drafts.scene), action: 'Set up the scene', flow: sceneFlow },
    { no: 'III', key: 'sources', label: 'Sources', value: !ready ? 'Four kinds' : `${added.length} of ${state.rows.length}`,
      line: drafts.scene ? `Draft · ${planned.length ? planned.map(row => row.name).join(', ') : 'choosing'}` : added.length ? added.map(row => row.name).join(', ') : ready ? 'None added yet' : 'Lot plate, vote bar, beacons, duel',
      lit: added.length > 0, drafting: Boolean(drafts.scene), action: 'Add sources', flow: sceneFlow },
    { no: 'IV', key: 'crowd', label: 'Crowd', value: !ready ? '0 to 600' : `${drafts.scenario?.crowd ?? state.crowd}`,
      line: drafts.scenario ? 'Draft · SIMULATED chat a minute' : 'SIMULATED chat a minute', lit: ready && state.crowd > 0,
      drafting: drafts.scenario?.scenario === 'crowd', action: 'Run a scenario', flow: scenarioFlow },
    { no: 'V', key: 'session', label: 'Session', value: !ready ? 'Simulated' : state.status?.active ? 'Active' : 'Stopped',
      line: 'Generated chat · no real viewer', lit: ready && state.status?.active === true, drafting: Boolean(drafts.cleanup), action: 'Clean up', flow: cleanupFlow },
  ];
  return <section className="cc-folio rh-board" data-ready={ready ? 'true' : 'false'} aria-label="Rehearsal status">
    <div className="rh-board__head"><h2 className="cc-rubric">{ready ? 'The rehearsal, step by step' : 'What the rehearsal will set up'}</h2><div className="cc-orn" aria-hidden="true"><i /></div>
      <span className="cc-sim">Simulated</span></div>
    <ol className="rh-stations">{stations.map(station => <li key={station.key} className="rh-station" data-station={station.key}
      data-lit={station.lit ? 'true' : 'false'} data-drafting={station.drafting ? 'true' : undefined}>
      <span className="rh-station__no" aria-hidden="true">{station.no}</span>
      <i className="cc-lozenge" data-lit={station.lit ? 'true' : 'false'} aria-hidden="true" />
      <span className="rh-station__label">{station.label}</span>
      <b className="rh-station__value">{station.value}</b>
      <span className="rh-station__line">{station.line}</span>
      {station.drafting && <span className="cc-stamp cc-stamp--draft">Draft</span>}
      <button className="cc-btn cc-btn--sm cc-btn--quiet" type="button" onClick={open(station.flow)}>{station.action}</button>
    </li>)}</ol>
  </section>;
}

export function RehearsalContent({ model, state, mode, on_back, drafts }: {
  model: RehearsalModel; state: RehearsalState; mode: 'fixture' | 'core'; on_back: () => void; drafts?: RehearsalDrafts;
}) {
  const inside = state.phase === 'inside';
  return <section className="rehearsal-workspace" aria-label={copy.title}>
    <SurfaceHead className="rehearsal-heading" title={copy.title} versal on_back={on_back}
      subtitle="Your own OBS, the real core, generated chat." mark={inside ? <Stamp kind="simulated" word={copy.simulated} /> : <span className="cc-sim">Simulated</span>}
      actions={<button className="cc-btn cc-btn--chamber" type="button" disabled={!model.shell_available || state.busy || state.phase === 'checking'}
        onClick={() => { void model.switchMode(); }}>{inside ? copy.leave : copy.start}</button>} />
    <div className="rh-body">
      <p className="rh-intro">{inside ? 'Inside dress rehearsal: a separate local workspace, generated SIMULATED chat, no Twitch login. Casting a Lot fetches a public drand round.' : copy.introduction}</p>
      {!model.shell_available && <Notice message={mode === 'fixture' ? copy.desktop : copy.shell_unavailable} />}
      {state.notice && <p className="rh-notice" role="status" aria-live="polite">{state.notice}</p>}
      <RehearsalBoard state={state} ready={inside} {...(drafts ? { drafts } : {})} />
      {inside && <div className="rh-desk">
        <div className="rh-col">
          <RehearsalConnectionCard model={model} state={state} {...(drafts?.connect ? { draft: drafts.connect } : {})} />
          <section className="cc-panel rh-panel" aria-label={copy.scene}>
            <div className="cc-panel__head"><h2 className="cc-panel__title">{copy.scene}</h2>
              <span className="cc-stamp cc-stamp--inked cc-stamp--local">{state.scene_ready ? 'Ready' : 'Not set up'}</span></div>
            <div className="cc-panel__body">
              <p className="rh-scene-name">{copy.scene_name}</p>
              <div className="rehearsal-actions">
                <button className="cc-btn cc-btn--sm" type="button" disabled={state.busy || state.obs !== 'connected'} onClick={() => { void model.ensureScene(); }}>{copy.ensure}</button>
                <button className="cc-btn cc-btn--sm cc-btn--quiet" type="button" disabled={state.busy} onClick={() => { void model.refresh(); }}>{copy.refresh}</button>
              </div>
              <p className="rh-notice" role="status" aria-live="polite">{state.scene_notice}</p>
              <h3 className="rh-sub">{copy.clear}</h3><p className="cc-gloss-note">{copy.clear_help}</p>
              <div role="group" aria-label={copy.clear}><SealButton disabled={state.busy || state.obs !== 'connected'} on_seal={() => { void model.clear(); }} /></div>
            </div>
          </section>
        </div>
        <div className="rh-col">
          <section className="cc-folio rh-outputs" aria-label={copy.outputs}>
            <div className="rh-board__head"><h2 className="cc-rubric">{copy.outputs}</h2><div className="cc-orn" aria-hidden="true"><i /></div></div>
            <WindowedRows rows={state.rows} row_key={row => row.id} label={copy.outputs} row_height={Number.parseFloat(tokens.layout['row-h']) * 7}>
              {row => <RehearsalOutputRow row={row} state={state} model={model} />}
            </WindowedRows>
          </section>
          <ScenarioCard model={model} state={state} />
        </div>
      </div>}
    </div>
  </section>;
}

export default function Rehearsal({ mode, connection, on_back }: {
  mode: 'fixture' | 'core'; connection?: RehearsalConnection; on_back: () => void;
}) {
  const model = useMemo(() => {
    const shell = rehearsalShell(mode);
    return createRehearsalModel({ mode, ...(connection ? { connection } : {}), ...(shell ? { shell } : {}) });
  }, [mode, connection]);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const root = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState('');
  useEffect(() => model.start(), [model]);
  const form = () => root.current?.querySelector<HTMLFormElement>('.rehearsal-fields') ?? null;
  useEffect(() => attachRehearsal({
    model,
    async connect({ host, port, remember }) {
      const node = form();
      if (!node) return false;
      const set = (name: string, value: string) => { const input = node.querySelector<HTMLInputElement>(`[name="${name}"]`); if (input) input.value = value; };
      set('host', host); set('port', String(port));
      const box = node.querySelector<HTMLInputElement>('[name="remember"]'); if (box) box.checked = remember;
      setExtra('');
      await submitForm(node, model);
      return true;
    },
    hasPassword: () => (form()?.querySelector<HTMLInputElement>('[name="password"]')?.value.length ?? 0) > 0,
    notify: setExtra,
  }), [model]);
  const connect = useFlowDraft(connectFlow);
  const scene = useFlowDraft(sceneFlow);
  const scenario = useFlowDraft(scenarioFlow);
  const cleanup = useFlowDraft(cleanupFlow);
  // The Steward's draft address shows in the page form as it is chosen; the password field is never written.
  useEffect(() => {
    const node = form();
    if (!node || !connect) return;
    const host = node.querySelector<HTMLInputElement>('[name="host"]'); const port = node.querySelector<HTMLInputElement>('[name="port"]');
    if (host && connect.host) host.value = connect.host;
    if (port && connect.port) port.value = String(connect.port);
  }, [connect]);
  const drafts: RehearsalDrafts = { ...(connect ? { connect } : {}), ...(scene ? { scene } : {}), ...(scenario ? { scenario } : {}), ...(cleanup ? { cleanup: true } : {}) };
  return <div ref={root} className="rehearsal-root">
    <RehearsalContent model={model} state={extra ? { ...state, connection_notice: extra } : state} mode={mode} on_back={on_back} drafts={drafts} />
  </div>;
}
