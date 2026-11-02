import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
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
import { placeSecret, SecretField, wantsSecret } from './secret-slot.jsx';
import { cleanupFlow, connectAddress, connectFlow, pickedRows, scenarioFlow, sceneFlow } from './steward-flows.js';
import type { ConnectDraft, ScenarioDraft, SceneDraft } from './steward-flows.js';
import './rehearsal.css';
import '@castle-control/ui/fused/surface.css';
import '../stream/setup-deck.css';

/** The masked field is uncontrolled, cleared before any asynchronous work, and never a read-model field. */
export function submitConnection(fields: { host: string; port: string; password: { value: string }; remember: boolean }, model: RehearsalModel) {
  const params = { host: fields.host, port: Number(fields.port), password: fields.password.value, remember: fields.remember };
  fields.password.value = '';
  return model.connect(params);
}

/** Submit the page's connection form: the one path both the direct button and the Steward's seal take.
 *  The masked field is the form's own input, or the page's same input while it stands in the Steward's step. */
export function submitForm(form: HTMLFormElement, model: RehearsalModel, secret?: HTMLInputElement | null) {
  const password = form.querySelector<HTMLInputElement>('[name="password"]') ?? secret ?? null;
  const host = form.querySelector<HTMLInputElement>('[name="host"]');
  const port = form.querySelector<HTMLInputElement>('[name="port"]');
  const remember = form.querySelector<HTMLInputElement>('[name="remember"]');
  if (!password || !host || !port || !remember) return undefined;
  return submitConnection({ host: host.value, port: port.value, password, remember: remember.checked }, model);
}

export type RehearsalDrafts = { connect?: ConnectDraft; scene?: SceneDraft; scenario?: ScenarioDraft; cleanup?: boolean };
const open = (flow: AnyStewardFlow) => () => { stewardDock.open(flow); };

export function RehearsalConnectionCard({ model, state, draft, secret_home, secret }: {
  model: RehearsalModel; state: RehearsalState; draft?: ConnectDraft;
  /** The page's own field host lands here when the Steward is not waiting for it. Without it the field renders inline. */
  secret_home?: (node: HTMLDivElement | null) => void; secret?: () => HTMLInputElement | null;
}) {
  return <section className="setup-card rh-panel" data-drafting={draft ? 'true' : undefined} aria-label={copy.connection}>
    <div className="setup-card__head"><h2 className="setup-kicker">{copy.connection}</h2>
      <span className="setup-tag" data-tone={state.obs === 'connected' ? 'ok' : 'warn'}>{copy[state.obs]}</span></div>
    <div className="rh-panel__body">
      <form className="rehearsal-fields" autoComplete="off" onSubmit={event => {
        event.preventDefault();
        void submitForm(event.currentTarget, model, secret?.());
      }}>
        <label className="cc-field">{copy.host}<input className="cc-input" name="host" defaultValue="127.0.0.1" required disabled={state.busy} /></label>
        <label className="cc-field">{copy.port}<input className="cc-input" name="port" type="number" min="1" max="65535" defaultValue="4455" required disabled={state.busy} /></label>
        {secret_home ? <div className="rh-secret-home" ref={secret_home} data-wanted={wantsSecret(draft) ? 'true' : undefined} /> : <SecretField disabled={state.busy} />}
        <label className="cc-choice rehearsal-remember"><input name="remember" type="checkbox" defaultChecked={false} disabled={state.busy} />{copy.remember}</label>
        <button className="cc-btn setup-btn--primary" type="submit" disabled={state.busy}>{copy.connect}</button>
      </form>
      <p className="rh-notice" role="status" aria-live="polite">{state.connection_notice}</p>
    </div>
  </section>;
}

