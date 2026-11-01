import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HeraldicCard, InkButton, Notice, SealButton, Stamp, StatusChip, WindowedRows } from '@castle-control/ui';
import { tokens } from '@castle-control/tokens';
import { streamPresets } from '../stream/setup-model.js';
import { createRehearsalModel } from './rehearsal-model.js';
import type { RehearsalModel, RehearsalRow, RehearsalState } from './rehearsal-model.js';
import type { RehearsalConnection } from './rehearsal-core.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';
import { rehearsalShell } from './rehearsal-shell.js';
import './rehearsal.css';

/** The masked field is uncontrolled, cleared before any asynchronous work, and never a read-model field. */
export function submitConnection(fields: { host: string; port: string; password: { value: string }; remember: boolean }, model: RehearsalModel) {
  const params = { host: fields.host, port: Number(fields.port), password: fields.password.value, remember: fields.remember };
  fields.password.value = '';
  return model.connect(params);
}

export function RehearsalConnectionCard({ model, state }: { model: RehearsalModel; state: RehearsalState }) {
  return <HeraldicCard variant="raised" aria-label={copy.connection}>
    <h2>{copy.connection}</h2>
    <StatusChip variant="dash">{copy[state.obs]}</StatusChip>
    <form className="rehearsal-fields" autoComplete="off" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = form.querySelector<HTMLInputElement>('[name="password"]');
      const host = form.querySelector<HTMLInputElement>('[name="host"]');
      const port = form.querySelector<HTMLInputElement>('[name="port"]');
      const remember = form.querySelector<HTMLInputElement>('[name="remember"]');
      if (password && host && port && remember) void submitConnection({ host: host.value, port: port.value, password, remember: remember.checked }, model);
    }}>
      <label>{copy.host}<input name="host" defaultValue="127.0.0.1" required disabled={state.busy} /></label>
      <label>{copy.port}<input name="port" type="number" min="1" max="65535" defaultValue="4455" required disabled={state.busy} /></label>
      <label>{copy.password}<input name="password" type="password" autoComplete="off" aria-describedby="rehearsal-password-help" disabled={state.busy} /></label>
      <label className="rehearsal-remember"><input name="remember" type="checkbox" defaultChecked={false} disabled={state.busy} />{copy.remember}</label>
      <p id="rehearsal-password-help">{copy.password_help}</p>
      <InkButton type="submit" disabled={state.busy}>{copy.connect}</InkButton>
    </form>
    <p role="status" aria-live="polite">{state.connection_notice}</p>
  </HeraldicCard>;
}

export function RehearsalOutputRow({ row, state, model }: { row: RehearsalRow; state: RehearsalState; model: RehearsalModel }) {
  return <HeraldicCard className="rehearsal-output" variant="raised" aria-label={row.name}>
    <header><h3>{row.name}</h3><StatusChip variant="dash">{copy.phases[row.phase]}</StatusChip></header>
    <label>{copy.size}<select aria-label={`${row.name} source size`} value={row.preset} disabled={state.busy}
      onChange={event => { model.setPreset(row.id, event.currentTarget.value); }}>
      {Object.entries(streamPresets).map(([id, size]) => <option key={id} value={id}>{id} · {size.width} × {size.height}</option>)}
    </select></label>
    <SealButton variant="proclaim" disabled={!model.canAdd(row.id)} on_seal={() => { void model.add(row.id); }} />
    <p role="status" aria-live="polite">{row.notice}</p>
    {row.kind === 'lot' && row.draw_id && <p>{copy.seal_lot} <a href="#/chamber/lottery">{copy.lot_chamber}</a></p>}
  </HeraldicCard>;
}

