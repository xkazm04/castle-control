/// <reference types="node" />
import { expect, test } from 'vitest';
import { currentMatch, finalOrder } from '../bracket.js';
import { decide } from '../decide.js';
import { SAMPLE } from '../sample.js';
import { createChatSession, stepChat } from './chat.js';
import type { Counted } from './chat.js';

const create = () => createChatSession(SAMPLE.chat, SAMPLE.chat);
const counted: Counted = [4, 8];
test('chat counted tally decides; ties go to the lower seed in either card position', () => {
  expect(decide([9, 3], 8, 1)).toEqual({ side: 0, how: 'tally' });
  expect(decide(counted, 1, 8)).toEqual({ side: 1, how: 'tally' });
  expect(decide([3, 3], 1, 8)).toEqual({ side: 0, how: 'tie' });
  expect(decide([0, 0], 8, 1)).toEqual({ side: 1, how: 'tie' });
  const initial = create();
  const verdict = stepChat(initial, { kind: 'enter', counted: [2, 2] });
  expect(verdict.verdict?.how).toBe('tie');
  expect(verdict.bracket.rounds[0]![0]!.winner).toBe(initial.bracket.seeds[0]);
  expect(verdict.calls).toHaveLength(0);
});

test('streamer call is a separate log with its actual counted snapshot', () => {
  const initial = create();
  const ticked = stepChat(initial, { kind: 'tick', ms: 231, counted });
  const snapshot: [number, number] = [1, 20];
  const called = stepChat(ticked, { kind: 'pick', side: 0, counted: snapshot });
  const match = currentMatch(initial.bracket)!;
  expect(called.calls).toEqual([{ winner: match.match.a, counted: snapshot }]);
  expect(called.verdict).toEqual({
    mode: 'chat', a: match.match.a, b: match.match.b, side: 0, how: 'call', counted: [1, 20],
    elapsed: 231, round: 0, index: 0, match_key: 'mill:0:0',
  });
  snapshot[0] = 100;
  expect(called.verdict!.counted).toEqual([1, 20]);
  expect(called.calls[0]!.counted).toEqual([1, 20]);
  expect(called.bracket.rounds[0]![0]!.winner).toBe(match.match.a);
  expect(called.remaining_ms).toBe(3000);
});

test('live clock uses speed, caps elapsed at the window, and closes on supplied tally', () => {
  let session = create();
  session = stepChat(session, { kind: 'speed', counted });
  expect(session.speed).toBe(3);
  session = stepChat(session, { kind: 'tick', ms: 1000, counted });
  expect(session.elapsed).toBe(3000);
  expect(session.match_key).toBe('mill:0:0');
  session = stepChat(session, { kind: 'tick', ms: 4500, counted });
  expect(session.phase).toBe('verdict');
  expect(session.elapsed).toBe(15000);
  expect(session.verdict).toMatchObject({ counted, elapsed: 15000, how: 'tally', side: 1 });
  expect(session.calls).toHaveLength(0);
  expect(session.remaining_ms).toBe(4000);
  expect(stepChat(session, { kind: 'speed', counted }).speed).toBe(1);
});

test.each(['tally', 'tie', 'call'] as const)('%s theatre only counts down; next window starts fresh', (how) => {
  const tally: Counted = how === 'tie' ? [4, 4] : counted;
  const verdict = stepChat(create(), how === 'call'
    ? { kind: 'pick', side: 0, counted: tally } : { kind: 'enter', counted: tally });
  const remaining_ms = how === 'call' ? 3000 : 4000;
  const ticked = stepChat(verdict, { kind: 'tick', ms: remaining_ms - 1, counted: [999, 999] });
  expect(ticked.phase).toBe('verdict');
  expect(ticked.verdict).toBe(verdict.verdict);
  expect(ticked.verdict!.counted).toBe(verdict.verdict!.counted);
  expect(ticked.bracket).toBe(verdict.bracket);
  expect(ticked.elapsed).toBe(verdict.elapsed);
  for (const event of [
    { kind: 'tick', ms: 1, counted }, { kind: 'pick', side: 1, counted }, { kind: 'enter', counted },
  ] as const) {
    const settled = stepChat(ticked, event);
    expect(settled.phase).toBe('live');
    expect(settled.elapsed).toBe(0);
    expect(settled.bracket).toBe(verdict.bracket);
    expect(settled.match_key).toBe('mill:0:1');
    expect(settled.verdict).toBeNull();
    expect(settled.calls).toBe(verdict.calls);
  }
});

