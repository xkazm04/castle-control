/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { maproomTurnRun, parseMethodParams } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';
import type { TiltyardAction } from '@castle-control/contract';
import { parseDuelList } from '../list.js';
import type { Bracket } from '../bracket.js';
import { createChatSession, stepChat } from './chat.js';
import type { ChatEvent, ChatSession } from './chat.js';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid simulated fixture record');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Empty simulated fixture inventory');
  return value;
}
function counted(value: unknown): readonly [number, number] {
  const c = record(value);
  if (typeof c.left !== 'number' || typeof c.right !== 'number' || !Number.isInteger(c.left) || !Number.isInteger(c.right)
    || c.left < 0 || c.right < 0) throw new Error('Invalid simulated counts');
  return [c.left, c.right];
}
function event(action: TiltyardAction, tally: readonly [number, number]): ChatEvent {
  if (action.kind === 'start') throw new Error('Start is a constructor');
  if (action.kind === 'pick') return { kind: 'pick', side: action.side === 'left' ? 0 : 1, counted: tally };
  return { ...action, counted: tally };
}
function bracket(value: Bracket) {
  return { seeds: value.seeds, rounds: value.rounds.map(round => round.map(match => ({
    a: match.a, b: match.b, ...(match.winner === null ? {} : { winner: match.winner }),
  }))) };
}
/** Wire adaptations only: the actual reducer is unchanged. Counts are supplied
 * at the post-verdict host boundary; the engine owns winner/history/theatre. */
function normalized(s: ChatSession) {
  return { phase: s.phase, bracket: bracket(s.bracket), history: s.history.map(bracket), elapsed_ms: s.elapsed,
    ...(s.match_key === null ? {} : { match_key: s.match_key }), speed: s.speed,
    calls: s.calls.map(call => ({ winner: call.winner, counted: { left: call.counted[0], right: call.counted[1] } })),
    remaining_ms: s.remaining_ms, ...(s.verdict ? { verdict: {
      a: s.verdict.a, b: s.verdict.b, verdict: { side: s.verdict.side === 0 ? 'left' : 'right', how: s.verdict.how },
      counted: { left: s.verdict.counted[0], right: s.verdict.counted[1] }, elapsed_ms: s.verdict.elapsed,
      round: String(s.verdict.round), index: s.verdict.index, match_key: s.verdict.match_key,
    } } : {}),
  };
}
const fixture = record(parseJson(readFileSync(new URL('../../../../crates/cc-types/tests/fixtures/tiltyard-transitions.json', import.meta.url), 'utf8')));
test('TS Chat and Rust replay the same generated SIMULATED transition inventory', () => {
  expect(fixture.simulated).toBe(true);
  let transitions = 0;
  for (const input of array(fixture.cases)) {
    const row = record(input);
    const start = parseMethodParams(maproomTurnRun, { action: row.start }).action;
    if (start.kind !== 'start') throw new Error('Missing simulated start');
    const list = parseDuelList({ title: start.list.title, ...(start.list.prompt === undefined ? {} : { prompt: start.list.prompt }),
      items: start.list.items.map(item => ({ id: item.id, title: item.title, by: item.by, ...(item.note === undefined ? {} : { note: item.note }) })) });
    let session = createChatSession(list, { key: start.key, window_ms: start.window_ms });
    expect(normalized(session), String(row.name)).toEqual(row.expected_start);
    for (const input of array(row.steps)) {
      const step = record(input);
      const action = parseMethodParams(maproomTurnRun, { action: step.action }).action;
      session = stepChat(session, event(action, counted(step.counted)));
      expect(normalized(session), `${String(row.name)} / ${transitions}`).toEqual(step.expected);
      transitions++;
    }
  }
  expect(transitions).toBeGreaterThan(60);
});
