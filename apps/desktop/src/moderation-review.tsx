import type { Decision, Rule } from '@castle-control/contract';
import { EmptyState, InkButton, NumberedPanel, ReviewRow, VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { ModerationPort, ModerationPreview } from './moderation-model.js';
import { moderationCopy as copy } from './moderation-copy.js';

type ReviewProps = { snapshot: ModerationPreview; rules: readonly Rule[]; send: ModerationPort['send'] };
function ruleName(decision: Decision, rules: readonly Rule[]) {
  return rules.find(rule => rule.rule_id === decision.rule_id)?.name ?? 'Rule unavailable';
}
export function ReviewQueues({ snapshot, rules, send }: ReviewProps) {
  return <>
    <NumberedPanel number="2.4" title={copy.held} gloss="Held for review" meta={`${snapshot.held.length} held`}>
      {snapshot.held.length ? <WindowedRows empty_state="No matching entries." rows={snapshot.held} label="Held messages" row_key={item => item.decision_id} row_height={rowHeight * 4}>
        {item => <ReviewRow quote={item.message_text ?? 'Original message unavailable'} detail={<>{ruleName(item, rules)} · simulated hold</>}
          actions={<><InkButton size="small" onClick={() => send({ kind: 'release', decision_id: item.decision_id })}>{copy.pass}</InkButton>
            <InkButton size="small" onClick={() => send({ kind: 'remove', decision_id: item.decision_id })}>{copy.strike}</InkButton></>} />}
      </WindowedRows> : <EmptyState title={copy.clear} description="Nothing is held in this simulated queue." />}
    </NumberedPanel>
    <NumberedPanel number="2.5" title={copy.bans} gloss="Human review · simulated" meta={`${snapshot.bans.length} pending`}>
      {snapshot.bans.length ? <WindowedRows empty_state="No matching entries." rows={snapshot.bans} label="Pending bans" row_key={item => item.decision_id} row_height={rowHeight * 4}>
        {item => <ReviewRow quote={item.message_text ?? 'Original message unavailable — decision blocked'}
          detail={<>Rule: <b>{ruleName(item, rules)}</b></>}
          actions={<><InkButton size="small" variant="danger" disabled={!item.message_text || !rules.some(rule => rule.rule_id === item.rule_id)}
            onClick={() => send({ kind: 'ban', decision_id: item.decision_id })}>{copy.ban}</InkButton>
            <InkButton size="small" variant="ghost" onClick={() => send({ kind: 'dismiss', decision_id: item.decision_id })}>{copy.dismiss}</InkButton></>} />}
      </WindowedRows> : <p>No pending simulated bans.</p>}
    </NumberedPanel>
  </>;
}

export function DecisionList({ snapshot, rules, send }: ReviewProps) {
  return <NumberedPanel number="2.6" title={copy.ledger} gloss="Decision ledger · simulated" meta={`${snapshot.ledger.length} entries`}>
    <WindowedRows empty_state="No matching entries." rows={snapshot.ledger} label="Decision ledger" row_key={item => item.decision_id} row_height={rowHeight * 4}>
      {item => <ReviewRow
        heading={<><time dateTime={item.at}>{item.at.slice(11, 19)}</time> <VerdictChip verdict={item.verdict} /> <b>{ruleName(item, rules)}</b></>}
        detail={<>{(snapshot.operations.get(item.decision_id) ?? item.kind).replaceAll('_', ' ')} · {item.reason_codes.join(', ')}</>}
        actions={<>{item.kind === 'timed_out' || item.kind === 'banned' || snapshot.operations.has(`${item.decision_id}:ban`)
          ? <InkButton size="small" disabled={snapshot.operations.has(`${item.decision_id}:undo`)} onClick={() => send({ kind: 'undo', decision_id: item.decision_id })}>{copy.undo}</InkButton>
          : <small>No undo on Twitch</small>}
          <InkButton size="small" variant="ghost" disabled={snapshot.operations.has(`${item.decision_id}:petition`)} onClick={() => send({ kind: 'petition', decision_id: item.decision_id })}>{copy.petition}</InkButton>
          {snapshot.operations.has(item.decision_id) && <span>{snapshot.operations.get(item.decision_id)} · simulated</span>}
        </>} />}
    </WindowedRows>
  </NumberedPanel>;
}
