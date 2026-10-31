import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { browserClock, createMoatPlayer } from './moat-player.js';
import type { MoatClock, MoatPlayer, MoatPlayerState, MoatSpeed } from './moat-player.js';

const query = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
/** True when the host asks for less motion. Server rendering and tests see false. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(query).matches, () => false);
}

export type UseMoatPlayer = { player: MoatPlayer; state: MoatPlayerState; reduced: boolean };
/** One player per replay length. Leaving the screen pauses it, so no frame loop outlives the strip. */
export function useMoatPlayer(run_ms: number, options: { clock?: MoatClock; start?: 'start' | 'end'; rest_ms?: number; speed?: MoatSpeed } = {}): UseMoatPlayer {
  const reduced = useReducedMotion();
  const { clock = browserClock, start, rest_ms, speed } = options;
  // Reduced motion opens on the finished frame whatever the caller asked for.
  const begin = reduced ? 'end' : start;
  const player = useMemo(() => createMoatPlayer(run_ms, clock, {
    ...(begin ? { start: begin } : {}), ...(rest_ms === undefined ? {} : { loop: { rest_ms } }), ...(speed ? { speed } : {}),
  }), [run_ms, clock, begin, rest_ms, speed]);
  useEffect(() => () => { player.pause(); }, [player]);
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  return { player, state, reduced };
}
