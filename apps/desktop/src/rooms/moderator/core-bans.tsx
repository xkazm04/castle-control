import { useEffect } from 'react';
import type { Rule } from '@castle-control/contract';
import { EmptyState } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { BAN_REVIEW_S } from '../../gatehouse-core-bans.js';

/** Dress rehearsal polls the core's reads for new proposals; it never marks the room busy. */
const POLL_MS = 2500;
const ARM_REASON = 'Armed by the streamer in Dress rehearsal; generated SIMULATED chat only';

const ruleName = (rules: readonly Rule[], rule_id?: string) => rules.find(rule => rule.rule_id === rule_id)?.name ?? 'Unavailable rule';
const viewer = (user_id?: string) => user_id ? `SIMULATED viewer ${user_id}` : 'SIMULATED viewer';
const outcomeText: Record<string, string> = {
  ban_confirmed: 'SIMULATED ban recorded',
  ban_dismissed: 'Ban dismissed',
  review_expired_or_withheld: 'Review expired · held, not banned',
};

/**
 * Dress rehearsal's ban review. Proposals come from an armed rule over generated chat; a
 * confirmed ban is a SIMULATED record in the rehearsal store. There is no Twitch session,
 * so nothing is sent anywhere.
 */
export function CoreBanReview({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  useEffect(() => {
    void port.refreshBans();
    const timer = setInterval(() => { void port.refreshBans(); }, POLL_MS);
    return () => { clearInterval(timer); };
  }, [port]);
  const review = state.bans;
  const armed = state.rules.filter(rule => rule.mode === 'armed' && rule.rule_class !== 'rail').length;
  return <section className="gh-bans moderator-ban" aria-label="Ban review · SIMULATED">
    <p className="gh-sm"><span className="cc-stamp cc-stamp--inked">SIMULATED</span>{' '}
      {armed ? `${armed} armed rule${armed === 1 ? '' : 's'} watching generated chat. Bans need your confirmation.`
        : 'Arm a rule to let the moderator propose bans from generated chat.'}</p>
    {!review?.pending.length ? <EmptyState compact title="No proposed bans" />
      : review.pending.map(item => <article key={item.decision_id} className="cc-sheet gh-warrant" aria-label="Proposed ban · SIMULATED">
        <div className="gh-warrant__meta"><span className="cc-stamp cc-stamp--blocked cc-stamp--inked">Proposed ban</span>
          <span>{viewer(item.user_id)}</span><em>Confirm within {BAN_REVIEW_S} s</em></div>
        <blockquote className="gh-warrant__msg">{item.text ?? 'Original line unavailable'}</blockquote>
        <p className="gh-warrant__rule"><b>Rule</b> {ruleName(state.rules, item.rule_id)}</p>
        <div className="gh-warrant__act">
          <button type="button" className="cc-btn cc-btn--rubric" disabled={state.busy}
            onClick={() => { void port.confirmBan({ decision_id: item.decision_id }).then(port.refreshBans); }}>Confirm SIMULATED ban</button>
          <button type="button" className="cc-btn" disabled={state.busy}
            onClick={() => { void port.dismissBan({ decision_id: item.decision_id }).then(port.refreshBans); }}>Dismiss</button>
        </div>
      </article>)}
    {!!review?.expired && <p className="gh-sm">{review.expired} older proposal{review.expired === 1 ? '' : 's'} expired unreviewed; none was banned.</p>}
    {!!review?.outcomes.length && <ul aria-label="Ban decisions · SIMULATED">{review.outcomes.map(item => <li key={item.decision_id}>
      {outcomeText[item.reason] ?? item.reason} · {viewer(item.user_id)} · {ruleName(state.rules, item.rule_id)}
      {item.reason === 'ban_confirmed' ? ' · rehearsal store only, nothing sent to Twitch' : ''}</li>)}</ul>}
  </section>;
}

/** Arming in dress rehearsal: the streamer's click is the acknowledgement the core logs first. */
export function CoreRuleMode({ rule, busy, port }: { rule: Rule; busy: boolean; port: CoreGatehousePort }) {
  if (rule.rule_class === 'rail') return null;
  const armed = rule.mode === 'armed';
  return <button type="button" className={armed ? 'cc-btn cc-btn--sm' : 'cc-btn cc-btn--rubric cc-btn--sm'} disabled={busy}
    aria-label={`${armed ? 'Back to watching' : 'Arm in rehearsal'}: ${rule.name}`}
    onClick={() => { void port.setRuleMode(rule.rule_id, armed ? 'shadow' : 'armed', ARM_REASON); }}>
    {armed ? 'Back to watching' : 'Arm in rehearsal'}</button>;
}
