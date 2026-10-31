import { expect, test } from 'vitest';
import { simulateChatPages, tallyAt } from './ballots.js';
import { chatOpenedAt, chatWindowFor, nextChatDue } from './chat-flow.js';
import { SAMPLE } from './sample.js';
import { createChatSession, stepChat } from './session/chat.js';

const initial = () => createChatSession(SAMPLE.chat, { key: 'mill', window_ms: SAMPLE.chat.window_ms });
const windowFor = (session = initial()) => chatWindowFor(session,
  simulateChatPages(session.match_key!, session.window_ms, chatOpenedAt(session)));

test('mill:0:0 jumps only to visible changes and closes with the indexed tally', () => {
  let session = initial();
  const window = windowFor(session);
  const arrivals = new Set(window.events.map(event => event.t_ms)).size;
  const budget = Math.ceil(session.window_ms / 1000) + arrivals + 2;
  let wakeups = 0;
  while (session.phase === 'live') {
    const due = nextChatDue(session, window);
    expect(due).not.toBeNull();
    expect(due).toBeGreaterThan(0);
    if (due === null || ++wakeups > budget) throw new Error('Chat clock exceeded its wakeup budget');
    const counted = tallyAt(window, session.elapsed + due * session.speed).counted;
    session = stepChat(session, { kind: 'tick', ms: due, counted });
  }
  expect(wakeups).toBeLessThanOrEqual(budget);
  expect(session.verdict?.counted).toEqual(tallyAt(window, session.window_ms).counted);
  console.log(`[chat churn] mill:0:0 speed 1: ${wakeups} wakeups <= ${budget} budget; ${arrivals} distinct arrivals; final ${session.verdict?.counted.join('–')}`);
});

test('arrival/second/end deadlines scale with speed; pause stops wakeups; theatre uses real seconds', () => {
  const session = initial();
  const window = windowFor(session);
  const counted = tallyAt(window, 0).counted;
  const fast = stepChat(session, { kind: 'speed', counted });
  expect(nextChatDue(fast, window)).toBe(nextChatDue(session, window)! / 3);
  expect(nextChatDue(stepChat(session, { kind: 'cancel', counted }), window)).toBeNull();
  expect(nextChatDue(session)).toBeNull();
  let called = stepChat(session, { kind: 'pick', side: 1, counted });
  expect(called.remaining_ms).toBe(3000);
  expect(nextChatDue(called, window)).toBe(1000);
  called = stepChat(called, { kind: 'tick', ms: 1250, counted });
  expect(nextChatDue(called, window)).toBe(750);
  const short = { ...session, window_ms: 15500, elapsed: 14990 };
  expect(nextChatDue(short, window)).toBe(510);
});

test('each source page goes through the door and epochs are fixed per match index', () => {
  const session = initial();
  expect(chatOpenedAt(session)).toBe('2026-01-01T00:00:00.000Z');
  expect(() => chatWindowFor(session, ['{}'])).toThrow();
  const closed = stepChat(session, { kind: 'enter', counted: [2, 1] });
  expect(chatOpenedAt(closed)).toBe(chatOpenedAt(session));
  const next = stepChat(closed, { kind: 'enter', counted: [2, 1] });
  expect(chatOpenedAt(next)).toBe('2026-01-01T00:00:00.001Z');
});
