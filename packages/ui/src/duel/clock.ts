import { useEffect } from 'react';
import type { ChatSession, LadderSession, ShowSession } from '@castle-control/duel';

/** The next visible change. Live chat arrivals/seconds are added by WP5. */
export function nextDue(session: ShowSession | ChatSession | LadderSession): number | null {
  return session.phase === 'verdict' ? session.remaining_ms : null;
}

/** One wakeup, measured against a monotonic clock rather than the requested delay. */
export function useSessionClock(due_ms: number | null, on_tick: (ms: number) => void): void {
  useEffect(() => {
    if (due_ms === null) return;
    const started_at = performance.now();
    const timer = setTimeout(() => on_tick(performance.now() - started_at), Math.max(0, due_ms));
    return () => clearTimeout(timer);
  }, [due_ms, on_tick]);
}
