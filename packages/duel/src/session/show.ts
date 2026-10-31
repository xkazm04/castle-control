import { currentMatch, pick } from '../bracket.js';
import type { Bracket } from '../bracket.js';
import type { DuelItemId, DuelList } from '../list.js';
import { bracketFor, deltaMs } from './shared.js';
import type { DuelEvent, EventKind, Phase, Side, TheatreMs, TransitionTable } from './shared.js';

export interface ShowVerdict {
  readonly mode: 'show';
  readonly a: DuelItemId;
  readonly b: DuelItemId;
  readonly side: Side;
  readonly round: number;
  readonly index: number;
}
export interface ShowSession {
  readonly mode: 'show';
  readonly phase: Phase;
  readonly list: DuelList;
  readonly bracket: Bracket;
  readonly history: readonly Bracket[];
  readonly verdict: ShowVerdict | null;
  readonly theatre_ms: TheatreMs;
  readonly remaining_ms: number;
}
type Handler = 'record' | 'settle' | 'tick' | 'cancel' | 'reopen' | 'undo' | 'reset';
export const SHOW_TRANSITIONS = {
  live: { pick: 'record', cancel: 'cancel', undo: 'undo', reset: 'reset' },
  verdict: { pick: 'settle', enter: 'settle', tick: 'tick', cancel: 'cancel', undo: 'undo', reset: 'reset' },
  called_off: { enter: 'reopen', undo: 'undo', reset: 'reset' },
  done: { enter: 'reset', undo: 'undo', reset: 'reset' },
} as const satisfies TransitionTable<Phase, Handler>;

export function createShowSession(list: DuelList, options: { theatre_ms?: TheatreMs } = {}): ShowSession {
  return {
    mode: 'show', phase: 'live', list, bracket: bracketFor(list), history: [], verdict: null,
    theatre_ms: options.theatre_ms ?? 1050, remaining_ms: 0,
  };
}

const handlers: Record<Handler, (session: ShowSession, event: DuelEvent) => ShowSession> = {
  record: (session, event) => {
    const cur = currentMatch(session.bracket);
    if (event.kind !== 'pick' || !cur) return session;
    return {
      ...session, phase: 'verdict',
      bracket: pick(session.bracket, event.side === 0 ? cur.match.a : cur.match.b),
      history: [...session.history, session.bracket], remaining_ms: session.theatre_ms,
      verdict: { mode: 'show', a: cur.match.a, b: cur.match.b, side: event.side, round: cur.round, index: cur.index },
    };
  },
  settle: (session) => ({
    ...session, phase: currentMatch(session.bracket) ? 'live' : 'done', verdict: null, remaining_ms: 0,
  }),
  tick: (session, event) => {
    if (event.kind !== 'tick') return session;
    const remaining_ms = Math.max(0, session.remaining_ms - deltaMs(event.ms));
    return remaining_ms === 0 ? handlers.settle(session, event) : { ...session, remaining_ms };
  },
  cancel: (session) => ({ ...session, phase: 'called_off', verdict: null, remaining_ms: 0 }),
  reopen: (session, event) => currentMatch(session.bracket)
    ? { ...session, phase: 'live' } : handlers.reset(session, event),
  undo: (session) => {
    const bracket = session.history.at(-1);
    return bracket ? {
      ...session, bracket, history: session.history.slice(0, -1), phase: 'live', verdict: null, remaining_ms: 0,
    } : session;
  },
  reset: (session) => createShowSession(session.list, { theatre_ms: session.theatre_ms }),
};

export function stepShow(session: ShowSession, event: DuelEvent): ShowSession {
  const row: Partial<Record<EventKind, Handler>> = SHOW_TRANSITIONS[session.phase];
  const handler = row[event.kind];
  return handler === undefined ? session : handlers[handler](session, event);
}
