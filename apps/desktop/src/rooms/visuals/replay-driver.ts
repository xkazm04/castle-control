import { useEffect, useSyncExternalStore } from 'react';
import type { ReplayClock } from './replay-clock.js';

const reduce_query = '(prefers-reduced-motion: reduce)';
const media = () => typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? undefined : window.matchMedia(reduce_query);
function subscribe(listener: () => void) {
  const query = media();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

/** Reduced motion shows the whole trace at once; no playhead animation runs. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}

/** Feeds animation-frame time into the clock while it plays. The clock itself stays deterministic. */
export function useReplayDriver(clock: ReplayClock, reduced: boolean) {
  const { playing } = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  useEffect(() => {
    if (!playing) return;
    if (reduced) { clock.pause(); return; }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      // A backgrounded window resumes with one bounded step, never a jump to the end.
      clock.tick(Math.min(250, now - last));
      last = now;
      if (clock.getSnapshot().playing) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [clock, playing, reduced]);
}
