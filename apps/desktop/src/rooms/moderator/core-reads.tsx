import { InkButton, RuledFeed, SectionHeading, VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ClockTime } from './presentation.jsx';
import { MessageList } from './messages.jsx';

export function CoreChat({ state, port, scroll_top = 0, marked }: {
  state: CoreGatehouseSnapshot; port: CoreGatehousePort; scroll_top?: number; marked?: ReadonlySet<string> | undefined;
}) {
  const page = state.chat;
  return <MessageList core scroll_top={scroll_top} marked={marked}
    messages={page?.items.map(item => ({ ...item.decision, message_text: item.message.text, at: item.message.at })) ?? []}
    provenance={new Map(page?.items.map(item => [item.decision.decision_id, item.provenance]))}
    notes={<><p>{copy.core_chat_notice}</p>
      <p>{page ? copy.core_loaded(page.items.length, page.unavailable_count) : copy.core_chat_unavailable}</p>
      <p>{copy.core_chat_metadata}</p></>}
    footer={<InkButton size="room" variant="outline" type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreChat(); }}>{copy.core_chat_more}</InkButton>} />;
}

export function CoreHistory({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const page = state.history;
  return <section className="moderator-block moderator-log"><SectionHeading title={copy.ledger} gloss={copy.core_history_gloss} />
    <p>{page ? copy.core_loaded(page.items.length, page.unavailable_count) : copy.core_history_unavailable}</p>
    <p className="moderator-note">{copy.core_history_note}</p>
    <RuledFeed><WindowedRows rows={page?.items ?? []} label={copy.core_history_label} row_height={rowHeight * 5}
      row_key={item => item.decision.decision_id} empty_state={copy.core_history_empty}>
      {item => <article className="moderator-roll-entry moderator-core-read-row" data-decision-row={item.decision.decision_id} data-provenance={item.provenance}>
        <div className="moderator-roll-entry-head"><VerdictChip verdict={item.decision.verdict} /><b>{item.provenance}</b>
          <ClockTime at={item.decision.at} /></div>
        <p>{item.decision.kind.replaceAll('_', ' ')} · {copy.recorded} <ClockTime at={item.recorded_at} /></p>
        <p>{item.decision.decision_id} · {item.decision.rule_id ?? copy.rule_unavailable} · {item.decision.reason_codes.join(', ')}</p>
      </article>}
    </WindowedRows></RuledFeed>
    <InkButton size="room" variant="outline" type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreHistory(); }}>{copy.core_history_more}</InkButton>
  </section>;
}
