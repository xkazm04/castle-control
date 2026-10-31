import type { ChatDelay, Decision } from '@castle-control/contract';
import { HeraldicCard, HeroReadout, InkButton, Plate, PlateActions, PlateBand, PlateBody, SectionHeading, StatusChip } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { fixtureHoldReasons } from '../../moderation-fixture.js';
import { available, phaseLabel } from '../../moderation-lifecycle.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { CountLabel, ReviewMeta, VerdictIcon } from './presentation.jsx';
import { proposeCommand } from './session.js';

type Props = { state: ModerationPreview; queue: ProposalQueue };
const smallBig = { minHeight: 'var(--button-h)', fontSize: 'var(--text-label)' };
export function HeldActions({ item, state, queue }: { item: Decision; state: ModerationPreview; queue: ProposalQueue }) {
  const choices = available(state, item.decision_id);
  return <PlateActions>{(['release', 'remove'] as const).map(kind => <InkButton type="button" key={kind}
    size="big" variant={kind === 'release' ? 'pass' : 'bar'} ink="azure" aria-label={kind === 'release' ? copy.propose_pass : copy.propose_bar}
    disabled={!choices.includes(kind)} onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'release' ? 'Pass held message' : 'Bar held message')}>
    <VerdictIcon verdict={kind === 'release' ? 'pass' : 'bar'} />{kind === 'release' ? copy.propose_pass : copy.propose_bar}</InkButton>)}</PlateActions>;
}

export function HeldQueue({ state, queue }: Props) {
  return <>
    <Plate ink="azure" offset="space-8" className="moderator-held-plate" aria-label={copy.held}
      band={<PlateBand title={copy.held} gloss={copy.held_gloss}
        count={<>{state.held.length}<CountLabel first={copy.held_unit} second={copy.fixture_only} /></>} />}>
      <PlateBody><p role="status" data-review-feedback="true" className="moderator-small">{state.notice}</p>{state.held.length ? state.held.map(item => <article key={item.decision_id} data-verdict="hold" className="moderator-held">
        <ReviewMeta verdict="hold" id={item.message_id} status={state.phases.get(item.decision_id)?.kind === 'confirming' ? copy.held_pending : copy.held_state} />
        <blockquote className="moderator-plate-quote">{item.message_text ?? copy.original_unavailable}</blockquote>
        <p className="moderator-plate-reason"><b>{copy.held_reason}</b>{fixtureHoldReasons.get(item.message_id) ?? copy.hold_reason_unavailable}</p>
        <HeldActions item={item} state={state} queue={queue} />
      </article>) : <p>{copy.clear}</p>}</PlateBody>
    </Plate>
    <section className="moderator-block moderator-ban">
      <SectionHeading title={copy.bans} gloss={copy.human_review} count={copy.pending_bans(state.bans.length)} />
      {state.bans.map(item => <HeraldicCard key={item.decision_id} tone="bar" aria-label={copy.pending_ban}>
        <ReviewMeta verdict={item.verdict} id={item.message_id} status={state.phases.get(item.decision_id)?.kind === 'confirming'
          ? phaseLabel(state.phases.get(item.decision_id) ?? { kind: 'ban_pending' }) : copy.pending_ban} />
        <blockquote className="moderator-card-quote">{item.message_text ?? copy.original_unavailable}</blockquote>
        <p className="moderator-small">{copy.rule_label}: {state.rules.find(rule => rule.rule_id === item.rule_id)?.name ?? copy.unavailable}</p>
        <div className="moderator-card-actions">{(['ban', 'dismiss'] as const).map(kind => <InkButton key={kind} type="button"
          size="big" style={smallBig} variant={kind === 'ban' ? 'bar' : 'outline'}
          disabled={!available(state, item.decision_id).includes(kind)}
          onClick={() => proposeCommand(queue, { kind, decision_id: item.decision_id }, kind === 'ban' ? 'Ban · human review' : 'Dismiss ban')}>
          {kind === 'ban' ? copy.propose_ban : copy.propose_dismiss}</InkButton>)}</div>
      </HeraldicCard>)}
      {!state.bans.length && <p>{copy.no_bans}</p>}
    </section>
  </>;
}

export function GateControls({ state, queue }: Props) {
  return <Plate ink="azure" offset="space-8" className="moderator-moat" aria-label={copy.moat_title}
    band={<PlateBand title={copy.moat_title} gloss={copy.moat_gloss} count={<CountLabel first={copy.simulated} />} />}>
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
        <label>{copy.propose_delay} <select aria-label={copy.delay_applied} value={state.delay.value} disabled={(state.delay.kind === 'confirming')}
          onChange={event => {
            const value = Number(event.currentTarget.value);
            if ([0, 2, 4, 6].includes(value)) proposeCommand(queue, { kind: 'delay', delay_s: value as ChatDelay }, `Set chat delay to ${value} s`);
          }}><option value={0}>{copy.delay_off}</option>{[2, 4, 6].map(value => <option key={value} value={value}>{copy.delay_seconds(value)}</option>)}</select></label>
        <span className="moderator-status" role="status">{state.notice}</span>
      </div>
      <InkButton type="button" size="big" variant="shield" aria-label={copy.shield_label} aria-pressed={state.shield.value} disabled={(state.shield.kind === 'confirming')}
        onClick={() => proposeCommand(queue, { kind: 'shield' }, state.shield.value ? 'Lower the drawbridge' : 'Raise the drawbridge')}>
        {state.shield.value ? copy.lower_bridge : copy.shield}<small>{copy.shield_label}</small></InkButton>
    </PlateBody>
  </Plate>;
}

export function Rules({ state, queue }: Props) {
  const armed = state.rules.filter(rule => state.preview_modes.get(rule.rule_id) === 'armed').length;
  return <section className="moderator-block moderator-orders"><SectionHeading title={copy.orders_title} gloss={copy.orders_gloss} count={copy.simulated} />
    <div className="moderator-figures"><span><b>{armed}</b>{copy.armed}</span><span><b>{state.rules.length - armed}</b>{copy.watching}</span></div>
    <p className="moderator-note">{copy.modes}</p>
    {state.rules.map(rule => {
      const mode = state.preview_modes.get(rule.rule_id) ?? 'shadow';
      return <HeraldicCard className="moderator-rule-card" key={rule.rule_id}>
        <div className="moderator-rule-text"><b>{rule.name}</b><span><code>{rule.pattern}</code> · {rule.action}</span></div>
        <div className="moderator-rule-side"><StatusChip variant="azure" stamp="mode" ink="azure" tone={mode === 'armed' ? 'solid' : 'neutral'}>
          {mode === 'armed' ? copy.armed : copy.watching}</StatusChip>
          <button className="moderator-text-button" type="button" data-mode={mode} onClick={() => proposeCommand(queue,
            { kind: 'mode', rule_id: rule.rule_id, mode: mode === 'shadow' ? 'armed' : 'shadow' }, `${mode === 'shadow' ? 'Arm' : 'Watch'} ${rule.name}`)}>
            {mode === 'armed' ? copy.propose_watch : copy.propose_arm}</button></div>
      </HeraldicCard>;
    })}
  </section>;
}
