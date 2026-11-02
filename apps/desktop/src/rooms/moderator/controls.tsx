import type { ChatDelay } from '@castle-control/contract';
import { useId } from 'react';
import { HeraldicCard, HeroReadout, Plate, PlateBand, PlateBody, SectionHeading, Stamp } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { available, phaseLabel } from '../../moderation-lifecycle.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { GatePlate } from './gate.jsx';
import { proposeCommand } from './session.js';

type Props = { state: ModerationPreview; queue: ProposalQueue };
export { HeldActions } from './gate.jsx';

/** Pending bans need a human: one warrant per ban, the original quoted, the rule named. */
export function BanQueue({ state, queue }: Props) {
  if (!state.bans.length) return <section className="gh-bans moderator-ban" aria-label={copy.bans}><p className="gh-sm">{copy.no_bans}</p></section>;
  return <section className="gh-bans moderator-ban" aria-label={copy.bans}>
    {state.bans.map(item => <article key={item.decision_id} className="cc-sheet gh-warrant" aria-label={copy.pending_ban}>
      <span className="cc-folio-shield cc-folio-shield--lg" aria-hidden="true"><i className="cc-folio-charge cc-folio-charge--portcullis" /></span>
      <div className="gh-warrant__meta"><span className="cc-stamp cc-stamp--blocked cc-stamp--inked">{state.phases.get(item.decision_id)?.kind === 'confirming'
        ? phaseLabel(state.phases.get(item.decision_id) ?? { kind: 'ban_pending' }) : copy.pending_ban}</span>
        <span className="cc-hash">{item.message_id}</span><em>{copy.human_review}</em></div>
      <blockquote className="gh-warrant__msg">{item.message_text ?? copy.original_unavailable}</blockquote>
      <p className="gh-warrant__rule"><b>{copy.rule_label}</b> {state.rules.find(rule => rule.rule_id === item.rule_id)?.name ?? copy.unavailable}</p>
      <span id={`moderator-ban-${item.decision_id}`} className="moderator-visually-hidden">{item.message_id}</span>
      <div className="gh-warrant__act">{(['ban', 'dismiss'] as const).map(kind => <button key={kind} type="button"
        className={kind === 'ban' ? 'cc-btn cc-btn--rubric' : 'cc-btn'} aria-describedby={`moderator-ban-${item.decision_id}`}
        disabled={!available(state, item.decision_id).includes(kind)}
        onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'ban' ? 'Ban · human review' : 'Dismiss ban')}>
        {kind === 'ban' ? copy.propose_ban : copy.propose_dismiss}</button>)}</div>
    </article>)}
  </section>;
}

/** The held queue and the ban review together, as the tests and the README describe them. */
export function HeldQueue({ state, queue }: Props) {
  return <><GatePlate state={state} queue={queue} /><BanQueue state={state} queue={queue} /></>;
}

/** The drawbridge is the emergency control, so it stays on the room's face. */
export function ShieldButton({ state, queue }: Props) {
  return <div role="group" aria-label={copy.shield_label} className="gh-shield">
    <button type="button" className="cc-btn cc-btn--rubric" aria-pressed={state.shield.value} disabled={state.shield.kind === 'confirming'}
      onClick={() => proposeCommand(queue, { kind: 'shield' }, state.shield.value ? 'Lower the drawbridge' : 'Raise the drawbridge')}>
      {state.shield.value ? copy.lower_bridge : copy.shield}{' '}<small>{copy.shield_label}</small></button>
  </div>;
}

