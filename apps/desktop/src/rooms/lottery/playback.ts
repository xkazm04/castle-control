import { useEffect, useSyncExternalStore } from 'react';
import type { LotsWrit } from '@castle-control/contract';
import { revealedAt } from './reveal.js';

/** Session-owned presentation cursor; it never chooses or changes a winner. */
export function createRevealClock() {
  let revealed = 0;
  let cast: LotsWrit | undefined;
  let began = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => revealed,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    tick(writ: LotsWrit | undefined, now: number, reduced_motion: boolean) {
      const previous = cast === writ ? revealed : 0;
      if (cast !== writ) { cast = writ; began = now; }
      const next = Math.max(previous, revealedAt(now - began, writ?.winners.length ?? 0, { reduced_motion }));
      if (next === revealed) return;
      revealed = next;
      for (const listener of listeners) listener();
    },
  };
}

export function useReveal(clock: ReturnType<typeof createRevealClock>, writ: LotsWrit | undefined): number {
  const revealed = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      clearTimeout(timer);
      clock.tick(writ, performance.now(), media.matches);
      if (clock.getSnapshot() < (writ?.winners.length ?? 0)) timer = setTimeout(tick, 50);
    };
    tick();
    media.addEventListener('change', tick);
    return () => { clearTimeout(timer); media.removeEventListener('change', tick); };
  }, [clock, writ]);
  return writ ? revealed : 0;
}
