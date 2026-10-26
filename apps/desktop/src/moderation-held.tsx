import type { Decision } from '@castle-control/contract';
import { EmptyState, InkButton, NumberedPanel, ReviewRow, VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { ModerationPort, ModerationPreview } from './moderation-model.js';
import { fixtureHoldReasons } from './moderation-fixture.js';
import { GateControls } from './moderation-gate-controls.jsx';
import { moderationCopy as copy } from './moderation-copy.js';

export function HeldActions({ item, pending, send }: { item: Decision; pending: boolean; send: ModerationPort['send'] }) {
  return <>
    <InkButton size="small" disabled={pending || !item.message_text}
      onClick={() => send({ kind: 'release', decision_id: item.decision_id })}>{copy.allow}</InkButton>
    <InkButton size="small" disabled={pending || !item.message_text}
      onClick={() => send({ kind: 'remove', decision_id: item.decision_id })}>{copy.deny}</InkButton>
  </>;
}

export function HeldQueue({ snapshot, send }: { snapshot: ModerationPreview; send: ModerationPort['send'] }) {
  return <NumberedPanel number="2.4" title={copy.held} gloss={copy.gate_gloss} meta={copy.held_count(snapshot.held.length)}>
    <GateControls snapshot={snapshot} send={send} />
    {snapshot.held.length ? <WindowedRows empty_state={copy.empty} rows={snapshot.held} label={copy.held_label}
      row_key={item => item.decision_id} row_height={rowHeight * 5}>
      {item => <ReviewRow quote={item.message_text ?? copy.original_unavailable}
        heading={<><VerdictChip verdict="hold" /> <span role="status">{snapshot.held_pending.has(item.decision_id) ? copy.held_pending : copy.held_state}</span></>}
        detail={<>{copy.held_reason}: {fixtureHoldReasons.get(item.message_id) ?? copy.hold_reason_unavailable}</>}
        actions={<HeldActions item={item} pending={snapshot.held_pending.has(item.decision_id)} send={send} />} />}
    </WindowedRows> : <EmptyState title={copy.clear} description={copy.held_empty} />}
  </NumberedPanel>;
}