function ScenarioCard({ model, state }: { model: RehearsalModel; state: RehearsalState }) {
  const disabled = state.busy || !state.status?.active;
  return <HeraldicCard variant="raised" aria-label={copy.scenarios}>
    <h2>{copy.scenarios}</h2>
    <p>{state.status?.active ? copy.active : copy.stopped}</p>
    <div className="rehearsal-actions">
      <InkButton disabled={disabled} onClick={() => { void model.scenario('lots_fill'); }}>{copy.lot}</InkButton>
      <InkButton disabled={disabled} onClick={() => { void model.scenario('vote_round'); }}>{copy.vote}</InkButton>
      <InkButton disabled={disabled} onClick={() => { void model.scenario('duel_round'); }}>{copy.duel}</InkButton>
    </div>
    <label>{copy.visual}<select value={state.visual_id} disabled={disabled || !state.visuals.length}
      onChange={event => { model.setVisual(event.currentTarget.value); }}>
      {!state.visuals.length && <option value="">{copy.no_visual}</option>}
      {state.visuals.map(visual => <option key={visual.visual_id} value={visual.visual_id}>{visual.name}</option>)}
    </select></label>
    {!state.visuals.length && <a href="#/chamber/visuals">{copy.beacons}</a>}
    <InkButton disabled={disabled || !state.visual_id} onClick={() => { void model.scenario('beacon_fire'); }}>{copy.beacon}</InkButton>
    <label>{copy.crowd} <output>{state.crowd}</output><input type="range" min="0" max="600" step="1" value={state.crowd}
      disabled={disabled} onChange={event => { model.setCrowd(Number(event.currentTarget.value)); }} /></label>
    <p role="status" aria-live="polite">{state.scenario_notice}</p>
    {state.status && <time dateTime={state.status.at}>{state.status.at}</time>}
  </HeraldicCard>;
}

export function RehearsalContent({ model, state, mode, on_back }: {
  model: RehearsalModel; state: RehearsalState; mode: 'fixture' | 'core'; on_back: () => void;
}) {
  const inside = state.phase === 'inside';
  return <section className="rehearsal-workspace" aria-label={copy.title}>
    <header className="rehearsal-heading"><InkButton onClick={on_back}>{copy.back}</InkButton><h1>{copy.title}</h1>
      {inside && <Stamp kind="simulated" word={copy.simulated} />}
      <InkButton disabled={!model.shell_available || state.busy || state.phase === 'checking'}
        onClick={() => { void model.switchMode(); }}>{inside ? copy.leave : copy.start}</InkButton>
    </header>
    <p>{copy.introduction}</p>
    {!model.shell_available && <Notice message={mode === 'fixture' ? copy.desktop : copy.shell_unavailable} />}
    <p role="status" aria-live="polite">{state.notice}</p>
    {inside && <>
      <div className="rehearsal-columns"><RehearsalConnectionCard model={model} state={state} /><ScenarioCard model={model} state={state} /></div>
      <HeraldicCard variant="raised" aria-label={copy.scene}>
        <h2>{copy.scene}</h2><p>{copy.scene_name}</p>
        <div className="rehearsal-actions">
          <InkButton disabled={state.busy || state.obs !== 'connected'} onClick={() => { void model.ensureScene(); }}>{copy.ensure}</InkButton>
          <InkButton disabled={state.busy} onClick={() => { void model.refresh(); }}>{copy.refresh}</InkButton>
        </div>
        <p role="status" aria-live="polite">{state.scene_notice}</p>
        <h3>{copy.clear}</h3><p>{copy.clear_help}</p>
        <div role="group" aria-label={copy.clear}><SealButton disabled={state.busy || state.obs !== 'connected'} on_seal={() => { void model.clear(); }} /></div>
      </HeraldicCard>
      <WindowedRows rows={state.rows} row_key={row => row.id} label={copy.outputs} row_height={Number.parseFloat(tokens.layout['row-h']) * 9}>
        {row => <RehearsalOutputRow row={row} state={state} model={model} />}
      </WindowedRows>
    </>}
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
  useEffect(() => model.start(), [model]);
  return <RehearsalContent model={model} state={state} mode={mode} on_back={on_back} />;
}
