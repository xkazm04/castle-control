import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { DuelEvent } from '@castle-control/duel';
import { tallyAt } from '@castle-control/duel/ballots';
import { nextDue, useSessionClock } from './clock.js';
import { Chat, chatWindows } from './chat.jsx';
import { duelKeyAction } from './keymap.js';
import { Ladder, ladderAnnouncement } from './ladder.jsx';
import { useReducedMotion } from './motion.js';
import { duelModes, Pennants } from './pennants.jsx';
import { createTiltyardState, tiltyardReducer } from './session.js';
import type { StageAction, TiltyardState } from './session.js';
import { Showdown } from './showdown.jsx';
import type { DuelMode, TiltyardProps } from './types.js';
import './tokens.css';
import './stage.css';
import './arena.css';
import './card.css';
import './rail.css';
import './champion.css';
import './chat.css';
import './ticker.css';
import './hill.css';
import './ladder.css';

export function Tiltyard({ lists, words, initial_mode = 'show', label, ballots }: TiltyardProps) {
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer((before: TiltyardState, action: StageAction): TiltyardState => {
    const after = tiltyardReducer(before, action);
    if (before.mode !== 'ladder' || action.kind !== 'event') return after;
    const announcement = ladderAnnouncement(before.ladder, after.ladder, action.event, lists.ladder, words);
    return announcement === null ? after : { ...after, announcement };
  }, null, () => createTiltyardState(lists, initial_mode, reduced, words));
  const root = useRef<HTMLElement>(null);
  const session = state[state.mode];
  const windows = useMemo(() => chatWindows(ballots), [ballots]);
  const window = state.mode === 'chat' ? windows(state.chat) : undefined;
  const connected = state.mode !== 'chat' || ballots !== undefined;
  const live = connected && (session.phase === 'live' || session.phase === 'verdict');
  const send = useCallback((event: DuelEvent, elapsed_ms = 0) => {
    if (!connected) return;
    const ms = event.kind === 'tick' ? event.ms : elapsed_ms;
    const counted = window ? tallyAt(window, Math.min(state.chat.window_ms, state.chat.elapsed + ms * state.chat.speed)).counted : undefined;
    dispatch({ kind: 'event', event, words, elapsed_ms, ...(counted ? { counted } : {}) });
  }, [connected, window, state.chat, words]);
  const on_tick = useCallback((ms: number) => send({ kind: 'tick', ms }), [send, session]);
  const elapsed = useSessionClock(connected ? nextDue(session, window) : null, on_tick);
  const on_event = useCallback((event: DuelEvent) => send(event, state.mode === 'chat' ? elapsed() : 0), [send, elapsed, state.mode]);
  const on_mode = useCallback((mode: DuelMode) => {
    if (state.mode === 'chat' && live) on_tick(elapsed());
    dispatch({ kind: 'mode', mode, words });
  }, [state.mode, live, on_tick, elapsed, words]);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, [state.mode]);
  useEffect(() => dispatch({ kind: 'motion', reduced }), [reduced]);
  const enter_hint = state.mode === 'show' ? words.enter_show : state.mode === 'ladder' ? words.enter_ladder
    : session.phase === 'live' ? words.enter_chat_live : words.enter_chat;
  const sample = state.mode === 'show' ? lists.bracket.provenance : state.mode === 'chat' ? lists.chat.provenance : lists.ladder.provenance;
  return <section ref={root} className={`ty-stage${session.phase === 'verdict' && !reduced ? ' ty-shake' : ''}`}
    data-role="ty-stage" data-provenance={sample} data-motion={reduced ? 'reduced' : 'full'} role="dialog" aria-modal="false" aria-label={label}
    tabIndex={-1} onKeyDown={event => {
      const action = duelKeyAction(event, connected ? session : { phase: 'done' });
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
      : state.mode === 'chat' ? <Chat session={state.chat} window={window} words={words} on_event={on_event} />
      : <Ladder session={state.ladder} list={lists.ladder} words={words} on_event={on_event} />}
    <span className="ty-announcement" aria-live="polite" aria-atomic="true">{connected ? state.announcement : ''}</span>
  </section>;
}
