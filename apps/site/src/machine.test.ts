import { expect, test } from 'vitest';
import { initialState, introDurationMs, level, routeOf, transition, transitions } from './machine.ts';
import type { Event, State } from './machine.ts';

test('intro timeout is 2700 ms; skip and any input end intro; reduced motion starts complete', () => {
  expect(introDurationMs).toBe(2700);
  expect(initialState(false)).toEqual({ phase: 'intro', room: null });
  for (const type of ['timeout', 'skip', 'input'] as const) {
    expect(transition(initialState(false), { type })).toEqual(initialState(true));
  }
  expect(initialState(true)).toEqual({ phase: 'overview', room: null });
  expect(initialState(false, { room: 'lots', features: true })).toEqual({ phase: 'features', room: 'lots' });
  expect(transition(initialState(false), { type: 'open', room: 'gate' })).toEqual({ phase: 'room', room: 'gate' });
});

test('open, features, Back and home preserve the public route and return one level', () => {
  const room = transition(initialState(true), { type: 'open', room: 'lots' });
  const features = transition(room, { type: 'features' });
  expect([level(initialState(true)), level(room), level(features)]).toEqual([0, 1, 2]);
  expect(routeOf(features)).toEqual({ room: 'lots', features: true });
  expect(transition(features, { type: 'back' })).toEqual(room);
  expect(transition(room, { type: 'back' })).toEqual(initialState(true));
  expect(transition(features, { type: 'home' })).toEqual(initialState(true));
});

test('cycle wraps in both directions and keeps room/features level; Steward does not cycle', () => {
  for (const phase of ['room', 'features'] as const) {
    let state: State = { phase, room: 'lots' };
    state = transition(state, { type: 'cycle', direction: -1 });
    expect(state).toEqual({ phase, room: 'map' });
    for (const room of ['lots', 'gate', 'beacons', 'map'] as const) {
      state = transition(state, { type: 'cycle', direction: 1 });
      expect(state).toEqual({ phase, room });
    }
    const steward: State = { phase, room: 'steward' };
    expect(transition(steward, { type: 'cycle', direction: 1 })).toEqual(steward);
  }
});

test('the transition data covers every event at every state without invalid room depth', () => {
  const events: Event[] = [{ type: 'skip' }, { type: 'timeout' }, { type: 'input' }, { type: 'open', room: 'lots' },
    { type: 'back' }, { type: 'home' }, { type: 'features' }, { type: 'cycle', direction: 1 }];
  for (const phase of ['intro', 'overview', 'room', 'features'] as const) for (const event of events) {
    const next = transition({ phase, room: phase === 'intro' || phase === 'overview' ? null : 'lots' }, event);
    expect(next.phase).toBe(transitions[phase][event.type]);
    expect(next.room === null).toBe(level(next) === 0);
  }
});
