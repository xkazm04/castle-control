import { useState } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { Decision } from '@castle-control/contract';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { fixtureHoldReasons } from '../../moderation-fixture.js';
import { available } from '../../moderation-lifecycle.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { GateArt } from './gate-art.jsx';
import { demoBurst, demoHeldText, demoHoldReason } from './demo-model.js';
import { proposeCommand } from './session.js';
import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import { ClockTime } from './presentation.jsx';

/** What the Play demo draws at the gate; a picture of the draft, never the fixture state. */
export type GateDemo = { stage: string; choice?: 'pass' | 'bar' | undefined };

export function HeldActions({ item, state, queue }: { item: Decision; state: ModerationPreview; queue: ProposalQueue }) {
  const choices = available(state, item.decision_id);
  return <div className="gh-gate__act">{(['release', 'remove'] as const).map(kind => <button type="button" key={kind}
    className={kind === 'release' ? 'cc-btn cc-btn--chamber gh-pass' : 'cc-btn cc-btn--line gh-bar'}
    disabled={!choices.includes(kind)} onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'release' ? 'Pass held message' : 'Bar held message')}>
    <RoomKeyBadge room="moderator" action={kind} />{kind === 'release' ? copy.propose_pass : copy.propose_bar}</button>)}</div>;
}

function Burst({ held }: { held: boolean }) {
  if (held) return <p className="gh-burst-summary"><span className="cc-sim">Simulated</span>
    {demoBurst.length} lines arrived: {demoBurst.filter(line => line.verdict === 'pass').length} passed, 1 barred, 1 held for you.</p>;
  return <ol className="gh-burst" aria-label="Simulated chat burst">
    {demoBurst.map((line, index) => <li key={line.id} data-verdict={line.verdict} style={{ animationDelay: `${index * 220}ms` }}>
      <span className={`cc-stamp cc-stamp--inked cc-stamp--${line.verdict === 'pass' ? 'ok' : line.verdict === 'hold' ? 'held' : 'blocked'}`}>{line.verdict === 'pass' ? copy.pass : line.verdict === 'hold' ? copy.hold : copy.bar}</span>
      <span className="gh-burst__text">{line.text}</span></li>)}
  </ol>;
}

function DemoHeld({ choice, resolved = false }: { choice: 'pass' | 'bar' | undefined; resolved?: boolean }) {
  const word = choice === 'pass' ? 'Pass' : 'Bar';
  return <article className="gh-held gh-held--demo" aria-label="Simulated held message" data-resolved={resolved ? choice : undefined}>
    <div className="gh-held__meta"><span className="cc-sim">Simulated</span>
      {resolved && <span className={`cc-stamp cc-stamp--inked cc-stamp--${choice === 'pass' ? 'ok' : 'blocked'}`}>{choice === 'pass' ? 'Released' : 'Removed'}</span>}
      <span className="cc-hash">simulated-message-4300</span>
      <span className="gh-held__state">{resolved ? `Sealed · ${word}` : choice ? `Draft · you propose ${word}` : copy.held_state}</span></div>
    <p className="gh-held__msg">{demoHeldText}</p>
    <p className="gh-held__why"><b>{copy.held_reason}</b>{demoHoldReason}</p>
    <p className="gh-held__hint">{resolved ? (choice === 'pass' ? 'You sealed Pass: this line reached the sample chat.' : 'You sealed Bar: this line never reached the sample chat.')
      : choice ? 'Hold to seal in the Steward to decide it.' : 'Answer in the Steward below: pass or bar.'}</p>
  </article>;
}

/** A read-only tally of the replayed sample: how chat went through the gate. Never an action. */
export function GateTally({ verdicts, label = 'Through the gate · simulated sample' }: { verdicts: readonly string[]; label?: string }) {
  const parts = ([['pass', 'passed'], ['hold', 'held'], ['bar', 'barred']] as const)
    .map(([verdict, word]) => ({ verdict, word, count: verdicts.filter(item => item === verdict).length }));
  const total = verdicts.length || 1;
  return <figure className="gh-tally" aria-label={`${label}: ${parts.map(item => `${item.count} ${item.word}`).join(', ')}`}>
    <figcaption>{label}</figcaption>
    <span className="gh-tally__bar" aria-hidden="true">{parts.map(item => item.count > 0 && <i key={item.verdict} data-verdict={item.verdict}
      style={{ flexGrow: item.count / total }} />)}</span>
    <span className="gh-tally__legend">{parts.map(item => <span key={item.verdict} data-verdict={item.verdict}><b>{item.count}</b> {item.word}</span>)}</span>
  </figure>;
}

