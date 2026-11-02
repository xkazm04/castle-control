import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ReactNode } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { stewardDock, useFlowDraft, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { checkFixturePolicy, fixtureWeightNotice, lookupFixture } from '../../lots-model.js';
import { fixtureBeaconWrit, fixtureCooldown, fixtureDraws, fixturePool, fixtureWrit } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { draftRoll, entryHash, lotterySession } from './session.js';
import { FairnessSteps, Ticket, policyReason } from './print.jsx';
import { LotteryWrit } from './writ.jsx';
import type { LotsDraw } from '@castle-control/contract';
import { DrawAppearance } from './appearance.jsx';
import { DrawSetup } from './setup.jsx';
import { FixtureCast, OverlayNote } from './result.jsx';
import { useWritCheck } from './playback.js';
import { CeremonyControls, DrawStage } from './stage.jsx';
import type { StageCast } from './stage-model.js';
import { WeightEqualizer } from './equalizer.jsx';
import { WritLab } from './lab.jsx';
import type { LabSteer } from './lab.jsx';
import { quicknet_anchor, simulated_anchor } from './beacon-anchors.js';
import { verifyWrit } from '../../lots-cast.js';
import { castFlow, demoDraw, demoFlow, demoShape, isDemoClosing, proveFlow, setupFlow, tamperKinds } from './flow-steps.js';
import { SandboxBanner, useDemoSandbox } from '../../demo-sandbox.jsx';
import { contentLine, heldOut, poolLabel } from './flow-model.js';
import { lotLive } from './live.js';
import { countCohorts, DrawCard, MoreTools, RollPanel, StagePanel } from './roll.jsx';
import type { RollTone } from './roll.jsx';
import { useFill } from './chamber-hooks.js';
import { LotChamber } from './chamber.jsx';
import { DrawControls } from './draw-controls.jsx';
import { lotDrawer } from './drawer.js';
import { RevealedWinners } from './revealed.jsx';
import './room.css';
import './chamber.css';

/** Fixture mode may authenticate its simulated specimen; real chains keep the public anchor. */
const fixture_anchors = [quicknet_anchor, simulated_anchor] as const;

export { LotteryWrit } from './writ.jsx';

const drawLine = (draw: LotsDraw) =>
  `${contentLine(draw)} · ${poolLabel[draw.rules.pool.kind].toLowerCase()} · ${draw.rules.winner_count} winner${draw.rules.winner_count === 1 ? '' : 's'}`;

/**
 * The fixture Lot Chamber. In core mode it is only the Play demo's sandbox (`core_sandbox`): the same
 * fixture engine and picture, never publishing to the chamber's live mirror, so the core is untouched.
 */
export default function LotteryRoom({ snapshot, replay, queue = proposalQueue, seal_slot, core_sandbox = false }: {
  snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode; core_sandbox?: boolean;
}) {
  const { port, display, reveal } = lotterySession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const appearance = useSyncExternalStore(display.subscribe, display.getSnapshot, display.getSnapshot);
  const proposals = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const writ_checked = useWritCheck(state.writ, verifyWrit);
  const cast = useMemo<StageCast | undefined>(() => state.writ
    ? { winners: state.writ.winners, label: 'streamer-controlled' } : undefined, [state.writ]);
  const publication = useStewardDraft('lottery');
  const setup = useFlowDraft(setupFlow);
  const demo = useFlowDraft(demoFlow);
  const prove = useFlowDraft(proveFlow);
  const sandbox = useDemoSandbox('lottery', demoFlow.id, isDemoClosing);
  const drawer = lotDrawer(port);
  const tools_open = useSyncExternalStore(drawer.subscribe, drawer.getSnapshot, drawer.getSnapshot);
  const setTools = (open: boolean) => open ? drawer.open() : drawer.close();
  const [lab, setLab] = useState(false);
  const [prove_count, setProve] = useState(0);
  const [verification, setVerification] = useState('');
  const phase = state.started ? 'cast' : state.sealed ? 'sealed' : 'open';
  useEffect(() => {
    if (core_sandbox) return;
    lotLive.publish({ mode: 'fixture', phase, draw: state.draw, draws: fixtureDraws, entries: state.entries.length,
      seal: state.sealed_roll?.seal, winners: state.simulated_winners ?? [], writ: Boolean(state.writ) });
  }, [core_sandbox, phase, state.draw, state.entries.length, state.sealed_roll, state.simulated_winners, state.writ]);
  useEffect(() => { if (prove) { setLab(true); setTools(true); } }, [prove]);
  // The demo's roll step fills the urn lot by lot; every other draft shows its roll at once.
  // A draft shows once its first choice is made: an untouched or started-over flow leaves the chamber as it stands.
  const draft_draw = setup?.preset ? setup.draw : demo?.sample ? demoDraw(demo) : undefined;
  const draft_entries = useMemo(() => draft_draw ? fixturePool(draft_draw) : undefined, [draft_draw]);
  const filling = Boolean(demo) && publication?.step === 'roll';
  const shown = useFill(draft_entries, filling);
  if (snapshot.mode !== 'fixture' && !core_sandbox) return <EmptyState compact title={copy.no_live_controls} />;

  const history = proposals.proposals.filter(item => item.chamber === 'lottery' && item.state !== 'torn');
  const pending = history.filter(isPending);
  const proposal = pending.find(item => item.id === proposals.selected_proposal_id) ?? pending.at(-1);
  const roll = state.sealed_roll ? Array.from(lotterySession(queue).rolls.values()).find(item => item.roll === state.sealed_roll?.roll) : undefined;
  const drafting = draft_draw !== undefined;
  const draw = draft_draw ?? state.draw;
  const entries = drafting ? shown ?? [] : state.sealed ? roll?.entries ?? state.entries : state.entries;
  const shape = (setup?.shape ?? (demo && demo.sample ? demoShape(demo) : undefined)) ?? appearance.shape;
  const policy = checkFixturePolicy(draw.policy);
  const open = (flow: typeof setupFlow | typeof castFlow | typeof proveFlow | typeof demoFlow) => () => stewardDock.open(flow);
  const openLab = () => { setTools(true); setLab(true); setProve(count => count + 1); };
  const status = drafting ? (filling ? 'Chat types !join · the roll is filling' : 'Drafting in the Steward · nothing sealed')
    : phase === 'cast' ? `Cast · ${state.simulated_winners?.length ?? 0} winners in cast order`
      : phase === 'sealed' ? 'Sealed · the roll is frozen, waiting for the cast'
        : state.paused ? copy.paused : copy.stage.open;
  const tone: RollTone = drafting ? 'draft' : policy.result === 'blocked' ? 'blocked' : phase;
  const recompute = async () => {
    if (!roll) return;
    try { setVerification(await entryHash(roll.bytes) === roll.hash ? copy.hash_match : copy.hash_mismatch); }
    catch { setVerification(copy.hash_failed); }
  };
  const edit = (next: LotsDraw) => {
    const before = port.getSnapshot().draw;
    port.edit(next);
    if (port.getSnapshot().draw !== before) for (const item of queue.pending('lottery')) if (item.kind === 'seal') queue.tearUp(item.id);
  };
  const steer: LabSteer | undefined = prove?.writ ? { specimen: prove.writ === 'beacon' ? 'beacon' : 'cast',
    tamper: prove.tamper && tamperKinds.has(prove.tamper) ? prove.tamper as LabSteer['tamper'] : undefined } : undefined;
  const lab_writ = prove?.writ === 'specimen' ? fixtureWrit : state.writ ?? fixtureWrit;
  const guard_line = policy.reasons.length ? policyReason(policy.reasons[0] ?? '') : policy.result === 'ok' ? 'Nothing blocks this draw' : undefined;
  return <LotChamber theatre={appearance.theatre} simulated drafting={drafting} replay={replay}
    tools_open={tools_open} on_tools={() => setTools(true)} on_close={() => setTools(false)}
    banner={sandbox ? <SandboxBanner chamber="lottery" demo_id={demoFlow.id} /> : undefined}
    picture={<StagePanel title={copy.stage.titles[shape]} count={entries.length} draft={drafting}>
        <DrawStage controls={appearance.theatre} shape={shape} on_shape={next => display.edit({ shape: next })} entries={entries} cast={drafting ? undefined : cast}
          verified={writ_checked === true} content={draw.policy.content} sealed={!drafting && state.sealed}
          seal={drafting ? undefined : state.sealed_roll?.seal} clock={reveal} reveal_ms={appearance.reveal_ms}
          theatre={appearance.theatre} on_theatre={display.theatre} sound={appearance.sound} on_sound={on => display.edit({ sound: on })}
          by_hand={appearance.by_hand} on_by_hand={on => display.edit({ by_hand: on })} focus_weight={appearance.focus_weight}
          on_prove={() => { display.theatre(false); openLab(); }} />
      </StagePanel>}
    preview={<>
      <p>{drafting ? `${draw.name} · ${draw.rules.winner_count} winners · not sealed`
        : proposal ? `${proposal.title} · Proposal · not sealed` : 'Nothing in Preview.'}</p>
      {proposal && <button type="button" className="cc-btn cc-btn--quiet" onClick={() => queue.tearUp(proposal.id)}>Withdraw draft</button>}
      {(proposal || drafting) && <button type="button" className="cc-link" onClick={() => setTools(true)}>Review the full writ</button>}
    </>}
    program={<><p>{state.draw.name}</p><p>{state.started ? `Cast · ${state.simulated_winners?.length ?? 0} winners`
      : state.sealed ? 'Roll sealed · waiting for the cast' : 'Roll open · nothing cast'}</p></>}
    setup={<DrawControls draw={draw} held_out={heldOut(draw, fixtureCooldown.length)} disabled={state.sealed || drafting}
      on_edit={edit} on_tools={() => setTools(true)}>
      <CeremonyControls shape={shape} on_shape={next => display.edit({ shape: next })}
        theatre={appearance.theatre} on_theatre={display.theatre} sound={appearance.sound} on_sound={on => display.edit({ sound: on })}
        by_hand={appearance.by_hand} on_by_hand={on => display.edit({ by_hand: on })} />
    </DrawControls>}
    question={<DrawCard name={draw.name} line={drawLine(draw)} guard={drafting && policy.result === 'blocked' ? 'warn' : policy.result}
      guard_word={drafting && policy.result === 'blocked' ? 'To clear' : undefined}
      guard_line={drafting && policy.result === 'blocked' ? 'The Steward asks for each fix before the seal.' : guard_line} />}
    roll={<RollPanel status={status} tone={tone} counts={countCohorts(entries)} draft={drafting} simulated count={entries.length} />}
    cast={<>
      <div className="lottery-draw-actions">
        {!drafting && phase === 'open' && <>
          <button type="button" className="cc-btn cc-btn--primary" onClick={open(setupFlow)}><RoomKeyBadge room="lottery" action="setup" />Set up a draw</button>
          <button type="button" className="cc-btn" onClick={open(castFlow)}><RoomKeyBadge room="lottery" action="cast" />Cast the lots</button>
          <button type="button" className="cc-btn cc-btn--quiet" onClick={open(demoFlow)}>Play demo</button>
        </>}
        {!drafting && phase === 'sealed' && <>
          <button type="button" className="cc-btn cc-btn--primary" onClick={open(castFlow)}><RoomKeyBadge room="lottery" action="cast" />Cast the lots</button>
          <button type="button" className="cc-btn cc-btn--quiet" onClick={open(setupFlow)}><RoomKeyBadge room="lottery" action="setup" />Set up another draw</button>
        </>}
        {proposal && <button type="button" className="cc-btn" onClick={() => setTools(true)}>Review and seal the writ</button>}
      </div>
      <p className="lottery-note">{drafting ? 'The Steward is drafting below. Nothing is sealed.'
        : proposal ? 'Proposal · not sealed. Review the writ before holding to seal.' : 'Winners are drawn at the moment you seal.'}</p>
    </>}
    proof={<>
      {phase === 'cast' ? <>
        <RevealedWinners clock={reveal} seal={state.sealed_roll?.seal} total={state.simulated_winners?.length ?? 0} />
        <button type="button" className="cc-btn" onClick={() => { openLab(); stewardDock.open(proveFlow); }}><RoomKeyBadge room="lottery" action="prove" />Prove it</button>
      </> : <p className="lottery-note">The writ appears after a draw is sealed. Replay the draw from its seed to check the winners.</p>}
      <p className="lottery-note">Stylised illustration · generated sample lots · SIMULATED.</p>
    </>}
    tools={<>
      {!drafting && phase === 'cast' && <FixtureCast port={port} display={appearance} hash={roll?.hash}
        on_prove={() => { openLab(); stewardDock.open(proveFlow); }} on_new={() => { port.reopen(); draftRoll(queue); }} />}
    {(lab || prove) && <div className="lottery-lab-bay">
      <WritLab writ={lab_writ} simulated prove={prove_count} beacon={fixtureBeaconWrit} anchors={fixture_anchors} steer={steer} />
      <button type="button" className="cc-btn cc-btn--quiet lottery-lab-close" onClick={() => setLab(false)}>Close the Writ Lab</button>
    </div>}
    <MoreTools>
      <section className="lottery-more-card" aria-label={copy.setup}>
        <h3 className="lottery-card-title">Intake</h3>
        <p className="cc-aside">{copy.journey.setup_hint}</p>
        {!state.sealed && <button type="button" className="cc-btn" aria-pressed={state.paused} onClick={() => port.pause()}>{state.paused ? copy.resume : copy.pause}</button>}
        <p className="cc-status" role="status">{state.sealed ? copy.journey.frozen : state.notice}</p>
        {!lab && <button type="button" className="cc-btn" onClick={openLab}>Open the Writ Lab</button>}
      </section>
      <DrawSetup port={port} on_edit={edit} on_preview={() => {
        for (const item of queue.pending('lottery')) if (item.kind === 'seal') queue.tearUp(item.id);
        draftRoll(queue);
      }} />
      <WeightEqualizer draw={state.draw} entries={state.entries} on_edit={edit} disabled={state.sealed}
        on_focus_weight={weight => display.edit({ focus_weight: weight })} />
      <DrawAppearance port={display} />
      <OverlayNote draw_id={state.draw.draw_id} display={appearance} />
      <section className="lottery-more-card" aria-label={copy.lookup_title}>
        <div className="lottery-lookup">
          <label htmlFor="lottery-lookup">{copy.lookup}</label>
          <input id="lottery-lookup" className="cc-input" type="search" aria-label={copy.lookup} placeholder={copy.lookup_placeholder}
            autoComplete="off" value={state.lookup} onChange={event => port.lookup(event.currentTarget.value)} />
          <p className="lottery-lookup-hint">{copy.lookup_hint}</p>
          <p className="lottery-lookup-result" role="status">{lookupFixture(state)}</p>
        </div>
      </section>
      <Ticket label={copy.saved_proof} entrance={0}>
        <div className="cc-ticket-head"><p className="cc-kicker">{copy.saved_proof}</p>
          <time dateTime={fixtureWrit.roll.sealed_at}>{fixtureWrit.roll.sealed_at.slice(0, 10)}</time></div>
        <ul className="cc-handles">{fixtureWrit.winners.map(winner => <li className="cc-handle" key={winner}>{winner}</li>)}</ul>
        <p className="cc-aside">{copy.writ_notice}</p><code className="cc-hash">{fixtureWrit.seal}</code>
        <button type="button" className="cc-btn" onClick={() => { void port.recompute(true); }}>{copy.recompute}</button>
        <p className="cc-status" role="status">{state.notice}</p>
        {roll && <>
          <p className="cc-hash">{copy.seal_hash} · {roll.hash}</p>
          <button type="button" className="cc-btn" onClick={() => { void recompute(); }}>{copy.frozen_recompute}</button>
          <details className="cc-disclosure"><summary>{copy.frozen_bytes}</summary><pre className="cc-hash">{roll.bytes}</pre></details>
          <p className="cc-status" role="status">{verification}</p>
        </>}
      </Ticket>
      <section className="lottery-more-card lottery-seal-frame" aria-label="Proposals and designs">
        {proposal && <div className="lottery-pending"><LotteryWrit proposal={proposal} weight_notice={fixtureWeightNotice(state)} /></div>}
        {seal_slot}
      </section>
      <FairnessSteps simulated />
    </MoreTools>
    </>} />;
}