export function RehearsalOutputRow({ row, state, model }: { row: RehearsalRow; state: RehearsalState; model: RehearsalModel }) {
  return <article className="rehearsal-output" data-phase={row.phase} aria-label={row.name}>
    <header><h3>{row.name}</h3><span className="setup-tag" data-tone={row.phase === 'added' ? 'ok' : undefined}>{copy.phases[row.phase]}</span></header>
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
  return <section className="setup-card rh-panel" aria-label={copy.scenarios}>
    <div className="setup-card__head"><h2 className="setup-kicker">{copy.scenarios}</h2><span className="setup-tag" data-tone={state.status?.active ? 'ok' : undefined}>{state.status?.active ? 'Session active' : 'Session stopped'}</span></div>
    <div className="rh-panel__body">
      <p className="setup-note">{state.status?.active ? copy.active : copy.stopped}</p>
      <div className="rehearsal-actions">
        <button className="cc-btn" type="button" disabled={disabled} onClick={() => { void model.scenario('lots_fill'); }}>{copy.lot}</button>
        <button className="cc-btn" type="button" disabled={disabled} onClick={() => { void model.scenario('vote_round'); }}>{copy.vote}</button>
        <button className="cc-btn" type="button" disabled={disabled} onClick={() => { void model.scenario('duel_round'); }}>{copy.duel}</button>
      </div>
      <div className="rh-beacon">
        <label className="cc-field">{copy.visual}<select className="cc-select" value={state.visual_id} disabled={disabled || !state.visuals.length}
          onChange={event => { model.setVisual(event.currentTarget.value); }}>
          {!state.visuals.length && <option value="">{copy.no_visual}</option>}
          {state.visuals.map(visual => <option key={visual.visual_id} value={visual.visual_id}>{visual.name}</option>)}
        </select></label>
        <button className="cc-btn" type="button" disabled={disabled || !state.visual_id} onClick={() => { void model.scenario('beacon_fire'); }}>{copy.beacon}</button>
      </div>
      {!state.visuals.length && <a className="cc-link" href="#/chamber/visuals">{copy.beacons}</a>}
    </div>
  </section>;
}

/** The few direct controls a streamer reaches for mid-rehearsal: the crowd level and what just happened. */
export function RehearsalLive({ model, state }: { model: RehearsalModel; state: RehearsalState }) {
  const disabled = state.busy || !state.status?.active;
  return <section className="setup-card setup-scroll rh-live" aria-label="Live rehearsal controls"><div className="rh-live__row">
    <label className="rh-crowd">{copy.crowd} <output>{state.crowd}</output><input type="range" min="0" max="600" step="1" value={state.crowd}
      disabled={disabled} onChange={event => { model.setCrowd(Number(event.currentTarget.value)); }} aria-label={copy.crowd} /></label>
    <dl className="rh-live__facts">
      <div><dt>OBS</dt><dd>{copy[state.obs]}</dd></div>
      <div><dt>Scene</dt><dd>{state.scene_ready ? copy.scene_name : 'Not set up'}</dd></div>
      <div><dt>Session</dt><dd>{state.status?.active ? 'Active' : 'Stopped'}</dd></div>
    </dl>
    <div className="rh-live__notes">
      <p className="rh-notice" role="status" aria-live="polite">{state.scenario_notice}</p>
      {state.status && <time className="rh-notice" dateTime={state.status.at}>Status at {localTime(state.status.at)}</time>}
    </div>
  </div></section>;
}

