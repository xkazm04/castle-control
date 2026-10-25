import { useMemo, useState } from 'react';
import type { Decision, Verdict } from '@castle-control/contract';
import { InkButton, VerdictChip } from '@castle-control/ui';
import { WindowedRows } from './moderation-window.jsx';
export { rowWindow as messageWindow } from './moderation-window.jsx';

export function MessageList({ messages, scroll_top = 0 }: { messages: readonly Decision[]; scroll_top?: number }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const [paused, setPaused] = useState(false);
  const filtered = useMemo(() => messages.filter(message => (filter === 'all' || message.verdict === filter)
    && `${message.message_id} ${message.message_text ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [messages, query, filter]);
  return <div className="moderation-message-box">
    <div className="moderation-toolbar">
      <label>Verdict <select value={filter} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'all' || value === 'pass' || value === 'hold' || value === 'bar') setFilter(value);
      }}><option value="all">All</option><option value="pass">Pass</option><option value="hold">Hold</option><option value="bar">Bar</option></select></label>
      <label>Search the room <input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label>
      <InkButton size="small" variant="ghost" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume preview' : 'Pause live'}</InkButton>
    </div>
    <p className="moderation-meta">Simulated snapshot · {messages.length.toLocaleString('en-US')} lines · {filtered.length.toLocaleString('en-US')} matching · {paused ? 'paused' : 'no live intake'}</p>
    <WindowedRows key={`${filter}:${query}`} rows={filtered} label="Chat messages with Pass, Hold or Bar" scroll_top={scroll_top} row_key={row => row.message_id}>
      {message => <div className="moderation-chat-row" data-message-row={message.message_id} data-verdict={message.verdict}>
        <time role="cell" dateTime={message.at}>{message.at.slice(11, 19)}</time>
        <span role="cell"><VerdictChip verdict={message.verdict} /></span>
        <span role="cell" className="moderation-message-text" title={message.message_text}>{message.message_text ?? 'Message text unavailable'}</span>
      </div>}
    </WindowedRows>
  </div>;
}
