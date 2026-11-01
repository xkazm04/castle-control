/// <reference types="node" />
import { expect, test } from 'vitest';
import { SAMPLE } from '../sample.js';
import { createLadderSession, stepLadder } from './ladder.js';
import type { LadderSession } from './ladder.js';
import type { Side } from './shared.js';

const order = SAMPLE.ladder.top.items.map((item) => item.id);
const queue = SAMPLE.ladder.queue.items.map((item) => item.id);
const create = () => createLadderSession(order, queue);
function finish(session: LadderSession, side: Side): LadderSession {
  let next = session;
  while (next.phase !== 'done') next = stepLadder(next, { kind: 'pick', side });
  return next;
}

test.each([1050, 650] as const)('ladder theatre lasts %i ms and only settles the recorded climb', (theatre_ms) => {
  const initial = createLadderSession(order, queue, { theatre_ms });
  const live = stepLadder(initial, { kind: 'enter' });
  expect(live.phase).toBe('live');
  expect(live.climb!.challenger).toBe(queue[0]);
  const verdict = stepLadder(live, { kind: 'pick', side: 0 });
  expect(verdict.phase).toBe('verdict');
  expect(verdict.climb!.steps).toEqual([{ at: 5, incumbent: order[5], won: true }]);
  expect(verdict.verdict).toEqual({ mode: 'ladder', side: 0, at: 5, challenger: queue[0], incumbent: order[5] });
  expect(verdict.order).toBe(live.order);
  expect(verdict.queue_index).toBe(0);
  const ticked = stepLadder(verdict, { kind: 'tick', ms: theatre_ms - 1 });
  expect(ticked.phase).toBe('verdict');
  expect(ticked.remaining_ms).toBe(1);
  expect(ticked.climb).toBe(verdict.climb);
  expect(ticked.order).toBe(verdict.order);
  for (const event of [{ kind: 'tick', ms: 1 }, { kind: 'enter' }, { kind: 'pick', side: 1 }] as const) {
    const settled = stepLadder(ticked, event);
    expect(settled.phase).toBe('live');
    expect(settled.climb).toBe(verdict.climb);
    expect(settled.order).toBe(verdict.order);
    expect(settled.verdict).toBeNull();
  }
});

test.each([0, 1] as const)('completed climb side %i records result, prev and queue before theatre', (side) => {
  const initial = create();
  let session = stepLadder(initial, { kind: 'enter' });
  while (!session.last) session = stepLadder(session, { kind: 'pick', side });
  expect(session.phase).toBe('verdict');
  expect(session.queue_index).toBe(1);
  expect(session.prev).toEqual({ order, queue_index: 0 });
  expect(session.last).toMatchObject({
    item: queue[0], place: side === 0 ? 0 : 10, made_it: side === 0, fell: side === 0 ? order[9] : null,
  });
  expect(session.last!.steps).toEqual(session.climb!.steps);
  expect(session.last!.order).toBe(session.order);
  const done = stepLadder(session, { kind: 'tick', ms: 1050 });
  expect(done.phase).toBe('done');
  expect(done.order).toBe(session.order);
  expect(done.last).toBe(session.last);
  expect(done.queue_index).toBe(1);
  expect(stepLadder(done, { kind: 'undo' })).toEqual(initial);
  expect(stepLadder(session, { kind: 'undo' })).toEqual(initial);
});

test('cancel and live undo abandon a climb with list and queue unchanged; enter retries it', () => {
  const initial = create();
  const live = stepLadder(initial, { kind: 'enter' });
  const called_off = stepLadder(live, { kind: 'cancel' });
  expect(called_off.phase).toBe('called_off');
  expect(called_off.climb).toBeNull();
  expect(called_off.order).toBe(live.order);
  expect(called_off.queue_index).toBe(0);
  expect(stepLadder(called_off, { kind: 'enter' })).toEqual(live);
  expect(stepLadder(live, { kind: 'undo' })).toEqual(initial);
  const verdict = stepLadder(live, { kind: 'pick', side: 0 });
  expect(stepLadder(verdict, { kind: 'cancel' })).toEqual(called_off);
  expect(stepLadder(verdict, { kind: 'undo' })).toEqual(initial);
  expect(stepLadder(initial, { kind: 'undo' })).toBe(initial);
});

test('idle undo with prev restores the previous completed placement and queue', () => {
  const initial = create();
  const first = finish(stepLadder(initial, { kind: 'enter' }), 0);
  const second = stepLadder(first, { kind: 'enter' });
  expect(second.climb!.challenger).toBe(queue[1]);
  const abandoned = stepLadder(second, { kind: 'undo' });
  expect(abandoned.phase).toBe('idle');
  expect(abandoned.order).toBe(first.order);
  expect(abandoned.prev).toBe(first.prev);
  expect(stepLadder(abandoned, { kind: 'undo' })).toEqual(initial);
});

test('each suggestion advances once, exhausted queue resets, and reset works during a climb', () => {
  const initial = create();
  let session = initial;
  for (let i = 0; i < queue.length; i++) {
    session = stepLadder(session, { kind: 'enter' });
    expect(session.climb!.challenger).toBe(queue[i]);
    session = finish(session, 0);
    expect(session.queue_index).toBe(i + 1);
  }
  expect(stepLadder(session, { kind: 'enter' })).toEqual(initial);
  const live = stepLadder(session, { kind: 'reset' });
  expect(live).toEqual(initial);
  expect(stepLadder(stepLadder(initial, { kind: 'enter' }), { kind: 'reset' })).toEqual(initial);
});
