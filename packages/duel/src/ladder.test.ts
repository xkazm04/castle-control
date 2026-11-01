/// <reference types="node" />
import { expect, test } from 'vitest';
import {
  climbDone, climbPick, climbResult, climbTarget, maxClimbPicks, startClimb, stillPossible,
} from './ladder.js';
import type { Climb } from './ladder.js';
import { SAMPLE } from './sample.js';

const order = SAMPLE.ladder.top.items.map((item) => item.id);
const challenger = SAMPLE.ladder.queue.items[0]!.id;
function outcomes(climb: Climb): Climb[] {
  return climbDone(climb) ? [climb] : [true, false].flatMap((won) => outcomes(climbPick(climb, won)));
}
const all = outcomes(startClimb(order, challenger));

test('every boolean path over ten rungs has one of the eleven insertion positions', () => {
  expect(all).toHaveLength(11);
  expect(all.map((climb) => climb.lo).sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, n) => n));
  expect(maxClimbPicks(10)).toBe(4);
});

test.each(all.map((climb) => [climb.lo, climb] as const))('complete binary climb to position %i', (place, climb) => {
  expect(climb.steps.length).toBeLessThanOrEqual(4);
  const lost = climb.steps.filter((step) => !step.won).map((step) => step.at + 1);
  const won = climb.steps.filter((step) => step.won).map((step) => step.at);
  expect(place).toBe(Math.max(0, ...lost));
  expect(place).toBe(Math.min(10, ...won));
  expect(climbTarget(climb)).toBeNull();
  expect(climbPick(climb, true)).toBe(climb);
  expect(stillPossible(climb, 10)).toBeNull();
  const result = climbResult(climb, 10);
  expect(result.place).toBe(place);
  expect(result.made_it).toBe(place < 10);
  expect(result.fell).toBe(place < 10 ? order[9] : null);
  expect(result.order).toEqual([...order.slice(0, place), challenger, ...order.slice(place)].slice(0, 10));
  expect(climbResult(climb)).toEqual(result);

  let replay = startClimb(order, challenger);
  for (const step of climb.steps) {
    const range = stillPossible(replay, 10)!;
    expect(range).toEqual({ from: replay.lo + 1, to: replay.hi + 1, below: replay.hi === 10 });
    expect(range.from).toBeLessThanOrEqual(place + 1);
    expect(range.to).toBeGreaterThanOrEqual(place + 1);
    expect(climbTarget(replay)).toBe(step.at);
    expect(step.incumbent).toBe(order[step.at]);
    const before = structuredClone(replay);
    const next = climbPick(replay, step.won);
    expect(replay).toEqual(before);
    expect(next.lo).toBeGreaterThanOrEqual(replay.lo);
    expect(next.hi).toBeLessThanOrEqual(replay.hi);
    const narrowed = stillPossible(next, 10);
    if (narrowed) {
      expect(narrowed.from).toBeGreaterThanOrEqual(range.from);
      expect(narrowed.to).toBeLessThanOrEqual(range.to);
    }
    replay = next;
  }
});
