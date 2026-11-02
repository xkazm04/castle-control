import type { LotsDraw, LotsHandle } from '@castle-control/contract';

/**
 * A small mirror of the chamber's current draw, published by the (lazy) room and read
 * synchronously by the Steward flows, which load with the shell. Display state only:
 * every action still goes through the room's own fixture or core port.
 */
export type LotPhase = 'open' | 'sealed' | 'cast';
export type LotLive = {
  mode: 'fixture' | 'core';
  phase: LotPhase;
  draw?: LotsDraw | undefined;
  /** Core draws the streamer can pick (fixture mode lists its presets instead). */
  draws: readonly LotsDraw[];
  entries: number;
  seal?: string | undefined;
  winners: readonly LotsHandle[];
  /** A writ the Writ Lab can prove for this cast. */
  writ: boolean;
  /** Core only: the cast waits for the announced public round. */
  round?: string | undefined;
};

const empty: LotLive = { mode: 'fixture', phase: 'open', draws: [], entries: 0, winners: [], writ: false };
let live: LotLive = empty;
const listeners = new Set<() => void>();

export const lotLive = {
  get: (): LotLive => live,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  publish(next: LotLive) {
    const same = (Object.keys(next) as (keyof LotLive)[]).every(key => next[key] === live[key])
      && Object.keys(live).length === Object.keys(next).length;
    if (same) return;
    live = next;
    for (const listener of listeners) listener();
  },
  /** Tests only. */
  reset() { live = empty; },
};