/** One small stained-glass lancet per step (decorative): the pane in the room's glass, a quiet charge leaded in. */
const charges: Record<string, string> = {
  obs: 'M13 27h14v10H13Z M20 37v4',
  scene: 'M14 41V31a6 6 0 0 1 12 0v10',
  sources: 'M13 27h14 M13 32h14 M13 37h14',
  crowd: 'M15 31a2 2 0 1 0 0.1 0 M20 29a2 2 0 1 0 0.1 0 M25 31a2 2 0 1 0 0.1 0 M12 40c1-4 15-4 16 0',
  session: 'M14 26h12 M14 42h12 M15 26c0 6 10 6 10 8s-10 2-10 8 M25 26c0 6-10 6-10 8s10 2 10 8',
};
function StationGlyph({ station }: { station: string }) {
  return <svg className="rh-station__glyph" viewBox="0 0 40 52" aria-hidden="true" focusable="false">
    <path className="rh-pane" d="M4 50V20a16 16 0 0 1 32 0v30Z" />
    <path className="rh-pane-hi" d="M8 46V21a12 12 0 0 1 8-11.3" />
    <path className="rh-pane-charge" d={charges[station] ?? ''} />
  </svg>;
}

/** The outputs at a glance, read-only: what the rehearsal scene holds right now. The rows to act on wait under More. */
export function RehearsalGlance({ state }: { state: RehearsalState }) {
  const added = state.rows.filter(row => row.phase === 'added').length;
  return <section className="setup-card setup-scroll rh-glance" aria-label="Outputs at a glance">
    <div className="setup-card__head"><h2 className="setup-kicker">Outputs at a glance</h2><span className="setup-tag" data-tone={added ? 'ok' : undefined}>{added} of {state.rows.length} added</span></div>
    {state.rows.length ? <ul className="rh-glance__list setup-scroll">{state.rows.map(row => <li key={row.id} data-phase={row.phase}>
      <span className="rh-glance__name">{row.name}</span><span className="rh-glance__size">{row.preset}</span>
      <span className="setup-tag" data-tone={row.phase === 'added' ? 'ok' : undefined}>{copy.phases[row.phase]}</span>
      {row.notice && <span className="rh-glance__note">{row.notice}</span>}
    </li>)}</ul> : <p className="setup-note">No rehearsal outputs yet.</p>}
  </section>;
}

/** The core's ISO instant shown as local wall time ("18:55"); the machine value stays in dateTime. */
export function localTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

type Station = { no: string; key: string; label: string; value: string; line: string; lit: boolean; drafting: boolean; action: string; flow: AnyStewardFlow };

/** The status picture: five stations of the rehearsal, lit as each is ready, marked while the Steward drafts one. */
export function RehearsalBoard({ state, ready, drafts = {} }: { state: RehearsalState; ready: boolean; drafts?: RehearsalDrafts }) {
  const added = state.rows.filter(row => row.phase === 'added');
  const planned = drafts.scene ? pickedRows(state, drafts.scene.pick) : [];
  const stations: Station[] = [
    { no: '1', key: 'obs', label: 'OBS', value: !ready ? 'Your own' : state.obs === 'connected' ? 'Connected' : state.obs === 'disconnected' ? 'Not connected' : 'Unknown',
      line: drafts.connect ? `Draft · ${connectAddress(drafts.connect)}` : state.connection_notice || 'Your own OBS, over its WebSocket', lit: ready && state.obs === 'connected',
      drafting: Boolean(drafts.connect), action: 'Connect my OBS', flow: connectFlow },
    { no: '2', key: 'scene', label: 'Scene', value: !ready ? 'Its own' : state.scene_ready ? 'Ready' : 'Not set up',
      line: copy.scene_name, lit: ready && state.scene_ready, drafting: Boolean(drafts.scene), action: 'Set up the scene', flow: sceneFlow },
    { no: '3', key: 'sources', label: 'Sources', value: !ready ? 'Four kinds' : `${added.length} of ${state.rows.length}`,
      line: drafts.scene ? `Draft · ${planned.length ? planned.map(row => row.name).join(', ') : 'choosing'}` : added.length ? added.map(row => row.name).join(', ') : ready ? 'None added yet' : 'Lot plate, vote bar, beacons, duel',
      lit: added.length > 0, drafting: Boolean(drafts.scene), action: 'Add sources', flow: sceneFlow },
    { no: '4', key: 'crowd', label: 'Crowd', value: !ready ? '0 to 600' : `${drafts.scenario?.crowd ?? state.crowd}`,
      line: drafts.scenario ? 'Draft · SIMULATED chat a minute' : 'SIMULATED chat a minute', lit: ready && state.crowd > 0,
      drafting: drafts.scenario?.scenario === 'crowd', action: 'Run a scenario', flow: scenarioFlow },
    { no: '5', key: 'session', label: 'Session', value: !ready ? 'Simulated' : state.status?.active ? 'Active' : 'Stopped',
      line: 'Generated chat · no real viewer', lit: ready && state.status?.active === true, drafting: Boolean(drafts.cleanup), action: 'Clean up', flow: cleanupFlow },
  ];
  return <section className="setup-card rh-board" data-ready={ready ? 'true' : 'false'} aria-label="Rehearsal status">
    <div className="setup-card__head"><h2 className="setup-kicker">{ready ? 'The rehearsal, step by step' : 'What the rehearsal will set up'}</h2></div>
    <ol className="rh-stations">{stations.map(station => <li key={station.key} className="rh-station" data-station={station.key}
      data-lit={station.lit ? 'true' : 'false'} data-drafting={station.drafting ? 'true' : undefined}>
      <span className="rh-station__mark" aria-hidden="true"><span className="rh-station__no">{station.no}</span><StationGlyph station={station.key} /></span>
      <i className="cc-lozenge" data-lit={station.lit ? 'true' : 'false'} aria-hidden="true" />
      <span className="rh-station__label">{station.label}</span>
      <b className="rh-station__value">{station.value}</b>
      <span className="rh-station__line">{station.line}</span>
      {station.drafting && <span className="cc-stamp cc-stamp--draft">Draft</span>}
      <button className="cc-btn" type="button" onClick={open(station.flow)}>{station.action}</button>
    </li>)}</ol>
  </section>;
}

