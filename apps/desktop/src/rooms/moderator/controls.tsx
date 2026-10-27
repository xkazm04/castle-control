import type { ChatDelay, Decision } from '@castle-control/contract';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { fixtureHoldReasons, fixtureRules } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { proposeCommand } from './session.js';

type Props = { state: ModerationPreview; queue: ProposalQueue };
export function HeldActions({ item, pending, queue }: { item: Decision; pending: boolean; queue: ProposalQueue }) {
  return <div className="moderator-actions">{(['release', 'remove'] as const).map(kind => <button type="button" key={kind}
    disabled={pending || !item.message_text} onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'release' ? 'Pass held message' : 'Bar held message')}>
    {kind === 'release' ? 'Propose Pass' : 'Propose Bar'}</button>)}</div>;
}

export function HeldQueue({ state, queue }: Props) {
  return <section className="room-stage moderator-portcullis"><h2>{copy.held} · held for human review</h2>
    <p className="room-now">Now: {state.held.length} held · {state.bans.length} pending ban · simulated</p><p>{copy.gate_gloss}</p>
    {state.held.length ? state.held.map(item => <article key={item.decision_id} data-verdict="hold" className="moderator-held">
      <b>{item.message_id}</b><blockquote>{item.message_text ?? copy.original_unavailable}</blockquote>
      <p>{copy.held_reason}: {fixtureHoldReasons.get(item.message_id) ?? copy.hold_reason_unavailable}</p>
      <p>{state.held_pending.has(item.decision_id) ? copy.held_pending : copy.held_state}</p>
      <HeldActions item={item} pending={state.held_pending.has(item.decision_id)} queue={queue} />
    </article>) : <p>{copy.clear}</p>}
    <section className="moderator-ban"><h3>{copy.bans} · human review</h3>
      {state.bans.map(item => <article key={item.decision_id}><blockquote>{item.message_text ?? copy.original_unavailable}</blockquote>
        <p>Rule: {fixtureRules.rules.find(rule => rule.rule_id === item.rule_id)?.name ?? 'Unavailable'}</p>
        {(['ban', 'dismiss'] as const).map(kind => <button key={kind} type="button" disabled={!item.message_text || !fixtureRules.rules.some(rule => rule.rule_id === item.rule_id)}
          onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'ban' ? 'Ban · human review' : 'Dismiss ban')}>
          Propose {kind === 'ban' ? 'Ban' : 'Dismiss'}</button>)}
      </article>)}
      {!state.bans.length && <p>No pending simulated bans.</p>}
    </section>
  </section>;
}

export function GateControls({ state, queue }: Props) {
  return <section className="moderator-gate moderator-card"><h3>The moat · chat delay</h3>
    <p className="room-now">Now: {state.delay_s} s delay · {state.shield ? 'Bridge up' : 'Bridge down'} · simulated</p>
    <div className="moderator-gauge" aria-hidden="true">{[2, 4, 6].map(value => <i key={value} data-on={state.delay_s >= value} />)}</div>
    <p>Applied chat delay: {state.delay_s} s</p>
    <label>Propose chat delay <select aria-label={copy.delay_applied} value={state.delay_s} disabled={state.delay_pending}
      onChange={event => {
        const value = Number(event.currentTarget.value);
        if ([0, 2, 4, 6].includes(value)) proposeCommand(queue, { kind: 'delay', delay_s: value as ChatDelay }, `Set chat delay to ${value} s`);
      }}><option value={0}>Off</option>{[2, 4, 6].map(value => <option key={value} value={value}>{value} s</option>)}</select></label>
    <div aria-busy={state.delay_pending || state.shield_pending}><p role="status">{state.notice}</p></div>
    <button type="button" aria-label={copy.shield_label} aria-pressed={state.shield} disabled={state.shield_pending}
      onClick={() => proposeCommand(queue, { kind: 'shield' }, state.shield ? 'Lower the drawbridge' : 'Raise the drawbridge')}>
      {state.shield ? copy.shield_on : copy.shield}</button>
  </section>;
}

export function Rules({ state, queue }: Props) {
  const armed = fixtureRules.rules.filter(rule => state.preview_modes.get(rule.rule_id) === 'armed').length;
  return <section className="moderator-card"><h3>Garrison orders · Gate rules</h3>
    <p className="room-now">Now: {armed} Armed · {fixtureRules.rules.length - armed} Watching · simulated</p><p>{copy.modes}</p>
    {fixtureRules.rules.map(rule => {
      const mode = state.preview_modes.get(rule.rule_id) ?? 'shadow';
      return <div className="moderator-rule" key={rule.rule_id}><b>{rule.name}</b><span>{rule.pattern} · {rule.action}</span>
        <button type="button" data-mode={mode} onClick={() => proposeCommand(queue,
          { kind: 'mode', rule_id: rule.rule_id, mode: mode === 'shadow' ? 'armed' : 'shadow' }, `${mode === 'shadow' ? 'Arm' : 'Watch'} ${rule.name}`)}>
          {mode === 'armed' ? 'Armed' : 'Watching'} · propose change</button></div>;
    })}
  </section>;
}
