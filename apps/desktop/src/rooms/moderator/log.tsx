import { VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { fixtureRules, fixtureTwitchActions } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { proposeCommand } from './session.js';

export function GateLog({ state, queue }: { state: ModerationPreview; queue: ProposalQueue }) {
  return <section className="moderator-card"><h3>Gate log · {copy.ledger}</h3>
    <p className="room-now">Now: {state.ledger.length} decisions · simulated</p>
    <WindowedRows rows={state.ledger} label="Decision ledger" row_key={item => item.decision_id} row_height={rowHeight * 5}>
      {item => <article className="moderator-log-row"><time dateTime={item.at}>{item.at.slice(11, 19)}</time> <VerdictChip verdict={item.verdict} />
        <b>{fixtureRules.rules.find(rule => rule.rule_id === item.rule_id)?.name ?? 'Rule unavailable'}</b>
        <p>{(state.operations.get(item.decision_id) ?? item.kind).replaceAll('_', ' ')} · {item.reason_codes.join(', ')}</p>
        <p>{fixtureTwitchActions.has(item.decision_id) ? copy.twitch_human : copy.local_human}</p>
        <div className="moderator-actions">{(item.kind === 'timed_out' || item.kind === 'banned' || state.operations.has(`${item.decision_id}:ban`))
          ? <button type="button" disabled={state.operations.has(`${item.decision_id}:undo`)}
            onClick={() => proposeCommand(queue, { kind: 'undo', decision_id: item.decision_id }, 'Undo decision')}>Propose Undo</button>
          : <span>No undo on Twitch</span>}
          <button type="button" disabled={state.operations.has(`${item.decision_id}:petition`)}
            onClick={() => proposeCommand(queue, { kind: 'petition', decision_id: item.decision_id }, 'Petition decision')}>Propose Petition</button></div>
      </article>}
    </WindowedRows>
  </section>;
}
