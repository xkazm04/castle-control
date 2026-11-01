/// <reference types="node" />
import { expect, test } from 'vitest';
import { currentMatch, finalOrder } from '../bracket.js';
import { SAMPLE } from '../sample.js';
import { createShowSession, stepShow } from './show.js';

test.each([1050, 650] as const)('show records now, theatre lasts %i ms, and skip only settles', (theatre_ms) => {
  const session = createShowSession(SAMPLE.bracket, { theatre_ms });
  const match = currentMatch(session.bracket)!;
  const picked = stepShow(session, { kind: 'pick', side: 1 });
  expect(picked.phase).toBe('verdict');
  expect(picked.bracket.rounds[0]![0]!.winner).toBe(match.match.b);
  expect(picked.history).toEqual([session.bracket]);
  expect(picked.verdict).toMatchObject({ mode: 'show', a: match.match.a, b: match.match.b, side: 1, round: 0, index: 0 });
  const ticked = stepShow(picked, { kind: 'tick', ms: theatre_ms - 1 });
  expect(ticked.phase).toBe('verdict');
  expect(ticked.remaining_ms).toBe(1);
  expect(ticked.bracket).toBe(picked.bracket);
  const settled = stepShow(ticked, { kind: 'tick', ms: 1 });
  expect(settled.phase).toBe('live');
  expect(settled.bracket).toBe(picked.bracket);
  expect(settled.verdict).toBeNull();
  for (const event of [{ kind: 'enter' }, { kind: 'pick', side: 0 }] as const) {
    const skipped = stepShow(picked, event);
    expect(skipped.phase).toBe('live');
    expect(skipped.bracket).toBe(picked.bracket);
    expect(skipped.history).toBe(picked.history);
  }
  expect(stepShow(picked, { kind: 'undo' }).bracket).toBe(session.bracket);
});

test('show calls off during live or theatre; reopens and undoes without losing a match', () => {
  const initial = createShowSession(SAMPLE.bracket);
  const picked = stepShow(initial, { kind: 'pick', side: 0 });
  for (const session of [picked, stepShow(picked, { kind: 'enter' })]) {
    const called_off = stepShow(session, { kind: 'cancel' });
    expect(called_off.phase).toBe('called_off');
    expect(called_off.verdict).toBeNull();
    expect(called_off.remaining_ms).toBe(0);
    expect(called_off.bracket).toBe(picked.bracket);
    expect(stepShow(called_off, { kind: 'enter' }).phase).toBe('live');
    const undone = stepShow(called_off, { kind: 'undo' });
    expect(undone.bracket).toBe(initial.bracket);
    expect(undone.history).toHaveLength(0);
    expect(undone.phase).toBe('live');
  }
  expect(stepShow(initial, { kind: 'undo' })).toBe(initial);
});

test('show final pick records champion before theatre; done, reopen, undo and reset work', () => {
  const list = { ...SAMPLE.bracket, items: SAMPLE.bracket.items.slice(0, 2) };
  const initial = createShowSession(list, { theatre_ms: 650 });
  const verdict = stepShow(initial, { kind: 'pick', side: 0 });
  expect(finalOrder(verdict.bracket)![0]).toBe(list.items[0]!.id);
  const done = stepShow(verdict, { kind: 'tick', ms: 650 });
  expect(done.phase).toBe('done');
  expect(done.bracket).toBe(verdict.bracket);
  expect(stepShow(done, { kind: 'enter' })).toEqual(initial);
  expect(stepShow(done, { kind: 'undo' })).toEqual(initial);
  expect(stepShow(verdict, { kind: 'reset' })).toEqual(initial);
  const called_off = stepShow(verdict, { kind: 'cancel' });
  expect(stepShow(called_off, { kind: 'enter' })).toEqual(initial);
});

test('bad clock deltas cannot rewind or poison show theatre', () => {
  const verdict = stepShow(createShowSession(SAMPLE.bracket), { kind: 'pick', side: 0 });
  for (const ms of [-1, NaN, Infinity]) {
    expect(stepShow(verdict, { kind: 'tick', ms }).remaining_ms).toBe(1050);
  }
});
