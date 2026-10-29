import { useMemo, useState } from 'react';
import type { Verdict } from '@castle-control/contract';
import { VerdictChip, WindowedRows, rowHeight } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';

export function CoreChat({ state, port, scroll_top = 0 }: {
  state: CoreGatehouseSnapshot; port: CoreGatehousePort; scroll_top?: number;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const page = state.chat;
  const rows = useMemo(() => page?.items.filter(item => (filter === 'all' || item.decision.verdict === filter)
    && `${item.message.message_id} ${item.message.text}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [page, query, filter]);
  return <section className="moderator-messages moderator-card"><h2>The live room · core chat</h2>
    <p>Retained intake · provenance on each row. Refresh Gatehouse for current data.</p>
    <p>{page ? `${page.items.length} loaded · unavailable_count: ${page.unavailable_count}` : 'Chat read unavailable.'}</p>
    <p>Unavailable entries lack retained text or trustworthy metadata; their verdict and provenance are not invented.</p>
    <div className="moderator-toolbar"><label>Core verdict<select value={filter} onChange={event => {
      const value = event.currentTarget.value;
      if (value === 'all' || value === 'pass' || value === 'hold' || value === 'bar') setFilter(value);
    }}><option value="all">All</option><option value="pass">Pass</option><option value="hold">Hold</option><option value="bar">Bar</option></select></label>
      <label>Search core chat<input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label></div>
    <WindowedRows rows={rows} key={`${filter}:${query}`} label="Core chat messages" scroll_top={scroll_top}
      row_height={rowHeight * 2} row_key={item => item.decision.decision_id} empty_state="No retained chat in the loaded pages.">
      {item => <div className="moderator-core-read-row" data-message-row={item.message.message_id} data-provenance={item.provenance}>
        <VerdictChip verdict={item.decision.verdict} /> <b>{item.provenance}</b>{' '}
        <time dateTime={item.message.at}>{item.message.at}</time>
        <p title={item.message.text}>{item.message.text}</p>
      </div>}
    </WindowedRows>
    <button type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreChat(); }}>Load more chat</button>
  </section>;
}

export function CoreHistory({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const page = state.history;
  return <section className="moderator-card"><h2>The gate roll · core decision history</h2>
    <p>{page ? `${page.items.length} loaded · unavailable_count: ${page.unavailable_count}` : 'History read unavailable.'}</p>
    <p>Legacy or erased metadata is counted as unavailable. History contains no original message or action authority.</p>
    <WindowedRows rows={page?.items ?? []} label="Core decision history" row_height={rowHeight * 3}
      row_key={item => item.decision.decision_id} empty_state="No retained decisions in the loaded pages.">
      {item => <div className="moderator-core-read-row" data-decision-row={item.decision.decision_id} data-provenance={item.provenance}>
        <VerdictChip verdict={item.decision.verdict} /> <b>{item.provenance}</b> · {item.decision.kind.replaceAll('_', ' ')}
        <p><time dateTime={item.decision.at}>{item.decision.at}</time> · recorded <time dateTime={item.recorded_at}>{item.recorded_at}</time></p>
        <p>{item.decision.decision_id} · {item.decision.rule_id ?? 'Rule unavailable'} · {item.decision.reason_codes.join(', ')}</p>
      </div>}
    </WindowedRows>
    <button type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreHistory(); }}>Load more history</button>
  </section>;
}
