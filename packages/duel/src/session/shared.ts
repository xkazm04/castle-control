import { startBracket } from '../bracket.js';
import type { Bracket } from '../bracket.js';
import type { DuelList } from '../list.js';

export type Phase = 'live' | 'verdict' | 'called_off' | 'done';
export type Side = 0 | 1;
export type DuelEvent =
  | { readonly kind: 'pick'; readonly side: Side }
  | { readonly kind: 'tick'; readonly ms: number }
  | { readonly kind: 'enter' | 'cancel' | 'undo' | 'reset' | 'speed' };
export type EventKind = DuelEvent['kind'];
export type TheatreMs = 1050 | 650;
export type TransitionTable<P extends string, H extends string> = Readonly<
  Record<P, Readonly<Partial<Record<EventKind, H>>>>
>;

export function bracketFor(list: DuelList): Bracket {
  const bracket = startBracket(list.items.map((item) => item.id));
  if (!bracket) throw new TypeError('A bracket needs at least two items');
  return bracket;
}

/** Invalid clock deltas cannot rewind a session or poison it with NaN. */
export const deltaMs = (ms: number): number => Number.isFinite(ms) && ms > 0 ? ms : 0;
