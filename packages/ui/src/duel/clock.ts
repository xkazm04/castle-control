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
export function useSessionClock(due_ms: number | null, on_tick: (ms: number) => void): () => number {
  const started_at = useRef<number | null>(null);
  const elapsed = useCallback(() => started_at.current === null ? 0 : performance.now() - started_at.current, []);
  useEffect(() => {
    started_at.current = null;
    if (due_ms === null) return;
    started_at.current = performance.now();
    const timer = setTimeout(() => on_tick(elapsed()), Math.max(0, Math.ceil(due_ms)));
    return () => { clearTimeout(timer); started_at.current = null; };
  }, [due_ms, on_tick, elapsed]);
  return elapsed;
}
