import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DuelEvent } from '@castle-control/duel';
import { Arena } from './arena.jsx';
import { Lineup } from './boards.jsx';
import { nextDue, useSessionClock } from './clock.js';
import { duelKeyAction } from './keymap.js';
import { useReducedMotion } from './motion.js';
import { duelModes, Pennants } from './pennants.jsx';
import { createTiltyardState, tiltyardReducer } from './session.js';
import { Showdown } from './showdown.jsx';
import type { DuelMode, TiltyardProps } from './types.js';
import './tokens.css';
import './stage.css';
import './arena.css';
import './card.css';
import './rail.css';
import './champion.css';

export function Tiltyard({ lists, words, initial_mode = 'show', label }: TiltyardProps) {
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(tiltyardReducer, null, () => createTiltyardState(lists, initial_mode, reduced));
  const root = useRef<HTMLElement>(null);
  const session = state[state.mode];
  const live = session.phase === 'live' || session.phase === 'verdict';
  const on_mode = useCallback((mode: DuelMode) => dispatch({ kind: 'mode', mode }), []);
  const on_event = useCallback((event: DuelEvent) => dispatch({ kind: 'event', event, words }), [words]);
  const on_tick = useCallback((ms: number) => on_event({ kind: 'tick', ms }), [on_event]);
  useSessionClock(nextDue(session), on_tick);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, [state.mode]);
  useEffect(() => dispatch({ kind: 'motion', reduced }), [reduced]);
  const enter_hint = state.mode === 'show' ? words.enter_show : state.mode === 'ladder' ? words.enter_ladder
    : session.phase === 'live' ? words.enter_chat_live : words.enter_chat;
  const sample = state.mode === 'show' ? lists.bracket.provenance : state.mode === 'chat' ? lists.chat.provenance : lists.ladder.provenance;
  return <section ref={root} className={`ty-stage${session.phase === 'verdict' && !reduced ? ' ty-shake' : ''}`}
    data-role="ty-stage" data-provenance={sample} data-motion={reduced ? 'reduced' : 'full'} role="dialog" aria-modal="false" aria-label={label}
    tabIndex={-1} onKeyDown={event => {
      const action = duelKeyAction(event, session);
      if (action === null) return;
      event.preventDefault(); event.stopPropagation();
      if (action === 'mode_prev' || action === 'mode_next') {
        const index = duelModes.indexOf(state.mode);
        on_mode(duelModes[(index + (action === 'mode_next' ? 1 : 2)) % duelModes.length]!);
      } else if (action === 'pick_left' || action === 'pick_right') on_event({ kind: 'pick', side: action === 'pick_left' ? 0 : 1 });
      else on_event({ kind: action === 'cancel' ? 'cancel' : action === 'undo' ? 'undo' : 'enter' });
    }}>
    <Pennants mode={state.mode} words={words} on_mode={on_mode}>
      <div className="ty-yard-keys" data-role="ty-keys">
        <span><kbd>{words.keys.left}</kbd><kbd>{words.keys.right}</kbd>{words.pick}</span>
        <span><kbd>{words.keys.escape}</kbd>{live ? words.cancel : words.back}</span>
        <span><kbd>{words.keys.enter}</kbd>{enter_hint}</span>
        <span><kbd>{words.keys.previous}</kbd><kbd>{words.keys.next}</kbd>{words.mode}</span>
      </div>
    </Pennants>
    {state.mode === 'show' ? <Showdown session={state.show} words={words} on_event={on_event} />
      : <Arena><div className="ty-board">
        <h2 data-role="ty-board-title">{words.modes[state.mode].title}</h2>
        <p data-role="ty-board-text">{state.mode === 'chat' ? lists.chat.prompt : lists.ladder.title}</p>
        <Lineup list={state.mode === 'chat' ? lists.chat : lists.ladder.top} words={words} />
      </div></Arena>}
    <span className="ty-announcement" aria-live="polite" aria-atomic="true">{state.announcement}</span>
  </section>;
}
