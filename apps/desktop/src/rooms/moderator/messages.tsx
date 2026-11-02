import { useState } from 'react';
import { cloneElement, useId } from 'react';
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import type { Decision, Verdict } from '@castle-control/contract';
import { InkButton, Plate, PlateBand, PlateBody, RuledFeed, RuledRow, Stamp, WindowedRows } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ClockTime, CountLabel, VerdictIcon, VerdictMark, verdictWords } from './presentation.jsx';
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

type ReplayView = { filtered: readonly ReplayDecision[]; counts: Record<Verdict | 'all', number>; marked_count: number };
type ViewKey = { filter: Filter; query: string; marked: ReadonlySet<string> | undefined; view: ReplayView };
const views = new WeakMap<readonly ReplayDecision[], ViewKey>();

/** Filter, verdict counts and the lowercased text scan depend only on the lines, the filter, the query and the
 * marked set, so renders that change anything else (a playback tick, a footer) reuse the last result. A plain
 * cache rather than a hook keeps ReplayPanel callable as a function, as its tests and the static renders do. */
function replayView(messages: readonly ReplayDecision[], filter: Filter, query: string, marked: ReadonlySet<string> | undefined): ReplayView {
  const kept = views.get(messages);
  if (kept && kept.filter === filter && kept.query === query && kept.marked === marked) return kept.view;
  const needle = query.trim().toLowerCase();
  const filtered = messages.filter(message => (filter === 'all' || filter === 'draft' && marked?.has(message.message_id) || message.verdict === filter)
    && `${message.message_id} ${message.message_text ?? ''}`.toLowerCase().includes(needle));
  const counts = { all: messages.length, pass: 0, hold: 0, bar: 0 };
  let marked_count = 0;
  for (const message of messages) { counts[message.verdict] += 1; if (marked?.has(message.message_id)) marked_count += 1; }
  const view = { filtered, counts, marked_count };
  views.set(messages, { filter, query, marked, view });
  return view;
}

/** Controlled body shared by the fixture replay and retained core intake. */
export function ReplayPanel({ messages, scroll_top = 0, core = false, notes, footer, provenance, marked,
  filter, query, on_filter, on_query }: ReplayProps & Selection) {
  const FilterButton = core ? InkButton : 'button';
  const filterProps = core ? { size: 'room' as const } : {};
  const { filtered, counts, marked_count } = replayView(messages, filter, query, marked);
  return <section className="moderator-messages">
    <Plate ink="azure" offset="space-8" className="moderator-replay-plate" aria-label={copy.live}
      band={<PlateBand title={copy.live} gloss={core ? copy.core_chat_gloss : copy.replay_header}
        count={<>{messages.length.toLocaleString('en-US')}<CountLabel first={copy.lines} second={core ? copy.core_label : <Stamp kind="simulated" word={copy.simulated} />} /></>} />}>
      <PlateBody>
        <div className="moderator-banners" role="group" aria-label={core ? copy.core_verdict_filter : copy.verdict_filter}>
          {(['all', 'pass', 'hold', 'bar'] as const).map(value => {
            const count = counts[value].toLocaleString('en-US');
            return <FilterButton {...filterProps} type="button" className="moderator-banner" key={value} aria-label={`${verdictWords[value]} · ${count} ${copy.lines}`}
            data-verdict-pick={value} aria-pressed={filter === value} onClick={() => on_filter(value)}>
            <span><VerdictIcon verdict={value} />{verdictWords[value]}</span>
            <b>{count}</b>
          </FilterButton>; })}
          {marked && <FilterButton {...filterProps} type="button" className="moderator-banner"
            aria-label={`${copy.draft_filter} · ${marked_count.toLocaleString('en-US')} ${copy.lines}`}
            aria-pressed={filter === 'draft'} onClick={() => on_filter('draft')}>
            <span>{copy.draft_filter}</span><b>{marked_count}</b></FilterButton>}
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
          trailing={<ClockTime at={message.at} />}>
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
