/// <reference types="node" />
import { expect, test } from 'vitest';
import { SAMPLE } from '../sample.js';
import type { DuelEvent, EventKind, Phase } from './shared.js';
import { createShowSession, SHOW_TRANSITIONS, stepShow } from './show.js';
import type { ShowSession } from './show.js';
import { CHAT_TRANSITIONS, createChatSession, stepChat } from './chat.js';
import type { ChatSession } from './chat.js';
import { createLadderSession, LADDER_TRANSITIONS, stepLadder } from './ladder.js';
import type { LadderPhase, LadderSession } from './ladder.js';

const events: readonly DuelEvent[] = [
  { kind: 'pick', side: 0 }, { kind: 'enter' }, { kind: 'cancel' },
  { kind: 'undo' }, { kind: 'tick', ms: 100000 }, { kind: 'reset' }, { kind: 'speed' },
];
const chatEvent = (event: DuelEvent) => ({ ...event, counted: [3, 1] as const });
const phases: readonly Phase[] = ['live', 'verdict', 'called_off', 'done'];
const ladder_phases: readonly LadderPhase[] = ['idle', ...phases];
const show_verdict = stepShow(createShowSession(SAMPLE.bracket), { kind: 'pick', side: 0 });
const show_live = stepShow(show_verdict, { kind: 'enter' });
let show_done = show_verdict;
while (show_done.phase !== 'done') show_done = stepShow(show_done, { kind: 'pick', side: 0 });
const show: Record<Phase, ShowSession> = {
  live: show_live, verdict: show_verdict,
  called_off: stepShow(show_live, { kind: 'cancel' }), done: show_done,
};
const chat_verdict = stepChat(createChatSession(SAMPLE.chat, SAMPLE.chat), chatEvent({ kind: 'enter' }));
const chat_live = stepChat(chat_verdict, chatEvent({ kind: 'enter' }));
let chat_done = chat_verdict;
while (chat_done.phase !== 'done') chat_done = stepChat(chat_done, chatEvent({ kind: 'enter' }));
const chat: Record<Phase, ChatSession> = {
  live: chat_live, verdict: chat_verdict,
  called_off: stepChat(chat_live, chatEvent({ kind: 'cancel' })), done: chat_done,
};
const ladder_live = stepLadder(createLadderSession(
  SAMPLE.ladder.top.items.map((item) => item.id), SAMPLE.ladder.queue.items.map((item) => item.id),
), { kind: 'enter' });
const ladder_verdict = stepLadder(ladder_live, { kind: 'pick', side: 0 });
let ladder_done = ladder_verdict;
while (ladder_done.phase !== 'done') ladder_done = stepLadder(ladder_done, { kind: 'pick', side: 0 });
const ladder_idle = stepLadder(stepLadder(ladder_done, { kind: 'enter' }), { kind: 'undo' });
const ladder: Record<LadderPhase, LadderSession> = {
  idle: ladder_idle, live: ladder_live, verdict: ladder_verdict,
  called_off: stepLadder(ladder_live, { kind: 'cancel' }), done: ladder_done,
};

const show_targets: Record<string, Phase> = {
  record: 'verdict', settle: 'live', tick: 'live', cancel: 'called_off', reopen: 'live', undo: 'live', reset: 'live',
};
const chat_targets: Record<string, Phase> = {
  call: 'verdict', close: 'verdict', clock: 'verdict', settle: 'live', theatre: 'live', pause: 'called_off',
  resume: 'live', undo: 'live', reset: 'live', speed: 'live',
};
const ladder_targets: Record<string, LadderPhase> = {
  start: 'live', record: 'verdict', settle: 'live', tick: 'live', cancel: 'called_off', abandon: 'idle', undo: 'idle', reset: 'idle',
};

test.each(phases.flatMap((phase) => events.map((event) => [phase, event] as const)))('show %s / %j', (phase, event) => {
  const session = show[phase];
  const before = structuredClone(session);
  const row: Partial<Record<EventKind, string>> = SHOW_TRANSITIONS[phase];
  const handler = row[event.kind];
  const next = stepShow(session, event);
  if (handler === undefined) expect(next).toBe(session);
  else expect(next.phase).toBe(show_targets[handler]);
  expect(session).toEqual(before);
});

test.each(phases.flatMap((phase) => events.map((event) => [phase, event] as const)))('chat %s / %j', (phase, event) => {
  const session = chat[phase];
  const before = structuredClone(session);
  const row: Partial<Record<EventKind, string>> = CHAT_TRANSITIONS[phase];
  const handler = row[event.kind];
  const next = stepChat(session, chatEvent(event));
  if (handler === undefined) expect(next).toBe(session);
  else expect(next.phase).toBe(handler === 'speed' ? phase : chat_targets[handler]);
  expect(session).toEqual(before);
});

test.each(ladder_phases.flatMap((phase) => events.map((event) => [phase, event] as const)))('ladder %s / %j', (phase, event) => {
  const session = ladder[phase];
  const before = structuredClone(session);
  const row: Partial<Record<EventKind, string>> = LADDER_TRANSITIONS[phase];
  const handler = row[event.kind];
  const next = stepLadder(session, event);
  if (handler === undefined) expect(next).toBe(session);
  else expect(next.phase).toBe(ladder_targets[handler]);
  expect(session).toEqual(before);
});

test('all transition tables are exported plain data, with a handler name for every present pair', () => {
  for (const table of [SHOW_TRANSITIONS, CHAT_TRANSITIONS, LADDER_TRANSITIONS]) {
    expect(Object.getPrototypeOf(table)).toBe(Object.prototype);
    for (const row of Object.values(table)) {
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      expect(Object.values(row).every((handler) => typeof handler === 'string')).toBe(true);
    }
  }
});
