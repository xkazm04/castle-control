import { useEffect, useMemo, useReducer } from 'react';
import type { StudioBoard } from './board.js';
import type { RehearsalField } from './rehearsal.js';
import { startBoard } from './rehearse-paint.js';
import { createRehearseState, reduceRehearse, rehearseView } from './rehearse-state.js';
import type { RehearseState, RehearseView, SizeChoice } from './rehearse-state.js';

/** One simulated turn lasts this long on screen; reduced motion skips straight to the end state. */
export const turnMs = 1100;
const noSizes: readonly SizeChoice[] = Object.freeze([]);

export type RehearseHandlers = Readonly<{
  input: (field: RehearsalField, value: string) => void;
  start: () => void; again: () => void; replay: () => void; step: () => void;
  pause: () => void; resume: () => void; reset: () => void; select: (id: string) => void; clear_past: () => void;
  compare: () => void; clear_sizes: () => void; compare_crowds: () => void; clear_crowds: () => void;
  /** Redraw start: pick a brush (a house id, '' for unclaimed, null to stop), paint a tile, put the sample back. */
  brush: (side: string | null) => void; paint: (id: string) => void; restore_start: () => void;
}>;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Session-only driver for the Rehearse view. The pure reducer owns every decision; this
 * hook only supplies the clock tick, the reduced-motion flag, the redrawn start board and the
 * reset when the base board changes. `board` is the table's board; the one played is `start`. */
export function useRehearse(board: StudioBoard, sizes: readonly SizeChoice[] = noSizes): Readonly<{
  state: RehearseState; view: RehearseView; handlers: RehearseHandlers; board: StudioBoard;
}> {
  const [state, dispatch] = useReducer(reduceRehearse, undefined, createRehearseState);
  const start = useMemo(() => startBoard(board, state.edits), [board, state.edits]);
  const stale = state.run !== null && state.run.start !== start;
  const old_edits = state.edits !== null && state.edits.base !== board;
  useEffect(() => {
    if (!state.playing || stale) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'tick' }), turnMs);
    return () => clearTimeout(timer);
  }, [state.playing, state.turn, stale]);
  // A new board (map size changed) ends the round on screen and drops edits made on the old one;
  // finished runs stay in the comparison.
  useEffect(() => { if (stale) dispatch({ type: 'reset' }); }, [stale]);
  useEffect(() => { if (old_edits) dispatch({ type: 'restore_start' }); }, [old_edits]);
  const handlers = useMemo<RehearseHandlers>(() => ({
    input: (field, value) => dispatch({ type: 'input', field, value }),
    start: () => dispatch({ type: 'start', board: start, reduced_motion: reducedMotion() }),
    again: () => dispatch({ type: 'again', board: start, reduced_motion: reducedMotion() }),
    replay: () => dispatch({ type: 'replay', reduced_motion: reducedMotion() }),
    step: () => dispatch({ type: 'step', board: start }),
    pause: () => dispatch({ type: 'pause' }), resume: () => dispatch({ type: 'resume' }),
    reset: () => dispatch({ type: 'reset' }), select: id => dispatch({ type: 'select', id }),
    clear_past: () => dispatch({ type: 'clear_past' }),
    // The size the table shows is compared with the redrawn start; the other sizes play their own layouts.
    compare: () => dispatch({ type: 'compare_sizes', sizes: start === board ? sizes
      : sizes.map(choice => choice.board === board ? { ...choice, board: start, edited: true } : choice) }),
    clear_sizes: () => dispatch({ type: 'clear_sizes' }),
    compare_crowds: () => dispatch({ type: 'compare_crowds', board: start }), clear_crowds: () => dispatch({ type: 'clear_crowds' }),
    brush: side => dispatch({ type: 'brush', side }), paint: id => dispatch({ type: 'paint', board, id }),
    restore_start: () => dispatch({ type: 'restore_start' }),
  }), [board, start, sizes]);
  const live = old_edits ? { ...state, edits: null } : state;
  const shown = stale ? { ...live, run: null, turn: 0, playing: false } : live;
  return { state: shown, view: rehearseView(shown, start), handlers, board: start };
}
