import { expect, it } from 'vitest';
import { createViewerControls, isFreeViewerAction, reduceViewerControls } from './controls.ts';
import type { ViewerAction } from './controls.ts';

const controls = { options: ['Simulated A', 'Simulated B'], tiles: [{ q: 0, r: 0 }],
  sides: ['simulated_north', 'simulated_south'] };
// Record exhaustiveness makes adding an action require extending the money guard proof.
const actions = {
  vote: { kind: 'vote', option_index: 1 },
  pick_tile: { kind: 'pick_tile', q: 0, r: 0 },
  join_side: { kind: 'join_side', side: 'simulated_north' },
  reset: { kind: 'reset' },
} as const satisfies { [K in ViewerAction['kind']]: Extract<ViewerAction, { kind: K }> };

it('reduces local selections purely and resets without tallying or deciding an outcome', () => {
  const initial = createViewerControls(controls);
  const voted = reduceViewerControls(initial, actions.vote);
  const picked = reduceViewerControls(voted, actions.pick_tile);
  const joined = reduceViewerControls(picked, actions.join_side);
  expect(initial.selection).toEqual({});
  expect(joined.selection).toEqual({ option_index: 1, tile: { q: 0, r: 0 }, side: 'simulated_north' });
  expect(reduceViewerControls(picked, actions.join_side)).toEqual(joined);
  expect(reduceViewerControls(joined, actions.reset)).toEqual(initial);
  expect(Object.isFrozen(joined.selection)).toBe(true);
  expect(Object.isFrozen(joined.selection.tile)).toBe(true);
  controls.options.push('Simulated later');
  expect(initial.controls.options).toHaveLength(2);
  controls.options.pop();
});

it('rejects invalid choices, malformed and unknown actions without changing state', () => {
  const state = createViewerControls(controls);
  for (const action of [null, {}, [], { kind: 'entry' }, { kind: 'vote', option_index: -1 },
    { kind: 'vote', option_index: 2 }, { kind: 'vote', option_index: 0.5 },
    { kind: 'pick_tile', q: 1, r: 0 }, { kind: 'pick_tile', q: NaN, r: 0 },
    { kind: 'join_side', side: 'missing' }, { kind: 'reset', extra: true }]) {
    expect(reduceViewerControls(state, action)).toBe(state);
  }
});

it('validates the control configuration and freezes its snapshot', () => {
  for (const value of [null, {}, { ...controls, bits: 1 }, { ...controls, options: [''] },
    { ...controls, sides: [123] }, { ...controls, tiles: [{ q: 0.5, r: 0 }] },
    { ...controls, tiles: [{ q: 0, r: 0, cost: 1 }] }]) {
    expect(() => createViewerControls(value)).toThrow();
  }
  const state = createViewerControls(controls);
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(state.controls)).toBe(true);
  expect(Object.isFrozen(state.controls.options)).toBe(true);
  expect(Object.isFrozen(state.controls.tiles[0])).toBe(true);
});

it('refuses Bits or payment fields for every reducer action, including zero and nested payloads', () => {
  const state = reduceViewerControls(createViewerControls(controls), actions.vote);
  for (const action of Object.values(actions)) {
    expect(isFreeViewerAction(action)).toBe(true);
    for (const field of ['bits', 'cost', 'price', 'payment', 'ticket', 'entry', 'outcome']) {
      for (const value of [0, 1, undefined, { bits: 1 }]) {
        const paid = { ...action, [field]: value };
        expect(isFreeViewerAction(paid)).toBe(false);
        expect(reduceViewerControls(state, paid)).toBe(state);
      }
    }
  }
  for (const kind of ['bits', 'buy_entry', 'buy_ticket', 'random_outcome']) {
    expect(isFreeViewerAction({ kind, amount: 1 })).toBe(false);
    expect(reduceViewerControls(state, { kind, amount: 1 })).toBe(state);
  }
});
