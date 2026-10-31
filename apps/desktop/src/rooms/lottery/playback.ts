import { useEffect, useState, useSyncExternalStore } from 'react';
import { createDrawPlayback } from '@castle-control/renderer';
import type { DrawScene } from '@castle-control/renderer';
import type { LotsHandle, LotsWrit } from '@castle-control/contract';

export type RevealState = {
  readonly key: string | undefined; readonly revealed: readonly LotsHandle[];
  readonly finished: boolean; readonly take: number;
};
const idle: RevealState = Object.freeze({ key: undefined, revealed: Object.freeze([]), finished: true, take: 0 });

/** Session-owned presentation cursor over the renderer's own scene events
 * (createDrawPlayback). It never chooses, reorders or changes a winner. */
export function createRevealClock() {
  let state: RevealState = idle;
  let playback: ReturnType<typeof createDrawPlayback> | undefined;
  let began = 0;
  const listeners = new Set<() => void>();
  const publish = (next: RevealState) => { state = Object.freeze(next); for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** A new key restarts the ceremony from its flourish; the same key resumes where it was.
     * Returns how long the host may sleep until the next reveal, or undefined when done. */
    tick(scene: DrawScene | undefined, key: string | undefined, now: number): number | undefined {
      if (!scene || key === undefined) {
        playback = undefined;
        if (state.key !== undefined) publish({ ...idle, take: state.take });
        return undefined;
      }
      if (key !== state.key || !playback) { playback = createDrawPlayback(scene); began = now; }
      const elapsed = now - began;
      const current = playback.advanceTo(elapsed);
      if (key !== state.key || current.revealed_winners.length !== state.revealed.length || playback.finished !== state.finished) {
        publish({ key, revealed: current.revealed_winners, finished: playback.finished, take: state.take });
      }
      const next = playback.next_at_ms;
      return next === undefined ? undefined : Math.max(0, next - elapsed);
    },
    /** Replays the same verified cast; the next key differs only by its take number. */
    replay() { playback = undefined; publish({ ...idle, take: state.take + 1 }); },
  };
}
export type RevealClock = ReturnType<typeof createRevealClock>;

export function useReveal(clock: RevealClock, scene: DrawScene | undefined, key: string | undefined): RevealState {
  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      clearTimeout(timer);
      // Sleep until the renderer's next onset instead of ticking every frame.
      const wait = clock.tick(scene, key, performance.now());
      if (wait !== undefined) timer = setTimeout(tick, Math.max(16, wait));
    };
    tick();
    return () => { clearTimeout(timer); };
  }, [clock, scene, key]);
  return key !== undefined && state.key === key ? state : { ...idle, take: state.take };
}

const reducedQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(reducedQuery);
  media.addEventListener('change', listener);
  return () => { media.removeEventListener('change', listener); };
}
const reducedSnapshot = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(reducedQuery).matches);

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, reducedSnapshot, () => false);
}

/** The stage plays a cast only after its writ recomputes locally; a failure is shown, never animated. */
export function useWritCheck(writ: LotsWrit | undefined, verify: (writ: LotsWrit) => Promise<unknown>): boolean | undefined {
  const [result, setResult] = useState<{ writ: LotsWrit; ok: boolean }>();
  useEffect(() => {
    if (!writ) return undefined;
    let live = true;
    verify(writ).then(() => { if (live) setResult({ writ, ok: true }); }, () => { if (live) setResult({ writ, ok: false }); });
    return () => { live = false; };
  }, [writ, verify]);
  return writ && result?.writ === writ ? result.ok : undefined;
}
