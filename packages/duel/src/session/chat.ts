import { currentMatch, pick } from '../bracket.js';
import type { Bracket } from '../bracket.js';
import { decide } from '../decide.js';
import { parseSlug, slugId } from '../list.js';
import type { DuelItemId, DuelList } from '../list.js';
import { bracketFor, deltaMs } from './shared.js';
import type { DuelEvent, EventKind, Phase, Side, TransitionTable } from './shared.js';

export type Counted = readonly [number, number];
export type ChatEvent = DuelEvent & { readonly counted: Counted };
interface ClosedMatch {
  readonly mode: 'chat';
  readonly a: DuelItemId;
  readonly b: DuelItemId;
  readonly side: Side;
  readonly counted: Counted;
  readonly elapsed: number;
  readonly round: number;
  readonly index: number;
  readonly match_key: string;
}
export type ChatVerdict = ClosedMatch & ({ readonly how: 'call' } | { readonly how: 'tally' } | { readonly how: 'tie' });
export interface StreamerCall {
  readonly winner: DuelItemId;
  readonly counted: Counted;
}
export interface ChatSession {
  readonly mode: 'chat';
  readonly phase: Phase;
  readonly list: DuelList;
  readonly bracket: Bracket;
  readonly history: readonly Bracket[];
  readonly window_ms: number;
  readonly key: string;
  readonly elapsed: number;
  readonly match_key: string | null;
  readonly speed: 1 | 3;
  readonly calls: readonly StreamerCall[];
  readonly verdict: ChatVerdict | null;
  readonly remaining_ms: number;
}
type Handler = 'call' | 'close' | 'clock' | 'settle' | 'theatre' | 'pause' | 'resume' | 'undo' | 'reset' | 'speed';
export const CHAT_TRANSITIONS = {
  live: { pick: 'call', enter: 'close', tick: 'clock', cancel: 'pause', undo: 'undo', reset: 'reset', speed: 'speed' },
  verdict: { pick: 'settle', enter: 'settle', tick: 'theatre', cancel: 'pause', undo: 'undo', reset: 'reset', speed: 'speed' },
  called_off: { enter: 'resume', undo: 'undo', reset: 'reset', speed: 'speed' },
  done: { enter: 'reset', undo: 'undo', reset: 'reset', speed: 'speed' },
} as const satisfies TransitionTable<Phase, Handler>;

function matchKey(key: string, bracket: Bracket): string | null {
  const cur = currentMatch(bracket);
  return cur ? `${key}:${cur.round}:${cur.index}` : null;
}
export function createChatSession(list: DuelList, options: { window_ms: number; key?: string }): ChatSession {
  if (!Number.isFinite(options.window_ms) || !Number.isInteger(options.window_ms) || options.window_ms <= 0) {
    throw new TypeError('Window length must be a positive integer');
  }
  const key = parseSlug(options.key === undefined ? slugId(list.title) : options.key);
  const bracket = bracketFor(list);
  return {
    mode: 'chat', phase: 'live', list, bracket, history: [], window_ms: options.window_ms, key,
    elapsed: 0, match_key: matchKey(key, bracket), speed: 1, calls: [], verdict: null, remaining_ms: 0,
  };
}

function close(session: ChatSession, counted: Counted, call?: Side): ChatSession {
  const cur = currentMatch(session.bracket);
  if (!cur || session.match_key === null) return session;
  const decision = call === undefined
    ? decide(counted, session.bracket.seeds.indexOf(cur.match.a), session.bracket.seeds.indexOf(cur.match.b))
    : { side: call, how: 'call' as const };
  const winner = decision.side === 0 ? cur.match.a : cur.match.b;
  const snapshot: Counted = [counted[0], counted[1]];
  return {
    ...session, phase: 'verdict', bracket: pick(session.bracket, winner),
    history: [...session.history, session.bracket], remaining_ms: decision.how === 'call' ? 3000 : 4000,
    calls: decision.how === 'call' ? [...session.calls, { winner, counted: snapshot }] : session.calls,
    verdict: {
      mode: 'chat', a: cur.match.a, b: cur.match.b, ...decision, counted: snapshot,
      elapsed: session.elapsed, round: cur.round, index: cur.index, match_key: session.match_key,
    },
  };
}

const handlers: Record<Handler, (session: ChatSession, event: ChatEvent) => ChatSession> = {
  call: (session, event) => event.kind === 'pick' ? close(session, event.counted, event.side) : session,
  close: (session, event) => close(session, event.counted),
  clock: (session, event) => {
    if (event.kind !== 'tick') return session;
    const elapsed = Math.min(session.window_ms, session.elapsed + deltaMs(event.ms) * session.speed);
    const next = { ...session, elapsed };
    return elapsed >= session.window_ms ? close(next, event.counted) : next;
  },
  settle: (session) => ({
    ...session, phase: currentMatch(session.bracket) ? 'live' : 'done', verdict: null, remaining_ms: 0,
    elapsed: 0, match_key: matchKey(session.key, session.bracket),
  }),
  theatre: (session, event) => {
    if (event.kind !== 'tick') return session;
    const remaining_ms = Math.max(0, session.remaining_ms - deltaMs(event.ms));
    return remaining_ms === 0 ? handlers.settle(session, event) : { ...session, remaining_ms };
  },
  pause: (session, event) => ({
    ...(session.verdict ? handlers.settle(session, event) : session), phase: 'called_off',
  }),
  resume: (session, event) => currentMatch(session.bracket)
    ? { ...session, phase: 'live' } : handlers.reset(session, event),
  undo: (session) => {
    const bracket = session.history.at(-1);
    return bracket ? {
      ...session, bracket, history: session.history.slice(0, -1), phase: 'live',
      elapsed: 0, match_key: matchKey(session.key, bracket), verdict: null, remaining_ms: 0,
    } : session;
  },
  reset: (session) => createChatSession(session.list, { window_ms: session.window_ms, key: session.key }),
  speed: (session) => ({ ...session, speed: session.speed === 1 ? 3 : 1 }),
};

export function stepChat(session: ChatSession, event: ChatEvent): ChatSession {
  const row: Partial<Record<EventKind, Handler>> = CHAT_TRANSITIONS[session.phase];
  const handler = row[event.kind];
  return handler === undefined ? session : handlers[handler](session, event);
}