/** The newest replayed lines and what the gate did with each: read-only, simulated sample text only. */
export function GateRecent({ items, label = 'Recent at the gate · simulated sample' }: { items: readonly Pick<Decision, 'decision_id' | 'verdict' | 'message_text' | 'at'>[]; label?: string }) {
  const word = { pass: copy.pass, hold: copy.hold, bar: copy.bar } as const;
  return <section className="gh-recent" aria-label={label}>
    <p className="gh-recent__head">{label}</p>
    <ol className="gh-recent__list">{items.map(item => <li key={item.decision_id} data-verdict={item.verdict}>
      <span className="gh-recent__verdict">{word[item.verdict as keyof typeof word] ?? item.verdict}</span>
      <span className="gh-recent__text">{item.message_text ?? copy.text_unavailable}</span>
      <ClockTime at={item.at} /></li>)}</ol>
  </section>;
}

/** The hero: the portcullis and one held message at a time, with Propose pass / Propose bar. */
export function GatePlate({ state, queue, demo, ribbon, resolved, part = 'full', compact = false, feedback = true }: {
  state: ModerationPreview; queue: ProposalQueue; demo?: GateDemo | undefined;
  part?: 'full' | 'picture' | 'queue';
  /** The chamber keeps the first hold; paging and secondary context remain in its drawer. */
  compact?: boolean;
  feedback?: boolean;
  /** The Play demo's line after its seal, shown in place of the queue until the streamer moves on. */
  resolved?: { choice: 'pass' | 'bar'; on_next: () => void } | undefined;
  /** One line describing an open Steward draft, so the picture shows it while the sheet is raised. */
  ribbon?: string | undefined;
}) {
  const [index, setIndex] = useState(0);
  const at = Math.min(index, Math.max(0, state.held.length - 1));
  const item = state.held[at];
  const demo_held = !!demo && demo.stage !== 'burst';
  const done = !demo && resolved ? resolved : undefined;
  const waiting = state.held.length + (demo_held ? 1 : 0);
  if (part === 'picture') return <div className="gh-picture" data-demo={demo?.stage}>
    <GateArt waiting={waiting} simulated />
    <span className="gh-picture__label">SIMULATED · {waiting} held · stylised illustration</span>
    {ribbon && <p className="gh-ribbon"><span className="cc-stamp cc-stamp--draft">Draft</span>{ribbon}</p>}
  </div>;
  return <aside className="cc-panel gh-gate moderator-held-plate" aria-label={copy.held} data-demo={demo?.stage} data-part={part} data-compact={compact ? 'true' : undefined}>
    {ribbon && <p className="gh-ribbon"><span className="cc-stamp cc-stamp--draft">Draft</span>{ribbon}</p>}
    <div className="gh-gate__head">
      <div>{part === 'full' && <h2 className="cc-panel__title">{copy.held}</h2>}{!compact && <span className="cc-panel__aside">{copy.held_gloss}</span>}</div>
      <div className="gh-count"><b>{waiting}</b><span><small>{copy.held_unit}</small><small>{copy.fixture_only}</small></span></div>
    </div>
    {part === 'full' && <div className="gh-art"><div className="cc-mini" data-chamber="moderator"><div className="cc-mini__field cc-diaper">
      <GateArt waiting={waiting} simulated /></div></div></div>}
    <div className="gh-gate__main">
      {demo && <Burst held={demo_held} />}
      {demo_held ? <DemoHeld choice={demo.choice} /> : done ? <DemoHeld choice={done.choice} resolved /> : item ? <article key={item.decision_id} data-verdict="hold" className="gh-held moderator-held">
        <div className="gh-held__meta"><span className="cc-stamp cc-stamp--held cc-stamp--inked">{copy.hold}</span><span className="cc-hash">{item.message_id}</span>
          {!compact && <span className="gh-held__state">{state.phases.get(item.decision_id)?.kind === 'confirming' ? copy.held_pending : copy.held_state}</span>}</div>
        <blockquote className="gh-held__msg">{item.message_text ?? copy.original_unavailable}</blockquote>
        <p className="gh-held__why"><b>{copy.held_reason}</b>{fixtureHoldReasons.get(item.message_id) ?? copy.hold_reason_unavailable}</p>
      </article> : !demo && <EmptyState compact title={copy.clear} description="Nothing waits for you. New holds appear here, one at a time." />}
      {feedback && <p role="status" data-review-feedback="true" className="gh-notice">{state.notice}</p>}
    </div>
    <div className="gh-gate__side">
      {done && <button type="button" className="cc-btn cc-btn--sm" onClick={done.on_next}>
        {state.held.length ? `Back to the held queue · ${state.held.length}` : 'Back to the gate'}</button>}
      {!compact && !demo_held && !done && item && state.held.length > 1 && <div className="gh-pager" role="group" aria-label="Held messages">
        <button type="button" className="cc-btn cc-btn--sm" disabled={at === 0} onClick={() => setIndex(at - 1)}>Previous</button>
        <span>{at + 1} of {state.held.length}</span>
        <button type="button" className="cc-btn cc-btn--sm" disabled={at >= state.held.length - 1} onClick={() => setIndex(at + 1)}>Next</button></div>}
      {!demo_held && !done && item && <HeldActions item={item} state={state} queue={queue} />}
      {demo_held && <p className="gh-gate__steward">Decide in the Steward below. Nothing acts until you hold to seal.</p>}
    </div>
  </aside>;
}
