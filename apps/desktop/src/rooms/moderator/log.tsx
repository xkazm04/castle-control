import { RuledFeed, SectionHeading, VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { fixtureRules, fixtureTwitchActions } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { proposeCommand } from './session.js';

export function GateLog({ state, queue }: { state: ModerationPreview; queue: ProposalQueue }) {
  return <section className="moderator-block moderator-log"><SectionHeading title={copy.ledger} gloss={copy.gate_log} count={copy.decisions(state.ledger.length)} />
    <RuledFeed className="moderator-ledger-feed">
      <WindowedRows rows={state.ledger} label="Decision ledger" row_key={item => item.decision_id} row_height={rowHeight * 6}>
        {item => <article className="moderator-roll-entry">
          <div className="moderator-roll-entry-head"><VerdictChip verdict={item.verdict} />
            <b>{fixtureRules.rules.find(rule => rule.rule_id === item.rule_id)?.name ?? copy.rule_unavailable}</b>
            <time dateTime={item.at}>{item.at.slice(11, 19)}</time></div>
          <p className="moderator-roll-message" tabIndex={0}>{item.message_text ?? copy.text_unavailable}</p>
          <p className="moderator-small">{(state.operations.get(item.decision_id) ?? item.kind).replaceAll('_', ' ')} · {item.reason_codes.join(', ')} · {fixtureTwitchActions.has(item.decision_id) ? copy.twitch_human : copy.local_human}</p>
          <div className="moderator-roll-entry-actions">{(item.kind === 'timed_out' || item.kind === 'banned' || state.operations.has(`${item.decision_id}:ban`))
            ? <button className="moderator-text-button" type="button" disabled={state.operations.has(`${item.decision_id}:undo`)}
              onClick={() => proposeCommand(queue, { kind: 'undo', decision_id: item.decision_id }, 'Undo decision')}>{copy.propose_undo}</button>
            : <span className="moderator-small">{copy.no_undo}</span>}
            <button className="moderator-text-button" type="button" disabled={state.operations.has(`${item.decision_id}:petition`)}
              onClick={() => proposeCommand(queue, { kind: 'petition', decision_id: item.decision_id }, 'Petition decision')}>{copy.propose_petition}</button></div>
        </article>}
      </WindowedRows>
    </RuledFeed>
  </section>;
}
