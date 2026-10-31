import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CardCopy, CardSide, HeraldicCard, InkButton, SectionHeading, ShieldCharge, StatusChip } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { checkFixturePolicy, fixtureWeightNotice, lookupFixture } from '../../lots-model.js';
import { fixtureCooldown, fixtureDraws, fixtureWrit } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { draftRoll, entryHash, lotterySession } from './session.js';
import { Urn } from './urn.jsx';
import { FairnessSteps, PolicyRibbon, PoolStage, Ticket, policyReason } from './print.jsx';
import { LotteryWrit } from './writ.jsx';
import type { LotsDraw } from '@castle-control/contract';
import { DrawSetup } from './setup.jsx';
import { DrawAppearance } from './appearance.jsx';
import { FixtureCast } from './result.jsx';
import './room.css';

export { LotteryWrit } from './writ.jsx';

export default function LotteryRoom({ snapshot, replay, queue = proposalQueue, seal_slot }: {
  snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode;
}) {
  const { port, rolls, display } = lotterySession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const appearance = useSyncExternalStore(display.subscribe, display.getSnapshot, display.getSnapshot);
  const proposals = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [verification, setVerification] = useState('');
  if (snapshot.mode !== 'fixture') return <p>{copy.no_live_controls}</p>;
  const history = proposals.proposals.filter(item => item.chamber === 'lottery' && item.state !== 'torn');
  const pending = history.filter(isPending);
  const candidates = pending.length ? pending : history;
  const proposal = candidates.find(item => item.id === proposals.selected_proposal_id) ?? candidates.at(-1);
  const roll = proposal ? rolls.get(proposal.id) : undefined;
  const entries = state.sealed ? roll?.entries ?? state.entries : state.entries;
  const policy = checkFixturePolicy(state.draw.policy);
  const cap = state.draw.rules.cohort_caps.find(item => item.cohort === 'raider');
  const winner_field = proposal?.fields.find(field => field.key === 'winners');
  const winners = winner_field ? <>{winner_field.struck.map((value, index) => <s key={index}>{String(value)}</s>)}
    <ins key={proposal?.revision}>{String(winner_field.value)}</ins></> : state.draw.rules.winner_count;
  const recompute = async () => {
    if (!roll) return;
    try { setVerification(await entryHash(roll.bytes) === roll.hash ? copy.hash_match : copy.hash_mismatch); }
    catch { setVerification(copy.hash_failed); }
  };
  const discardPreview = () => {
    for (const item of queue.pending('lottery')) if (item.kind === 'seal') queue.tearUp(item.id);
  };
  const edit = (draw: LotsDraw) => {
    const before = port.getSnapshot().draw;
    port.edit(draw);
    if (port.getSnapshot().draw !== before) discardPreview();
  };
  return <div className="lottery-room" data-replay={replay}>
    <div className="cc-hall" aria-label={copy.title}>
      <PoolStage count={entries.length} winners={winners} winner_detail={pending.length ? copy.proposed : copy.selected_draw}
        held_out={fixtureCooldown.length} cap={cap ? `${cap.numerator}/${cap.denominator}` : copy.no_cap}
        illustration={copy.illustration} foot={<>
          <ul className="cc-legend" aria-label={copy.dots}>{(['new_account', 'subscriber', 'raider'] as const).map(cohort =>
            <li key={cohort} data-cohort={cohort}>{copy.cohorts[cohort]} <b>{entries.filter(entry => entry.cohort === cohort).length}</b></li>)}</ul>
          <p>{copy.core.pool(state.draw.rules.pool.kind, state.draw.policy.content, state.draw.rules.cooldown_s)} · {fixtureCooldown.length} {copy.cooldown} · {fixtureWeightNotice(state)}</p>
        </>}><Urn entries={entries} /></PoolStage>
      <div className="cc-desk" aria-label={copy.workbench}>
        <SectionHeading variant="banner" level={2} title={copy.writ} gloss={copy.writ_gloss} ink="gules"
          count={<StatusChip variant="gules" stamp="label" {...(pending.length ? { tone: 'spot' as const } : {})}>
            {pending.length ? copy.awaiting : state.sealed ? copy.frozen_stamp : copy.waiting}
          </StatusChip>} />
        {!pending.length && <div className="cc-group">
          <p className="cc-kicker">{copy.templates}</p><p className="cc-aside">{copy.templates_hint}</p>
          <ul className="cc-blazons" aria-label={copy.templates}>{fixtureDraws.map(draw => {
            const check = checkFixturePolicy(draw.policy);
            return <li key={draw.draw_id}><HeraldicCard variant="selectable" ink="gules"
              selected={draw.draw_id === state.draw.draw_id} on_select={() => { port.select(draw.draw_id); draftRoll(queue); }}>
              <ShieldCharge charge={draw.policy.paid_weight ? 'struck-coin' : draw.policy.content === 'prize' ? 'cup' : 'question'} />
              <CardCopy title={draw.name} meta={`${draw.policy.content === 'prize' ? copy.prize : copy.no_prize} · ${copy.proposal_only}`}
                reasons={check.reasons.map(policyReason)} />
              <CardSide action={copy.draft_writ}><StatusChip variant="gules" stamp="verdict" tone={check.result}>
                {copy.checks[check.result]}</StatusChip></CardSide>
            </HeraldicCard></li>;
          })}</ul>
        </div>}
        {proposal && <LotteryWrit proposal={proposal} weight_notice={fixtureWeightNotice(state)} />}
        {state.sealed && <InkButton size="room" onClick={() => { port.select(state.draw.draw_id); draftRoll(queue); }}>{copy.draft_new}</InkButton>}
        <DrawSetup port={port} on_edit={edit} on_preview={() => { discardPreview(); draftRoll(queue); }} />
        <DrawAppearance port={display} />
        <PolicyRibbon result={policy.result} />
        {policy.reasons.map(reason => <p className="cc-aside" key={reason}>{policyReason(reason)}</p>)}
        {state.draw.policy.twitch_disclaimer && <p className="cc-aside">{copy.disclaimer_text}</p>}
        {state.draw.policy.official_rules && <p className="cc-aside">{copy.template_text}</p>}
        <div className="lottery-seal-frame"><HeraldicCard variant="raised" tone="seal" ink="gules">{seal_slot}</HeraldicCard></div>
        {state.sealed && roll && <FixtureCast port={port} hash={roll.hash} display={appearance} />}
        <HeraldicCard variant="raised" aria-label={copy.lookup_title}>
          <div className="lottery-lookup">
            <label htmlFor="lottery-lookup">{copy.lookup}</label>
            <input id="lottery-lookup" type="search" aria-label={copy.lookup} placeholder={copy.lookup_placeholder}
              autoComplete="off" value={state.lookup} onChange={event => port.lookup(event.currentTarget.value)} />
            <p className="lottery-lookup-hint">{copy.lookup_hint}</p>
            <p className="lottery-lookup-result" role="status">{lookupFixture(state)}</p>
          </div>
        </HeraldicCard>
        <Ticket label={copy.saved_proof}>
          <div className="cc-ticket-head"><p className="cc-kicker">{copy.saved_proof}</p>
            <time dateTime={fixtureWrit.roll.sealed_at}>{fixtureWrit.roll.sealed_at.slice(0, 10)}</time></div>
          <p className="cc-caption">{copy.writ_fields.winners}</p>
          <ul className="cc-handles">{fixtureWrit.winners.map(winner => <li className="cc-handle" key={winner}>{winner}</li>)}</ul>
          <details className="cc-disclosure"><summary>{copy.writ}</summary><div className="cc-disclosure-body">
            <p className="cc-aside">{copy.writ_notice}</p><code className="cc-hash">{fixtureWrit.seal}</code>
            <InkButton size="room" onClick={() => { void port.recompute(); }}>{copy.recompute}</InkButton>
            <p className="cc-status" role="status">{state.notice}</p>
          </div></details>
          {roll && <div className="cc-group">
            <InkButton size="room" onClick={() => { void recompute(); }}>{copy.frozen_recompute}</InkButton>
            <details className="cc-disclosure"><summary>{copy.frozen_bytes}</summary>
              <pre className="cc-hash">{roll.bytes}</pre></details>
            <p className="cc-status" role="status">{verification}</p>
          </div>}
        </Ticket>
        <FairnessSteps simulated />
      </div>
    </div>
  </div>;
}
