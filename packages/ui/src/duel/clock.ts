import { useCallback, useEffect, useRef } from 'react';
import { nextChatDue } from '@castle-control/duel';
import type { ChatSession, LadderSession, ShowSession } from '@castle-control/duel';
import type { IndexedWindow } from '@castle-control/duel/ballots';

/** The next visible change, including indexed arrivals and chat seconds. */
export function nextDue(session: ShowSession | ChatSession | LadderSession, window?: IndexedWindow): number | null {
  if (session.mode === 'chat') return nextChatDue(session, window);
  return session.phase === 'verdict' ? session.remaining_ms : null;
}

/** One wakeup, measured against a monotonic clock rather than the requested delay. */
export function useSessionClock(due_ms: number | null, on_tick: (ms: number) => void, session: object = on_tick): () => number {
  const anchor = useRef({ session, at: performance.now() });
  if (anchor.current.session !== session) anchor.current = { session, at: performance.now() };
  const elapsed = useCallback(() => performance.now() - anchor.current.at, []);
  useEffect(() => {
    if (due_ms === null) return;
    const timer = setTimeout(() => on_tick(elapsed()), Math.max(0, Math.ceil(due_ms - elapsed())));
    return () => { clearTimeout(timer); };
  }, [due_ms, on_tick, elapsed, session]);
  return elapsed;
}
