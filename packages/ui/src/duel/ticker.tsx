import { memo } from 'react';
import { recentEvents } from '@castle-control/duel/ballots';
import type { IndexedWindow } from '@castle-control/duel/ballots';
import type { TiltyardWords } from './words.js';
import { chatLabel } from './provenance.js';

export const Ticker = memo(function Ticker({ window, seen, words }: {
  window: IndexedWindow; seen: number; second: number; words: TiltyardWords;
}) {
  const events = recentEvents(window, window.events[seen - 1]?.t_ms ?? -1);
  return <div className="ty-ticker" data-role="ty-ticker" data-provenance={window.provenance}
    aria-label={window.provenance === 'simulated' ? `${words.chat.simulated} · ${words.chat.ticker_label}` : chatLabel(words, window.provenance)}>
    {events.map((event, index) => <div className="ty-tick" data-role="ty-tick" data-status={event.status}
      key={`${seen - index}`}>
      <time>{(event.t_ms / 1000).toFixed(1)}s</time>
      <span className="ty-u">{words.chat.viewer(event.user_id, event.provenance)}</span>
      <span className="ty-m">{event.text}</span>
      <span className="ty-status">{words.chat.status[event.status]}
        {event.status === 'counted' ? ` → ${event.option + 1}` : ''}{event.cheer ? words.chat.bits_ignored : ''}</span>
    </div>)}
    {events.length === 0 && <div className="ty-tick"><span /><span className="ty-u">{words.unknown_seed}</span>
      <span className="ty-m">{words.chat.waiting}</span></div>}
  </div>;
});