test('cancel pauses and enter resumes the same window; undo opens a fresh stable match key', () => {
  const initial = create();
  const elapsed = stepChat(initial, { kind: 'tick', ms: 3412, counted });
  const paused = stepChat(elapsed, { kind: 'cancel', counted });
  expect(paused.phase).toBe('called_off');
  expect(paused.elapsed).toBe(3412);
  expect(stepChat(paused, { kind: 'tick', ms: 9000, counted })).toBe(paused);
  expect(stepChat(paused, { kind: 'enter', counted })).toEqual(elapsed);
  const closed = stepChat(elapsed, { kind: 'enter', counted });
  const undone = stepChat(closed, { kind: 'undo', counted });
  expect(undone).toEqual(initial);
  const cancelled_theatre = stepChat(closed, { kind: 'cancel', counted });
  expect(cancelled_theatre.phase).toBe('called_off');
  expect(cancelled_theatre.elapsed).toBe(0);
  expect(cancelled_theatre.match_key).toBe('mill:0:1');
  expect(cancelled_theatre.bracket).toBe(closed.bracket);
  expect(stepChat(initial, { kind: 'undo', counted })).toBe(initial);
});

test('chat final result is recorded before theatre and done can undo or restart', () => {
  const list = { ...SAMPLE.chat, items: SAMPLE.chat.items.slice(0, 2) };
  const initial = createChatSession(list, SAMPLE.chat);
  const closed = stepChat(initial, { kind: 'enter', counted });
  expect(finalOrder(closed.bracket)![0]).toBe(list.items[1]!.id);
  const done = stepChat(closed, { kind: 'tick', ms: 4000, counted });
  expect(done.phase).toBe('done');
  expect(done.match_key).toBeNull();
  expect(done.bracket).toBe(closed.bracket);
  expect(stepChat(done, { kind: 'undo', counted })).toEqual(initial);
  expect(stepChat(done, { kind: 'enter', counted })).toEqual(initial);
  expect(stepChat(closed, { kind: 'reset', counted })).toEqual(initial);
  const called_off = stepChat(closed, { kind: 'cancel', counted });
  expect(stepChat(called_off, { kind: 'enter', counted })).toEqual(initial);
});

test('chat rejects unusable window lengths; invalid deltas cannot rewind the clock', () => {
  for (const window_ms of [0, -1, NaN, Infinity, 0.5]) {
    expect(() => createChatSession(SAMPLE.chat, { window_ms })).toThrow(TypeError);
  }
  const initial = create();
  for (const ms of [-1, NaN, Infinity]) expect(stepChat(initial, { kind: 'tick', ms, counted }).elapsed).toBe(0);
});

test('first three SAMPLE windows preserve the winner mill keys', () => {
  let session = create();
  const keys: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    keys.push(session.match_key);
    const closed = stepChat(session, { kind: 'enter', counted });
    expect(closed.verdict!.match_key).toBe(session.match_key);
    session = stepChat(closed, { kind: 'enter', counted });
  }
  expect(keys).toEqual(['mill:0:0', 'mill:0:1', 'mill:1:0']);
  expect(session.phase).toBe('done');
  expect(stepChat(session, { kind: 'enter', counted }).match_key).toBe('mill:0:0');
});

test('window prefix defaults to the title slug and accepts an explicit slug', () => {
  expect(createChatSession(SAMPLE.chat, { window_ms: 15000 }).match_key).toBe('the-mill-question:0:0');
  const session = createChatSession(SAMPLE.chat, { window_ms: 15000, key: 'sample-votes' });
  const closed = stepChat(session, { kind: 'enter', counted });
  const next = stepChat(closed, { kind: 'enter', counted });
  expect(next.match_key).toBe('sample-votes:0:1');
  expect(stepChat(next, { kind: 'undo', counted }).match_key).toBe('sample-votes:0:0');
  expect(stepChat(next, { kind: 'reset', counted }).match_key).toBe('sample-votes:0:0');
});

test.each(['', 'bad_id', '-bad', 'bad-', 'Bad', 'bad--id', ' spaced ', 'mill:0'])('window prefix rejects invalid slug %j', (key) => {
  expect(() => createChatSession(SAMPLE.chat, { window_ms: 15000, key })).toThrow(TypeError);
});
