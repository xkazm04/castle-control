import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DesignId } from '@castle-control/contract';
import { SealButton, Stamp, WindowedRows } from '@castle-control/ui';
import { stewardDock, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { AnyStewardFlow } from '@castle-control/ui/steward-flow';
import { coreLotsConnection } from '../../client.js';
import { createCoreLotsPort, lotsRoundLabel } from '../../lots-core.js';
import type { CoreLotsPort } from '../../lots-core.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { Snapshot } from '../../model.js';
import { FairnessSteps, policyReason } from './print.jsx';
import { DrawStage } from './stage.jsx';
import type { StageCast } from './stage-model.js';
import { WeightEqualizer } from './equalizer.jsx';
import { WritLab } from './lab.jsx';
import type { LabSteer } from './lab.jsx';
import { UrnTierPreset } from './tier.jsx';
import { CoreDrawSetup } from './core-setup.jsx';
import { quicknet_anchor } from './beacon-anchors.js';
import { DrawAppearance } from './appearance.jsx';
import { coreStage } from './core-stage.js';
import { coreDraftDraw, coreFlows } from './flow-core.js';
import type { CoreSetupDraft } from './flow-core.js';
import { capFigure, contentLine, poolLabel } from './flow-model.js';
import { lotLive } from './live.js';
import { DrawCard, MoreTools, RollPanel, StagePanel } from './roll.jsx';
import { useSheetBand } from './chamber-hooks.js';
import { coreDemoFlow, isDemoClosing } from './flow-steps.js';
import { useDemoSandbox } from '../../demo-sandbox.jsx';

/** Play demo's sandbox: the fixture chamber, loaded only when the demo opens. */
const SandboxRoom = lazy(() => import('./index.jsx'));
import './room.css';
import './chamber.css';

/** Core mode authenticates real draws against the public quicknet key only, never a simulated chain. */
const core_anchors = [quicknet_anchor] as const;

function ProposalSealFrame({ seal_slot }: { seal_slot?: ReactNode }) {
  return seal_slot ? <section className="lottery-seal-frame" aria-label={copy.core.proposal_seal}>
    <h2 className="lottery-card-title">{copy.core.proposal_seal}</h2>
    {seal_slot}
  </section> : null;
}

type CoreFlows = ReturnType<typeof coreFlows>;
export function ConnectedLotsRoom({ port, simulated, seal_slot, flows, import_art }: { port: CoreLotsPort; simulated?: boolean; seal_slot?: ReactNode; flows?: CoreFlows;
  /** Import a library vessel preset as a core design (free); absent in tests without a Beacons connection. */
  import_art?: (library_id: string) => Promise<DesignId> }) {
  const [art_error, setArtError] = useState('');
  async function saveAppearance(draw_id: string) {
    const appearance = port.appearance(draw_id);
    const { art_preset, art_design } = appearance.getSnapshot();
    setArtError('');
    if (art_preset && !art_design) {
      if (!import_art) { setArtError(copy.core.vessel_art_failed); return; }
      try { appearance.edit({ art_design: await import_art(art_preset) }); }
      catch { setArtError(copy.core.vessel_art_failed); return; }
    }
    await port.saveDisplay();
  }
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const { display, reveal } = coreStage(port);
  const appearance = useSyncExternalStore(display.subscribe, display.getSnapshot, display.getSnapshot);
  // The core verified this cast against its seal and round before returning it.
  const cast = useMemo<StageCast | undefined>(() => state.cast_result
    ? { winners: state.cast_result.cast.winners, label: state.cast_result.cast.label } : undefined, [state.cast_result]);
  const [user, setUser] = useState('');
  const [prove, setProve] = useState(0);
  const [lab, setLab] = useState(false);
  useEffect(() => { if (!port.getSnapshot().locked) void port.load(); }, [port]);
  const draw = state.draw;
  const field_id = useId();
  const publication = useStewardDraft('lottery');
  const root = useRef<HTMLDivElement>(null);
  const band = useSheetBand(root, publication !== undefined);
  const phase = state.started ? 'cast' : state.sealed ? 'sealed' : 'open';
  const plan = state.seal_result?.sealed.roll.randomness;
  useEffect(() => {
    lotLive.publish({ mode: 'core', phase, draw, draws: state.draws, entries: state.entries.length, seal: state.seal_result?.sealed.seal,
      winners: state.cast_result?.cast.winners ?? [], writ: Boolean(state.writ),
      round: plan?.source === 'drand_quicknet' ? `drand quicknet round ${plan.round}` : undefined });
  }, [phase, draw, state.draws, state.entries.length, state.seal_result, state.cast_result, state.writ, plan]);
  const draft = publication?.flow === 'lots-setup' ? publication.draft as CoreSetupDraft : undefined;
  const prove_draft = publication?.flow === 'lots-prove' ? publication.draft as { tamper?: string } : undefined;
  useEffect(() => { if (prove_draft) setLab(true); }, [prove_draft]);
  const shown = draft ? coreDraftDraw(draft) ?? draw : draw;
  const [winner_draft, setWinnerDraft] = useState({ draw, value: String(draw?.rules.winner_count ?? '') });
  const winner_value = winner_draft.draw === draw ? winner_draft.value : String(draw?.rules.winner_count ?? '');
  if (winner_draft.draw !== draw) setWinnerDraft({ draw, value: winner_value });
  const winner_count = Number(winner_value);
  const invalid_winners = !winner_value.trim() || !Number.isInteger(winner_count) || winner_count < 1 || winner_count > 65535;
  const commitWinners = () => {
    if (draw && !state.busy && !state.locked && !invalid_winners && winner_count !== draw.rules.winner_count) {
      void port.edit({ ...draw, rules: { ...draw.rules, winner_count } });
    }
  };
  const round_label = lotsRoundLabel(simulated, state.seal_result);
  const open = (flow: AnyStewardFlow | undefined) => flow ? () => stewardDock.open(flow) : undefined;
  const empty_line = 'The Steward creates one on your core in a few small steps. Play demo shows a fair draw first, in a SIMULATED sandbox.';
  const status = draft ? 'Drafting in the Steward · nothing sealed' : !draw && !state.busy ? 'No draw on the core yet · the roll opens when you set one up' : phase === 'cast' ? `Cast · ${state.cast_result?.cast.winners.length ?? 0} winners`
    : phase === 'sealed' ? 'Sealed · waiting for the public round' : round_label;
  const tamper = prove_draft?.tamper;
  const steer: LabSteer | undefined = prove_draft ? { specimen: 'cast',
    tamper: tamper === 'weight' || tamper === 'winners' || tamper === 'forge' ? tamper : undefined } : undefined;
  const setup_open = open(flows?.setup as AnyStewardFlow | undefined);
  const cast_open = open(flows?.cast as AnyStewardFlow | undefined);
  return <div ref={root} className="lottery-room" role="region" aria-label={copy.core.title} aria-busy={state.busy} data-theatre={appearance.theatre}
    data-sheet={band === undefined ? undefined : 'up'} data-phase={draft ? 'draft' : phase}
    style={band === undefined ? undefined : { '--lot-band': `${band}px` } as CSSProperties}>
    <div className="cc-hall">
      <StagePanel title={copy.stage.titles[draft?.shape ?? appearance.shape]} count={state.entries.length} caption={copy.core.caption} draft={Boolean(draft)}>
        <DrawStage shape={draft?.shape ?? appearance.shape} on_shape={shape => display.edit({ shape })} entries={state.entries} cast={cast}
          content={draw?.policy.content ?? 'question'} sealed={state.sealed} seal={state.seal_result?.sealed.seal}
          clock={reveal} reveal_ms={appearance.reveal_ms} theatre={appearance.theatre} on_theatre={display.theatre} proof="core"
          sound={appearance.sound} on_sound={on => display.edit({ sound: on })} live={simulated === false}
          idle_label={!draw && !draft ? 'No draw yet · the urn fills once you set one up' : undefined}
          by_hand={appearance.by_hand} on_by_hand={on => display.edit({ by_hand: on })} focus_weight={appearance.focus_weight}
          {...(state.writ ? { on_prove: () => { display.theatre(false); setLab(true); setProve(count => count + 1); } } : {})} />
      </StagePanel>
      <div className="cc-desk">
        <RollPanel status={status} tone={draft ? 'draft' : state.check?.result === 'blocked' ? 'blocked' : phase} draft={Boolean(draft)}
          simulated={simulated === true}
          winners={shown?.rules.winner_count ?? '—'} winner_detail={draft ? copy.proposed : shown ? copy.selected_draw : 'no draw yet'}
          held_out="—" cap={shown ? capFigure(shown) : '—'}>
          <DrawCard name={shown?.name ?? (state.busy ? 'Reading your draws…' : 'No draw yet')}
            line={shown ? `${contentLine(shown)} · ${poolLabel[shown.rules.pool.kind].toLowerCase()}` : empty_line}
            guard={state.check?.result} guard_line={state.check?.reasons[0] ? policyReason(state.check.reasons[0]) : undefined}>
            {!draft && <>
              {phase === 'open' && <span className="lottery-draw-actions">
                {setup_open && <button type="button" className="cc-btn cc-btn--primary" onClick={setup_open}>Set up a draw</button>}
                {!draw && <button type="button" className="cc-btn cc-btn--quiet" onClick={() => stewardDock.open(coreDemoFlow)}>Play demo</button>}
              </span>}
              <div className="lottery-core-fields">
                {state.draws.length > 0 && <div className="cc-field"><label htmlFor={`${field_id}-draw`}>{copy.core.draw}</label>
                  <select id={`${field_id}-draw`} className="cc-select" value={draw?.draw_id ?? ''} disabled={state.busy || state.locked}
                    onChange={event => { void port.select(event.currentTarget.value); }}>
                    {!draw && <option value="">{copy.core.no_draw}</option>}
                    {state.draws.map(item => <option key={item.draw_id} value={item.draw_id}>{item.name}</option>)}
                  </select></div>}
                {draw && <div className="cc-field"><label htmlFor={`${field_id}-winners`}>{copy.core.winner_count}</label>
                  <input id={`${field_id}-winners`} className="cc-input" type="number" min={1} max={65535} value={winner_value}
                    disabled={state.busy || state.locked} aria-invalid={invalid_winners}
                    aria-describedby={invalid_winners ? `${field_id}-winner-error` : undefined}
                    onChange={event => setWinnerDraft({ draw, value: event.currentTarget.value })}
                    onBlur={commitWinners} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitWinners(); } }} /></div>}
                {invalid_winners && draw && <p id={`${field_id}-winner-error`} className="cc-aside" role="alert">{copy.core.invalid_winners}</p>}
              </div>
              {draw && <span className="lottery-draw-actions">
                <button type="button" className="cc-btn cc-btn--sm" disabled={state.busy} onClick={() => { void port.check(); }}>{copy.core.check}</button>
              </span>}
              {draw && !state.sealed && <div className="lottery-core-seal">
                <p className="cc-aside">{copy.core.seal_notice}</p>
                <SealButton size="large" disabled={state.busy || state.locked || !state.check || state.check.result === 'blocked'}
                  on_seal={() => { void port.seal(); }} />
              </div>}
              {state.locked && !state.sealed && <p className="cc-aside" role="alert">{copy.core.locked}</p>}
            </>}
          </DrawCard>
          <ProposalSealFrame seal_slot={seal_slot} />
          {state.seal_result && <section className="lottery-cast" aria-label={copy.core.frozen_roll}>
            <Stamp kind="sealed" />
            <p className="cc-kicker">{copy.core.announced}</p>
            <p className="lottery-cast-note">{round_label}</p>
            <p className="cc-hash">{copy.writ_fields.seal} · {state.seal_result.sealed.seal}</p>
            <p className="lottery-cast-note">{copy.core.frozen_entries(state.entries.length, state.seal_result.sealed.roll.randomness.source)}</p>
            {state.seal_result.sealed.roll.randomness.source === 'drand_quicknet' && <p className="lottery-cast-note">
              {copy.core.target_round(state.seal_result.sealed.roll.randomness.round)}</p>}
            {!state.started && <span className="lottery-draw-actions">
              <button type="button" className="cc-btn cc-btn--primary" disabled={state.busy} onClick={() => { void port.start(); }}>{copy.core.cast}</button>
              {cast_open && <button type="button" className="cc-btn cc-btn--quiet" onClick={cast_open}>Cast with the Steward</button>}
            </span>}
          </section>}
          {state.cast_result && <section className="lottery-cast" aria-label={copy.core.result}>
            <h3 className="lottery-card-title">{copy.core.winners(state.cast_result.cast.label)}</h3>
            <WindowedRows rows={state.cast_result.cast.winners} label={copy.core.winner_list} row_key={winner => winner}>
              {winner => <p>{winner}</p>}
            </WindowedRows>
            <span className="lottery-draw-actions">
              {state.writ && <button type="button" className="cc-btn cc-btn--primary" onClick={() => { setLab(true); setProve(count => count + 1); }}>Prove it</button>}
              <button type="button" className="cc-btn" disabled={state.busy || !state.writ} aria-expanded={state.nested && Boolean(state.writ)}
                aria-controls={`${field_id}-proof`} onClick={() => { port.nested(!state.nested); }}>{copy.core.proof}</button>
              <button type="button" className="cc-btn cc-btn--quiet" disabled={state.busy} onClick={() => { void port.recompute(); }}>{copy.core.reload}</button>
            </span>
            <section id={`${field_id}-proof`} hidden={!state.nested || !state.writ} aria-label={copy.core.proof_title}>
              <p className="cc-aside">{copy.core.proof_notice}</p>
              {state.writ && <a download="castle-control-writ.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(state.writ))}`}>{copy.core.download}</a>}
            </section>
          </section>}
        </RollPanel>
      </div>
    </div>
    {state.writ && (lab || prove_draft) && <div className="lottery-lab-bay">
      <WritLab writ={state.writ} simulated={simulated ?? false} prove={prove} anchors={core_anchors} steer={steer} />
      <button type="button" className="cc-btn cc-btn--quiet lottery-lab-close" onClick={() => setLab(false)}>Close the Writ Lab</button>
    </div>}
    <MoreTools>
      {/* Housekeeping the Steward flows already cover: kept reachable, out of the desk. */}
      <section className="lottery-more-card" aria-label={copy.core.housekeeping}>
        <h2 className="lottery-card-title">{copy.core.housekeeping}</h2>
        {!state.busy && <p className="cc-aside lottery-round-note">{round_label}</p>}
        <span className="lottery-draw-actions">
          <button type="button" className="cc-btn cc-btn--sm" disabled={state.busy || state.locked} onClick={() => { void port.load(); }}>{copy.core.refresh}</button>
          {!state.draws.some(item => item.draw_id === 'questions') && <button type="button" className="cc-btn cc-btn--sm" disabled={state.busy || state.locked}
            onClick={() => { void port.createQuestionDraw(); }}>{copy.core.create}</button>}
        </span>
      </section>
      {draw && <CoreDrawSetup draw={draw} disabled={state.busy || state.locked} on_save={next => { void port.edit(next); }} />}
      {draw && <UrnTierPreset draw={draw} shape={appearance.shape} on_edit={next => { void port.edit(next); }}
        on_shape={shape => display.edit({ shape })} disabled={state.busy || state.locked} />}
      {draw && <WeightEqualizer draw={draw} entries={undefined} on_edit={next => { void port.edit(next); }}
        disabled={state.busy || state.locked} on_focus_weight={weight => display.edit({ focus_weight: weight })} />}
      {draw && <fieldset className="lottery-more-card" disabled={state.busy || state.locked}>
        <DrawAppearance key={draw.draw_id} port={port.appearance(draw.draw_id)} preview={false}
          hint="Save applies these settings to this draw's OBS page and resets open entries. Finish setup before viewers join. Reloading the room cannot read saved appearance yet; controls start at defaults. Art style is saved; OBS art style is unchanged." />
        <button type="button" className="cc-btn" disabled={state.busy || state.locked} onClick={() => { void saveAppearance(draw.draw_id); }}>Save draw appearance</button>
        {art_error && <p role="alert">{art_error}</p>}
      </fieldset>}
      {state.entries.length > 0 && <section className="lottery-more-card" aria-label={copy.core.frozen_list}>
        <details className="cc-disclosure"><summary>{copy.core.frozen_list} · {state.entries.length}</summary>
          <div className="lottery-urn-window"><WindowedRows rows={state.entries} label={copy.core.frozen_list} row_key={entry => entry.handle}>
            {entry => <p>{copy.core.entry(entry.handle, entry.weight)}</p>}
          </WindowedRows></div></details></section>}
      <section className="lottery-more-card" aria-label={copy.lookup_title}>
        <h2 className="lottery-card-title">{copy.lookup_title}</h2><p className="cc-aside">{copy.core.lookup_hint}</p>
        <div className="lottery-lookup"><label htmlFor="lottery-core-lookup">{copy.core.user_id}</label>
          <input id="lottery-core-lookup" className="cc-input" inputMode="numeric" value={user} onChange={event => setUser(event.currentTarget.value)} />
        </div>
        <button type="button" className="cc-btn" disabled={state.busy || !draw || !user} onClick={() => { void port.lookup(user); }}>{copy.core.lookup}</button>
        {state.lookup_result && <p className="lottery-lookup-result" role="status">
          {state.lookup_result.entry ? copy.core.eligible(state.lookup_result.entry.weight) : copy.core.ineligible}</p>}
      </section>
      <FairnessSteps />
    </MoreTools>
    <p className="cc-status lottery-room-notice" role="status">{state.notice}</p>
  </div>;
}

export default function CoreLotteryRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const flows = useMemo(() => coreFlows(snapshot), [snapshot]);
  // Play demo never touches the core: it plays in the fixture chamber, a local SIMULATED sandbox.
  const sandbox = useDemoSandbox('lottery', coreDemoFlow.id, isDemoClosing);
  if (sandbox) return <Suspense fallback={<p role="status">Opening the demo sandbox…</p>}>
    <SandboxRoom snapshot={snapshot} replay={false} core_sandbox />
  </Suspense>;
  const connection = coreLotsConnection(snapshot);
  if (!connection) return <section className="lottery-room" aria-label={copy.core.title}>
    <p role="status">{copy.core.unavailable}</p><ProposalSealFrame seal_slot={seal_slot} />
  </section>;
  connection.port ??= createCoreLotsPort(connection.launch, connection.transport);
  const import_art = async (library_id: string) => (await (await (await import('../../custom-design/seal.js')).beaconsPort(snapshot))
    .importLibrary(library_id, 'draw_vessel')).design_id;
  return <ConnectedLotsRoom port={connection.port} {...(snapshot.status ? { simulated: snapshot.status.simulated } : {})} seal_slot={seal_slot} flows={flows}
    import_art={import_art} />;
}
