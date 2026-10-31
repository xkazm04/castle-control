import { useEffect, useRef, useState } from 'react';
import type { ChatSession } from '@castle-control/duel';
import { classifyWindow, indexWindow } from '@castle-control/duel/ballots';
import type { IndexedWindow } from '@castle-control/duel/ballots';
import type { TiltyardProps } from './types.js';

const empty: IndexedWindow = { ...indexWindow([]), provenance: 'live' };

/** Only deliveries rebuild the index. Closed windows retain their last tally. */
export function useLiveBallots(source: TiltyardProps['ballot_feed'], session: ChatSession, active: boolean) {
  const [window, setWindow] = useState<IndexedWindow>(empty);
  const { match_key, window_ms, bracket } = session;
  const owner = useRef({ source, match_key, bracket });
  const live = active && session.phase === 'live';
  useEffect(() => {
    if (!source || !live || !match_key) return;
    const opened_at = new Date().toISOString();
    let subscribed = true;
    owner.current = { source, match_key, bracket };
    setWindow(empty);
    const stop = source({ match_key, opened_at, window_ms }, ballots => {
      if (!subscribed) return;
      const indexed = indexWindow(classifyWindow(ballots, opened_at, window_ms));
      setWindow(indexed.events.length ? indexed : empty);
    });
    return () => { subscribed = false; stop(); };
  }, [source, live, match_key, window_ms, bracket]);
  const changed = owner.current.source !== source || session.phase === 'live'
    && (owner.current.match_key !== match_key || owner.current.bracket !== bracket);
  return source ? changed ? empty : window : undefined;
}
