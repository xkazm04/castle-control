import { chamberIds } from './route.ts';
import type { Route, SiteRoom } from './route.ts';

export const introDurationMs = 2700;
export type Phase = 'intro' | 'overview' | 'room' | 'features';
export type State = Readonly<{ phase: Phase; room: SiteRoom | null }>;
export type Event =
  | { type: 'skip' | 'timeout' | 'input' | 'back' | 'home' | 'features' }
  | { type: 'open'; room: SiteRoom }
  | { type: 'cycle'; direction: -1 | 1 };

// This table, rather than DOM classes or hashes, owns navigation depth.
export const transitions = {
  intro: { skip: 'overview', timeout: 'overview', input: 'overview', open: 'room', back: 'overview', home: 'overview', features: 'overview', cycle: 'overview' },
  overview: { skip: 'overview', timeout: 'overview', input: 'overview', open: 'room', back: 'overview', home: 'overview', features: 'overview', cycle: 'overview' },
  room: { skip: 'room', timeout: 'room', input: 'room', open: 'room', back: 'overview', home: 'overview', features: 'features', cycle: 'room' },
  features: { skip: 'features', timeout: 'features', input: 'features', open: 'room', back: 'room', home: 'overview', features: 'features', cycle: 'features' },
} as const satisfies Record<Phase, Record<Event['type'], Phase>>;

export function initialState(reduced: boolean, route: Route = { room: null, features: false }): State {
  if (route.room !== null) return { phase: route.features ? 'features' : 'room', room: route.room };
  return { phase: reduced ? 'overview' : 'intro', room: null };
}

export function level(state: State): 0 | 1 | 2 {
  return state.phase === 'features' ? 2 : state.phase === 'room' ? 1 : 0;
}

export function transition(state: State, event: Event): State {
  if (event.type === 'features' && state.room === 'steward') return state;
  const phase = transitions[state.phase][event.type];
  if (phase === 'overview') return { phase, room: null };
  if (event.type === 'open') return { phase, room: event.room };
  if (event.type === 'cycle' && state.room !== null && state.room !== 'steward') {
    const index = chamberIds.indexOf(state.room);
    return { phase, room: chamberIds[(index + event.direction + chamberIds.length) % chamberIds.length] ?? 'lots' };
  }
  return { phase, room: state.room };
}

export function routeOf(state: State): Route {
  return { room: state.room, features: level(state) === 2 };
}
