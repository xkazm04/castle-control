import { useState } from 'react';
import { cloneElement, useId } from 'react';
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { Decision, Verdict } from '@castle-control/contract';
import { Plate, PlateBand, PlateBody, RuledFeed, RuledRow, WindowedRows } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { CountLabel, VerdictIcon, VerdictMark, verdictWords } from './presentation.jsx';
export { rowWindow as messageWindow } from '@castle-control/ui';

type ReplayDecision = Pick<Decision, 'decision_id' | 'message_id' | 'message_text' | 'at' | 'verdict'>;
export type ReplayProps = {
  messages: readonly ReplayDecision[]; scroll_top?: number; core?: boolean; notes?: ReactNode; footer?: ReactNode;
  provenance?: ReadonlyMap<string, string>; marked?: ReadonlySet<string> | undefined;
};
type Filter = Verdict | 'all' | 'draft';
type Selection = { filter: Filter; query: string; on_filter: (filter: Filter) => void; on_query: (query: string) => void };

function ReplaySearch({ label, count, children }: {
  label: string; count: number; children: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
}) {
  const search_id = useId();
  return <div className="moderator-search"><label htmlFor={search_id}>{label}</label>
    {cloneElement(children, { id: search_id })}<output>{copy.matching(count)}</output></div>;
}

export function MessageList(props: ReplayProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  return <ReplayPanel {...props} filter={filter} query={query} on_filter={setFilter} on_query={setQuery} />;
}

/** Controlled body shared by the fixture replay and retained core intake. */
export function ReplayPanel({ messages, scroll_top = 0, core = false, notes, footer, provenance, marked,
  filter, query, on_filter, on_query }: ReplayProps & Selection) {
  const filtered = messages.filter(message => (filter === 'all' || filter === 'draft' && marked?.has(message.message_id) || message.verdict === filter)
    && `${message.message_id} ${message.message_text ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="moderator-messages">
    <Plate ink="azure" offset="space-8" className="moderator-replay-plate" aria-label={copy.live}
      band={<PlateBand title={copy.live} gloss={core ? copy.core_chat_gloss : copy.replay_header}
        count={<>{messages.length.toLocaleString('en-US')}<CountLabel first={copy.lines} second={core ? copy.core_label : copy.simulated} /></>} />}>
      <PlateBody>
        <div className="moderator-banners" role="group" aria-label={core ? copy.core_verdict_filter : copy.verdict_filter}>
          {(['all', 'pass', 'hold', 'bar'] as const).map(value => {
            const count = (value === 'all' ? messages.length : messages.filter(message => message.verdict === value).length).toLocaleString('en-US');
            return <button type="button" className="moderator-banner" key={value} aria-label={`${verdictWords[value]} · ${count} ${copy.lines}`}
            data-verdict-pick={value} aria-pressed={filter === value} onClick={() => on_filter(value)}>
            <span><VerdictIcon verdict={value} />{verdictWords[value]}</span>
            <b>{count}</b>
          </button>; })}
          {marked && <button type="button" className="moderator-banner"
            aria-label={`${copy.draft_filter} · ${messages.filter(message => marked.has(message.message_id)).length.toLocaleString('en-US')} ${copy.lines}`}
            aria-pressed={filter === 'draft'} onClick={() => on_filter('draft')}>
            <span>{copy.draft_filter}</span><b>{messages.filter(message => marked.has(message.message_id)).length}</b></button>}
        </div>
        <ReplaySearch label={core ? copy.core_search : copy.search} count={filtered.length}>
          <input type="search" value={query} onChange={event => on_query(event.currentTarget.value)} />
        </ReplaySearch>
        {notes && <div className="moderator-core-notes">{notes}</div>}
        <span className="moderator-visually-hidden">{copy.replay_total(messages.length)} · {core ? copy.core_label : copy.simulated_caps}</span>
      </PlateBody>
    </Plate>
    <RuledFeed className="moderator-feed">
      <WindowedRows empty_state={core ? copy.core_chat_empty : copy.empty} key={`${filter}:${query}`} rows={filtered}
        label={core ? copy.core_chat_label : copy.chat_label} scroll_top={scroll_top} row_key={row => core ? row.decision_id : row.message_id}>
        {message => <RuledRow mark={<VerdictMark verdict={message.verdict} />}
          trailing={<time dateTime={message.at} title={message.at}>{message.at.slice(11, 19)}</time>}>
          <span data-message-row={message.message_id} data-verdict={message.verdict}
            data-draft-match={marked?.has(message.message_id) ? 'true' : undefined}
            data-provenance={provenance?.get(message.decision_id)}
            title={[message.message_text ?? copy.text_unavailable, provenance?.get(message.decision_id)].filter(Boolean).join(' · ')}>
            {message.message_text ?? copy.text_unavailable}{provenance && <> · <b>{provenance.get(message.decision_id)}</b></>}
            {marked?.has(message.message_id) && <strong className="moderator-draft-mark"> · {copy.draft_mark}</strong>}
          </span>
        </RuledRow>}
      </WindowedRows>
    </RuledFeed>
    {footer}
  </section>;
}