type SecretSlot = { home: (node: HTMLDivElement | null) => void; input: () => HTMLInputElement | null };

export function RehearsalContent({ model, state, mode, on_back, drafts, secret }: {
  model: RehearsalModel; state: RehearsalState; mode: 'fixture' | 'core'; on_back: () => void; drafts?: RehearsalDrafts; secret?: SecretSlot;
}) {
  const inside = state.phase === 'inside';
  return <section className="rehearsal-workspace" aria-label={copy.title}>
    <SurfaceHead className="rehearsal-heading" title={copy.title} on_back={on_back}
      subtitle="Your own OBS, the real core, generated chat." mark={inside ? <Stamp kind="simulated" word={copy.simulated} /> : <span className="cc-sim">Simulated</span>}
      actions={<button className="cc-btn setup-btn--primary" type="button" disabled={!model.shell_available || state.busy || state.phase === 'checking'}
        onClick={() => { void model.switchMode(); }}>{inside ? copy.leave : copy.start}</button>} />
    <div className="rh-body">
      <p className="rh-intro">{inside ? 'Inside dress rehearsal: a separate local workspace, generated SIMULATED chat, no Twitch login. Casting a Lot fetches a public drand round.' : copy.introduction}</p>
      {!model.shell_available && <Notice message={mode === 'fixture' ? copy.desktop : copy.shell_unavailable} />}
      {state.notice && <p className="rh-notice" role="status" aria-live="polite">{state.notice}</p>}
      <RehearsalBoard state={state} ready={inside} {...(drafts ? { drafts } : {})} />
      {inside && <div className="rh-inside">
        <RehearsalLive model={model} state={state} />
        <RehearsalGlance state={state} />
      </div>}
      {/* The forms behind the Steward's flows stay mounted (the masked field's home lives here), folded under More. */}
      {inside && <details className="rh-more">
        <summary className="rh-more__summary">More <span>connection, scene, sources and scenario forms: the same steps the Steward walks</span></summary>
        <div className="rh-desk">
        <div className="rh-col">
          <RehearsalConnectionCard model={model} state={state} {...(drafts?.connect ? { draft: drafts.connect } : {})}
            {...(secret ? { secret_home: secret.home, secret: secret.input } : {})} />
          <section className="setup-card rh-panel" aria-label={copy.scene}>
            <div className="setup-card__head"><h2 className="setup-kicker">{copy.scene}</h2>
              <span className="setup-tag" data-tone={state.scene_ready ? 'ok' : undefined}>{state.scene_ready ? 'Ready' : 'Not set up'}</span></div>
            <div className="rh-panel__body">
              <p className="rh-scene-name">{copy.scene_name}</p>
              <div className="rehearsal-actions">
                <button className="cc-btn" type="button" disabled={state.busy || state.obs !== 'connected'} onClick={() => { void model.ensureScene(); }}>{copy.ensure}</button>
                <button className="cc-btn cc-btn--quiet" type="button" disabled={state.busy} onClick={() => { void model.refresh(); }}>{copy.refresh}</button>
              </div>
              <p className="rh-notice" role="status" aria-live="polite">{state.scene_notice}</p>
              <h3 className="rh-sub">{copy.clear}</h3><p className="setup-note">{copy.clear_help}</p>
              <div role="group" aria-label={copy.clear}><SealButton disabled={state.busy || state.obs !== 'connected'} on_seal={() => { void model.clear(); }} /></div>
            </div>
          </section>
        </div>
        <div className="rh-col">
          <section className="setup-card rh-outputs" aria-label={copy.outputs}>
            <div className="setup-card__head"><h2 className="setup-kicker">{copy.outputs}</h2></div>
            <WindowedRows rows={state.rows} row_key={row => row.id} label={copy.outputs} row_height={Number.parseFloat(tokens.layout['row-h']) * 5.5}
              empty_state={<p className="setup-note rh-empty">No rehearsal outputs yet.</p>}>
              {row => <RehearsalOutputRow row={row} state={state} model={model} />}
            </WindowedRows>
          </section>
          <ScenarioCard model={model} state={state} />
        </div>
      </div>
      </details>}
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
  // One host for the masked field for the page's whole life: moving it never remounts the input.
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const field = useRef<HTMLInputElement | null>(null);
  const home = useRef<HTMLDivElement | null>(null);
  const wanted = useRef(false);
  // A field with nowhere visible to stand (no hold card, no page form) never keeps what was typed.
  const place = () => { if (host && placeSecret(host, home.current, document, wanted.current) === 'none' && field.current) field.current.value = ''; };
  const [slot] = useState<SecretSlot>(() => ({ home: node => { home.current = node; place(); }, input: () => field.current }));
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
      await submitForm(node, model, field.current);
      return true;
    },
    hasPassword: () => (field.current?.value.length ?? 0) > 0,
    forget: () => { if (field.current) field.current.value = ''; },
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
  // While the connect flow wants a password, the field stands in the Steward's active hold card;
  // the dock re-renders its steps freely, so every DOM change re-checks the placement.
  const wants = wantsSecret(connect);
  useEffect(() => {
    wanted.current = wants;
    if (!host || typeof MutationObserver === 'undefined') return;
    place();
    const watch = new MutationObserver(place);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => { watch.disconnect(); };
  });
  useEffect(() => () => { host?.remove(); }, [host]);
  const drafts: RehearsalDrafts = { ...(connect ? { connect } : {}), ...(scene ? { scene } : {}), ...(scenario ? { scenario } : {}), ...(cleanup ? { cleanup: true } : {}) };
  return <div ref={root} className="rehearsal-root">
    <RehearsalContent model={model} state={extra ? { ...state, connection_notice: extra } : state} mode={mode} on_back={on_back} drafts={drafts} secret={slot} />
    {host && createPortal(<SecretField disabled={state.busy} input_ref={node => { field.current = node; }} />, host)}
  </div>;
}
