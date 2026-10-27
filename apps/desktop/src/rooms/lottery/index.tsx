import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal, ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { checkFixturePolicy, lookupFixture } from '../../lots-model.js';
import { fixtureCooldown, fixtureDraws, fixtureWrit } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { draftRoll, entryHash, lotterySession } from './session.js';
import { Urn } from './urn.jsx';
import './room.css';

export function LotteryWrit({ proposal }: { proposal: Proposal }) {
  return <article className="lottery-writ" data-state={proposal.state}>
    <p className="room-stamp">{proposal.state === 'sealed' ? 'Sealed by you · simulated' : 'Proposal · not sealed'}</p>
    <h2>{proposal.title}</h2><p>Writ · {proposal.state} · revision {proposal.revision}</p>
    <dl className="lottery-writ-fields">{proposal.fields.map(field => <div key={field.key}>
      <dt>{field.label}</dt><dd>{field.struck.map((value, index) => <s key={index}>{String(value)}</s>)}
        <ins key={`${field.key}-${proposal.revision}`}>{String(field.value)}</ins></dd>
    </div>)}</dl>
    {proposal.seal_hash && <><div className="lottery-wax">Sealed<br />by you</div>
      <p className="room-hash">SHA-256 · {proposal.seal_hash}</p></>}
    <div className="lottery-fair"><b>Fairness, always shown</b><p>{copy.equal}</p>
      <p>No paid entry or paid weight on a prize draw. Sealing freezes this entry list before any round is known.</p></div>
  </article>;
}

export default function LotteryRoom({ snapshot, replay, queue = proposalQueue, seal_slot }: {
  snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode;
}) {
  const { port, rolls } = lotterySession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const proposals = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [verification, setVerification] = useState('');
  if (snapshot.mode !== 'fixture') return <p>No live draw controls are available.</p>;
  const history = proposals.proposals.filter(item => item.chamber === 'lottery' && item.state !== 'torn');
  const pending = history.filter(isPending);
  const candidates = pending.length ? pending : history;
  const proposal = candidates.find(item => item.id === proposals.selected_proposal_id) ?? candidates.at(-1);
  const roll = proposal ? rolls.get(proposal.id) : undefined;
  const policy = checkFixturePolicy(state.draw.policy);
  const recompute = async () => {
    if (!roll) return;
    try { setVerification(await entryHash(roll.bytes) === roll.hash ? 'Frozen entry list matches its SHA-256 seal.' : 'Seal mismatch.'); }
    catch { setVerification('Hash recomputation failed. No verified result is available.'); }
  };
  return <div className="lottery-room" data-replay={replay}>
    <div className="lottery-columns">
      <div className="room-column lottery-workbench">
        <section className="room-stage lottery-stage" aria-label="Draw workbench">
        <p className="room-caption">The writ · drafted in ink, sealed by you</p>
        <p className="room-now">Now: {pending.length ? 'proposal awaiting your seal'
          : state.sealed ? 'entry list frozen' : 'no draft waiting'} · simulated</p>
        {proposal && <LotteryWrit proposal={proposal} />}
        {!pending.length && <div className="lottery-empty">
          <h2>Writ templates</h2><p>Tell the Steward which draw. Its proposal will ink in here.</p>
          {fixtureDraws.map(draw => <button key={draw.draw_id} type="button" data-active={draw.draw_id === state.draw.draw_id}
            onClick={() => { port.select(draw.draw_id); draftRoll(queue); }}>
            <b>{draw.name}</b><span>{draw.policy.content === 'prize' ? 'Prize' : 'No prize'} · proposal only</span></button>)}
        </div>}
        {state.sealed && <button type="button" onClick={() => { port.select(state.draw.draw_id); draftRoll(queue); }}>Draft a new roll</button>}
        </section>
        <p className="lottery-guardrails" role="status">Giveaway guardrails · {copy.checks[policy.result]} · local preview</p>
        {policy.reasons.map(reason => <p key={reason}>{copy.reasons[reason as keyof typeof copy.reasons] ?? reason}</p>)}
        {state.draw.policy.twitch_disclaimer && <p>{copy.disclaimer_text}</p>}
        {state.draw.policy.official_rules && <p>{copy.template_text}</p>}
        <details><summary>{copy.fairness}</summary><ol className="lottery-steps">{copy.steps.map(([title, text]) => <li key={title}><b>{title}</b> · {text}</li>)}</ol>
          <p>{copy.test_note}</p><p>{copy.fixture_only}</p></details>
        {roll && <><button type="button" onClick={() => { void recompute(); }}>Recompute frozen entry seal</button>
          <details><summary>Frozen entry list · UTF-8 JSON · handle, weight field order</summary><pre className="room-hash">{roll.bytes}</pre></details></>}
        <p role="status">{verification}</p>
      </div>
      <div className="room-column lottery-details">
        <figure className="lottery-urn-figure" aria-label="Eligible entry pool">
          <Urn entries={roll?.entries ?? state.entries} /></figure>
        <p>{copy.pool} · {fixtureCooldown.length} {copy.cooldown}</p>
        <label>{copy.lookup}<input type="search" aria-label={copy.lookup} value={state.lookup} onChange={event => port.lookup(event.currentTarget.value)} /></label>
        <p>{lookupFixture(state)}</p>
        <details><summary>Saved simulated proof bundle</summary><p>{copy.writ_notice}</p><code className="room-hash">{fixtureWrit.seal}</code>
          <p>Recorded winners: {fixtureWrit.winners.join(', ')}</p>
          <button type="button" onClick={() => { void port.recompute(); }}>{copy.recompute}</button><p role="status">{state.notice}</p></details>
        {seal_slot}
      </div>
    </div>
  </div>;
}
