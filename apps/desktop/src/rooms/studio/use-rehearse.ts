import { useEffect, useMemo, useReducer } from 'react';
import type { StudioBoard } from './board.js';
import type { RehearsalField } from './rehearsal.js';
import { createRehearseState, reduceRehearse, rehearseView } from './rehearse-state.js';
import type { RehearseState, RehearseView } from './rehearse-state.js';

/** One simulated turn lasts this long on screen; reduced motion skips straight to the end state. */
export const turnMs = 1100;

export type RehearseHandlers = Readonly<{
  input: (field: RehearsalField, value: string) => void;
  start: () => void; again: () => void; replay: () => void; step: () => void;
  pause: () => void; resume: () => void; reset: () => void; select: (id: string) => void; clear_past: () => void;
}>;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Session-only driver for the Rehearse view. The pure reducer owns every decision; this
 * hook only supplies the clock tick, the reduced-motion flag and the reset when the board changes. */
export function useRehearse(board: StudioBoard): Readonly<{ state: RehearseState; view: RehearseView; handlers: RehearseHandlers }> {
  const [state, dispatch] = useReducer(reduceRehearse, undefined, createRehearseState);
  const stale = state.run !== null && state.run.start !== board;
  useEffect(() => {
    if (!state.playing || stale) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'tick' }), turnMs);
    return () => clearTimeout(timer);
  }, [state.playing, state.turn, stale]);
  // A new board (map size changed) ends the round on screen; finished runs stay in the comparison.
  useEffect(() => { if (stale) dispatch({ type: 'reset' }); }, [stale]);
  const handlers = useMemo<RehearseHandlers>(() => ({
    input: (field, value) => dispatch({ type: 'input', field, value }),
    start: () => dispatch({ type: 'start', board, reduced_motion: reducedMotion() }),
    again: () => dispatch({ type: 'again', board, reduced_motion: reducedMotion() }),
    replay: () => dispatch({ type: 'replay', reduced_motion: reducedMotion() }),
    step: () => dispatch({ type: 'step', board }),
    pause: () => dispatch({ type: 'pause' }), resume: () => dispatch({ type: 'resume' }),
    reset: () => dispatch({ type: 'reset' }), select: id => dispatch({ type: 'select', id }),
    clear_past: () => dispatch({ type: 'clear_past' }),
  }), [board]);
  const shown = stale ? { ...state, run: null, turn: 0, playing: false } : state;
  return { state: shown, view: rehearseView(shown, board), handlers };
}
