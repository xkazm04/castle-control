import { climbDone, climbPick, climbResult, climbTarget, startClimb } from '../ladder.js';
import type { Climb, ClimbResult, ClimbStep } from '../ladder.js';
import type { DuelItemId } from '../list.js';
import { deltaMs } from './shared.js';
import type { DuelEvent, EventKind, Phase, Side, TheatreMs, TransitionTable } from './shared.js';

export interface LadderVerdict {
  readonly mode: 'ladder';
  readonly side: Side;
  readonly at: number;
  readonly challenger: DuelItemId;
  readonly incumbent: DuelItemId;
}
export interface LadderLast extends ClimbResult {
  readonly item: DuelItemId;
  readonly steps: readonly ClimbStep[];
}
export interface LadderPrevious {
  readonly order: readonly DuelItemId[];
  readonly queue_index: number;
}
export type LadderPhase = Phase | 'idle';
export interface LadderSession {
  readonly mode: 'ladder';
  readonly phase: LadderPhase;
  readonly initial_order: readonly DuelItemId[];
  readonly order: readonly DuelItemId[];
  readonly queue: readonly DuelItemId[];
  readonly queue_index: number;
  readonly climb: Climb | null;
  readonly last: LadderLast | null;
  readonly prev: LadderPrevious | null;
  readonly verdict: LadderVerdict | null;
  readonly theatre_ms: TheatreMs;
  readonly remaining_ms: number;
}
type Handler = 'start' | 'record' | 'settle' | 'tick' | 'cancel' | 'abandon' | 'undo' | 'reset';
export const LADDER_TRANSITIONS = {
  idle: { enter: 'start', undo: 'undo', reset: 'reset' },
  live: { pick: 'record', cancel: 'cancel', undo: 'abandon', reset: 'reset' },
  verdict: { pick: 'settle', enter: 'settle', tick: 'tick', cancel: 'cancel', undo: 'undo', reset: 'reset' },
  called_off: { enter: 'start', reset: 'reset' },
  done: { enter: 'start', undo: 'undo', reset: 'reset' },
} as const satisfies TransitionTable<LadderPhase, Handler>;

export function createLadderSession(
  order: readonly DuelItemId[], queue: readonly DuelItemId[], options: { theatre_ms?: TheatreMs } = {},
): LadderSession {
  if (order.length === 0) throw new TypeError('A ladder needs an incumbent');
  const initial_order = order.slice();
  return {
    mode: 'ladder', phase: 'idle', initial_order, order: initial_order, queue: queue.slice(), queue_index: 0,
    climb: null, last: null, prev: null, verdict: null, theatre_ms: options.theatre_ms ?? 1050, remaining_ms: 0,
  };
}

const handlers: Record<Handler, (session: LadderSession, event: DuelEvent) => LadderSession> = {
  start: (session) => {
    const challenger = session.queue[session.queue_index];
    return challenger === undefined
      ? createLadderSession(session.initial_order, session.queue, { theatre_ms: session.theatre_ms })
      : { ...session, phase: 'live', climb: startClimb(session.order, challenger), last: null, verdict: null, remaining_ms: 0 };
  },
  record: (session, event) => {
    if (event.kind !== 'pick' || !session.climb) return session;
    const at = climbTarget(session.climb);
    if (at === null) return session;
    const climb = climbPick(session.climb, event.side === 0);
    const result = climbDone(climb) ? climbResult(climb, session.order.length) : null;
    return {
      ...session, phase: 'verdict', climb, remaining_ms: session.theatre_ms,
      verdict: {
        mode: 'ladder', side: event.side, at,
        challenger: climb.challenger, incumbent: session.climb.order[at]!,
      },
      ...(result ? {
        prev: { order: session.order, queue_index: session.queue_index },
        order: result.order, queue_index: session.queue_index + 1,
        last: { ...result, item: climb.challenger, steps: climb.steps },
      } : {}),
    };
  },
  settle: (session) => ({
    ...session, phase: session.climb && climbDone(session.climb) ? 'done' : 'live', verdict: null, remaining_ms: 0,
  }),
  tick: (session, event) => {
    if (event.kind !== 'tick') return session;
    const remaining_ms = Math.max(0, session.remaining_ms - deltaMs(event.ms));
    return remaining_ms === 0 ? handlers.settle(session, event) : { ...session, remaining_ms };
  },
  cancel: (session) => ({ ...session, phase: 'called_off', climb: null, verdict: null, remaining_ms: 0 }),
  abandon: (session) => ({ ...session, phase: 'idle', climb: null, verdict: null, remaining_ms: 0 }),
  undo: (session, event) => {
    if (session.climb && !climbDone(session.climb)) return handlers.abandon(session, event);
    return session.prev ? {
      ...session, ...session.prev, phase: 'idle', climb: null, last: null, prev: null, verdict: null, remaining_ms: 0,
    } : session;
  },
  reset: (session) => createLadderSession(session.initial_order, session.queue, { theatre_ms: session.theatre_ms }),
};

export function stepLadder(session: LadderSession, event: DuelEvent): LadderSession {
  const row: Partial<Record<EventKind, Handler>> = LADDER_TRANSITIONS[session.phase];
  const handler = row[event.kind];
  return handler === undefined ? session : handlers[handler](session, event);
}
