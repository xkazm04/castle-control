import { useSyncExternalStore } from 'react';
import type { RevealClock } from './playback.js';

/** Read the ceremony's cursor: the proof card never announces a lot before its stage reveal. */
export function RevealedWinners({ clock, seal, total, compact = false }: { clock: RevealClock; seal: string | undefined; total: number; compact?: boolean }) {
  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const winners = state.key?.startsWith(`${seal ?? 'cast'}:`) ? state.revealed : [];
  return <>
    {!compact && <ol className="lottery-proof-winners">{winners.slice(0, 3).map(winner => <li key={winner}>{winner}</li>)}</ol>}
    <p className="lottery-note">{winners.length} of {total} revealed{winners.length > 3 ? ' · all winners in the full writ' : ''}.</p>
  </>;
}
