import { useEffect, useState, useSyncExternalStore } from 'react';
import { createDrawPlayback } from '@castle-control/renderer';
import type { DrawScene } from '@castle-control/renderer';
import type { LotsHandle, LotsWrit } from '@castle-control/contract';

export type RevealState = {
  readonly key: string | undefined; readonly revealed: readonly LotsHandle[];
  readonly finished: boolean; readonly take: number;
  /** By hand: the cursor is held before the next onset until the streamer calls the next lot. */
  readonly waiting: boolean;
};
const idle: RevealState = Object.freeze({ key: undefined, revealed: Object.freeze([]), finished: true, take: 0, waiting: false });

/** Session-owned presentation cursor over the renderer's own scene events
 * (createDrawPlayback). It never chooses, reorders or changes a winner. */
export function createRevealClock() {
  let state: RevealState = idle;
  let playback: ReturnType<typeof createDrawPlayback> | undefined;
  let began = 0;
  let by_hand = false;
  /** By hand only: the playback position may not pass this point (just before the next onset). */
  let gate: number | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: RevealState) => { state = Object.freeze(next); for (const listener of listeners) listener(); };
  const hold = () => playback && !playback.finished && playback.next_at_ms !== undefined ? playback.next_at_ms - 1 : undefined;
  const sync = (key: string) => {
    if (!playback) return;
    const waiting = gate !== undefined && !playback.finished && playback.position_ms >= gate;
    const revealed = playback.scene.revealed_winners;
    if (key !== state.key || revealed.length !== state.revealed.length || playback.finished !== state.finished || waiting !== state.waiting) {
      publish({ key, revealed, finished: playback.finished, take: state.take, waiting });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** A new key restarts the ceremony from its flourish; the same key resumes where it was.
     * Returns how long the host may sleep until the next reveal, or undefined when done or held. */
    tick(scene: DrawScene | undefined, key: string | undefined, now: number): number | undefined {
      if (!scene || key === undefined) {
        playback = undefined; gate = undefined;
        if (state.key !== undefined) publish({ ...idle, take: state.take });
        return undefined;
      }
      if (key !== state.key || !playback) { playback = createDrawPlayback(scene); began = now; gate = by_hand ? hold() : undefined; }
      let elapsed = now - began;
      // Held: time stops at the gate, so the next call continues from here rather than jumping ahead.
      if (gate !== undefined && elapsed > gate) { elapsed = gate; began = now - gate; }
      playback.advanceTo(elapsed);
      sync(key);
      const next = playback.next_at_ms;
      if (next === undefined) return undefined;
      const until = gate === undefined ? next : Math.min(next, gate);
      return until > elapsed ? until - elapsed : gate === undefined ? 0 : undefined;
    },
    /** By hand: reveal exactly the next winner now, in the renderer's order, then hold again. */
    callNext(now: number) {
      const key = state.key;
      if (!playback || key === undefined || gate === undefined || playback.next_at_ms === undefined) return;
      playback.advanceTo(playback.next_at_ms);
      // Park at the next gate at once (no onset lies before it), so the next call is ready immediately.
      gate = hold();
      const position = gate ?? playback.position_ms;
      playback.advanceTo(position);
      began = now - position;
      sync(key);
    },
    /** Switches pace; switching to auto releases a held ceremony on the host's next tick, continuing
     * from where it was held (time spent waiting never counts towards the next onset). */
    pace(hand: boolean, now: number) {
      if (by_hand === hand) return;
      by_hand = hand;
      gate = hand ? hold() : undefined;
      if (!hand && playback && Number.isFinite(playback.position_ms)) began = now - playback.position_ms;
      if (state.key !== undefined) sync(state.key);
    },
    get by_hand() { return by_hand; },
    /** Replays the same verified cast; the next key differs only by its take number. */
    replay() { playback = undefined; gate = undefined; publish({ ...idle, take: state.take + 1 }); },
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
  // `waiting` flips when a held ceremony is released (pace back to auto) or finishes; tick again then.
  }, [clock, scene, key, state.waiting]);
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