export function GateControls({ state, queue }: Props) {
  const delay_id = useId();
  return <Plate ink="azure" offset="space-8" className="moderator-moat" aria-label={copy.moat_title}
    band={<PlateBand title={copy.moat_title} gloss={copy.moat_gloss} count={<Stamp kind="simulated" word={copy.simulated} />} />}>
    <PlateBody>
      <div className="moderator-moat-top"><HeroReadout value={String(state.delay.value)} unit={copy.seconds_unit} ghost="none" caption_style="label" caption={copy.delay_applied} />
        <div className="moderator-bridge"><svg viewBox="0 0 56 34" aria-hidden="true"><path d="M3 33V7h4V3h5v4h4V3h5v4h4v26M9 33V23a5 5 0 0 1 10 0v10M25 32h29M21 10l31 21" /></svg>
          <b>{state.shield.value ? copy.bridge_up : copy.bridge_down}</b><span>{state.shield.value ? copy.shield_on_state : copy.shield_off_state}</span></div></div>
      <svg className="moderator-moat-gauge" viewBox="0 0 300 22" preserveAspectRatio="none" aria-hidden="true">
        {[2, 4, 6].map((value, index) => <rect key={value} x={1 + index * 101} y="1" width="96" height="20" data-on={state.delay.value >= value} />)}
        <path d="M4 8q8-5 16 0t16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="moderator-moat-stops"><span><span aria-current={state.delay.value === 0 ? 'true' : undefined}>{copy.delay_off}</span>
        <span aria-current={state.delay.value === 2 ? 'true' : undefined}>{copy.delay_seconds(2)}</span></span>
        {[4, 6].map(value => <span key={value} aria-current={state.delay.value === value ? 'true' : undefined}>{copy.delay_seconds(value)}</span>)}</div>
      <div className="moderator-moat-row" aria-busy={(state.delay.kind === 'confirming') || (state.shield.kind === 'confirming')}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          <label htmlFor={delay_id}>{copy.propose_delay}</label><select id={delay_id} value={state.delay.value} disabled={(state.delay.kind === 'confirming')}
          aria-description={state.delay.kind === 'confirming' ? copy.gate_pending : undefined}
          onChange={event => {
            const value = Number(event.currentTarget.value);
            if ([0, 2, 4, 6].includes(value)) proposeCommand(queue, { kind: 'delay', delay_s: value as ChatDelay }, `Set chat delay to ${value} s`);
          }}><option value={0}>{copy.delay_off}</option>{[2, 4, 6].map(value => <option key={value} value={value}>{copy.delay_seconds(value)}</option>)}</select></span>
      </div>
    </PlateBody>
  </Plate>;
}

export function Rules({ state, queue }: Props) {
  const armed = state.rules.filter(rule => state.preview_modes.get(rule.rule_id) === 'armed').length;
  return <section className="moderator-block moderator-orders"><SectionHeading title={copy.orders_title} gloss={copy.orders_gloss} count={<Stamp kind="simulated" word={copy.simulated} />} />
    <div className="moderator-figures"><span><b>{armed}</b><Stamp kind="armed" word={copy.armed} /></span><span><b>{state.rules.length - armed}</b><Stamp kind="shadow" word={copy.watching} /></span></div>
    <p className="moderator-note">{copy.modes}</p>
    {state.rules.map(rule => {
      const mode = state.preview_modes.get(rule.rule_id) ?? 'shadow';
      return <HeraldicCard className="moderator-rule-card" key={rule.rule_id}>
        <div className="moderator-rule-text"><b id={`moderator-rule-${rule.rule_id}`}>{rule.name}</b><span><code>{rule.pattern}</code> · {rule.action}</span></div>
        <div className="moderator-rule-side"><Stamp kind={mode} word={mode === 'armed' ? copy.armed : copy.watching} />
          <button className="moderator-text-button" type="button" data-mode={mode} aria-describedby={`moderator-rule-${rule.rule_id}`} onClick={() => proposeCommand(queue,
            { kind: 'mode', rule_id: rule.rule_id, mode: mode === 'shadow' ? 'armed' : 'shadow' }, `${mode === 'shadow' ? 'Arm' : 'Watch'} ${rule.name}`)}>
            {mode === 'armed' ? copy.propose_watch : copy.propose_arm}</button></div>
      </HeraldicCard>;
    })}
  </section>;
}
