import { expect, test } from 'vitest';
import { ballotOption, classifyWindow, indexWindow, isCheer, parseBallotPage, parseVote,
  SIMULATED_LABEL, simulateChatPages, tallyAt, wouldFlip } from './ballots.js';
import { decide } from './index.js';

const opened_at = '2026-10-31T12:00:00Z';
const window_ms = 15000;

function item(user_id = '101', text = '1', verdict = 'pass', t_ms = 0) {
  const at = new Date(Date.parse(opened_at) + t_ms).toISOString();
  return {
    message: { message_id: `simulated-${user_id}-${t_ms}`, user_id, at, text },
    decision: { decision_id: '00000000000000000000000001', message_id: `simulated-${user_id}-${t_ms}`,
      at, verdict, kind: verdict === 'hold' ? 'held' : 'would_act', operator: 'ai', reason_codes: ['simulated'] },
    provenance: 'simulated',
  };
}

function page(items: readonly unknown[] = [item()]) {
  return { items, unavailable_count: 0 };
}

function classify(items: ReturnType<typeof item>[]) {
  return classifyWindow(parseBallotPage(JSON.stringify(page(items))).items, opened_at, window_ms);
}

test('the single door maps validated messages and preserves an optional cursor', () => {
  const input = { ...page(), next_cursor: 'chat:100' };
  expect(parseBallotPage(JSON.stringify(input))).toEqual({ items: [{ ...item().message,
    verdict: 'pass', provenance: 'simulated' }], next_cursor: 'chat:100' });
  expect(parseBallotPage(JSON.stringify(page()))).not.toHaveProperty('next_cursor');
  expect(parseBallotPage(JSON.stringify({ items: [], unavailable_count: 2, next_cursor: 'chat:200' })))
    .toEqual({ items: [], next_cursor: 'chat:200' });
  const live = { ...item(), provenance: 'live' };
  expect(parseBallotPage(JSON.stringify(page([live]))).items[0]?.provenance).toBe('live');
});

test.each(['simulated', 'live'] as const)('%s provenance survives classification and indexing for every status', provenance => {
  const events = classify([
    item('191'), item('191', '2', 'pass', 1), item('947', '1', 'bar', 2),
    item('948', '2', 'hold', 3), item('949', '[generated chatter]', 'pass', 4),
  ].map(ballot => ({ ...ballot, provenance })));
  expect(events.map(event => event.status)).toEqual(['counted', 'repeat', 'barred', 'held', 'chatter']);
  expect(events.map(event => event.provenance)).toEqual(Array(5).fill(provenance));
  const window = indexWindow(events);
  expect(window.provenance).toBe(provenance);
  expect(window.events.map(event => event.provenance)).toEqual(Array(5).fill(provenance));
});

test('mixed and empty windows never claim a single provenance', () => {
  const events = classify([item('191'), { ...item('947', '2', 'pass', 1), provenance: 'live' }, item('948', '1', 'pass', 2)]);
  const window = indexWindow(events);
  expect(window.provenance).toBe('mixed');
  expect(window.events.map(event => event.provenance)).toEqual(['simulated', 'live', 'simulated']);
  expect(indexWindow([]).provenance).toBe('mixed');
});

test.each([
  ['1', 0], ['2!', 1], ['1!!', 0], ['2 [generated ballot]', 1], [' Cheer100 1! ', 0],
  ['cheer42 2', 1], ['Cheer100 [generated chatter]', null], ['12', null], ['1.0', null],
  ['1x', null], ['one 1', null], ['[generated] 2', null], ['', null],
] as const)('ballotOption(%j) selects only the first ballot token', (text, option) => {
  expect(ballotOption(text)).toBe(option);
});

test('cheers are recognised by their prefix independently of a ballot', () => {
  expect(isCheer('Cheer100 2')).toBe(true);
  expect(isCheer('Cheer100 [generated chatter]')).toBe(true);
  expect(isCheer('Cheer 2')).toBe(false);
  expect(isCheer('2 Cheer100')).toBe(false);
});

test.each([
  { kind: 'vote', option_index: 0, bits: 100 }, { kind: 'vote', option_index: 0, weight: 2 },
  { kind: 'vote', option_index: 0, cost: 1 }, { kind: 'vote', option_index: -1 },
  { kind: 'vote', option_index: 0.5 }, { kind: 'vote', option_index: NaN },
  { kind: 'vote', option_index: Infinity }, { kind: 'vote', option_index: '0' },
  { kind: 'call', option_index: 0 }, { option_index: 0 }, null, [],
])('parseVote refuses a malformed or widened viewer output: %j', (value) => {
  expect(parseVote(value)).toBeNull();
});

test('parseVote returns a frozen closed viewer output', () => {
  const vote = parseVote({ kind: 'vote', option_index: 1 });
  expect(vote).toEqual({ kind: 'vote', option_index: 1 });
  expect(Object.isFrozen(vote)).toBe(true);
  expect(parseVote({ kind: 'vote', option_index: 0, [Symbol('bits')]: 100 })).toBeNull();
});

test('barred and held ballots never count or consume a viewer ballot', () => {
  const events = classify([item('101', '1', 'bar'), item('102', '2', 'hold', 1),
    item('101', '2', 'pass', 2), item('102', '1', 'pass', 3)]);
  expect(events.map((event) => event.status)).toEqual(['barred', 'held', 'counted', 'counted']);
  expect(events.filter((event) => event.status !== 'counted').every((event) => !('vote' in event))).toBe(true);
  expect(tallyAt(indexWindow(events), window_ms)).toMatchObject({ counted: [1, 1], barred: [1, 0], held: 1, total: 2 });
});

test('one counted ballot per viewer; chatter does not consume a vote or become repeat', () => {
  const events = classify([item('101', '[generated chatter]'), item('101', '1', 'pass', 1),
    item('101', '2', 'pass', 2), item('101', '[generated later chatter]', 'pass', 3)]);
  expect(events.map((event) => event.status)).toEqual(['chatter', 'counted', 'repeat', 'chatter']);
  expect(tallyAt(indexWindow(events), window_ms)).toMatchObject({ counted: [1, 0], repeat: 1, chatter: 2 });
});

test('a cheer counts as exactly one; held and repeat cheers do not add weight', () => {
  const events = classify([item('101', 'Cheer100 2 [generated cheer]'),
    item('101', 'Cheer999 1 [generated cheer]', 'pass', 1),
    item('102', 'Cheer100 1 [generated cheer]', 'hold', 2)]);
  expect(events[0]).toMatchObject({ cheer: true, vote: { kind: 'vote', option_index: 1 } });
  expect(tallyAt(indexWindow(events), window_ms)).toMatchObject({ counted: [0, 1], total: 1, cheers_as_one: 1 });
});

test('moderation status takes precedence even for chatter and previous voters', () => {
  const events = classify([item('101'), item('101', '[generated blocked term]', 'bar', 1),
    item('101', '[generated held chatter]', 'hold', 2)]);
  expect(events.map((event) => event.status)).toEqual(['counted', 'barred', 'held']);
  expect(events[1]).not.toHaveProperty('option');
  expect(tallyAt(indexWindow(events), window_ms)).toMatchObject({ seen: 3, counted: [1, 0], barred: [0, 0], held: 1 });
});

test('window edges are inclusive; timestamps sort stably across page order', () => {
  const first = parseBallotPage(JSON.stringify(page([item('101', '2', 'pass', window_ms),
    item('102', '1', 'pass', 0), item('103', '1', 'pass', -1)])));
  const second = parseBallotPage(JSON.stringify(page([item('102', '2', 'pass', 0),
    item('104', '2', 'pass', window_ms + 1)])));
  const events = classifyWindow([...first.items, ...second.items], opened_at, window_ms);
  expect(events.map(({ t_ms, status, option }) => [t_ms, status, option]))
    .toEqual([[0, 'counted', 0], [0, 'repeat', 1], [window_ms, 'counted', 1]]);
});

const sample = item();
test.each([
  { ...page(), extra: true },
  page([{ ...sample, extra: true }]),
  page([{ ...sample, message: { ...sample.message, extra: true } }]),
  page([{ ...sample, decision: { ...sample.decision, extra: true } }]),
  page([item('0101')]), page([item('simulated_viewer_0101')]), page([item('101', '1', 'unknown')]),
  { ...page(), next_cursor: null },
  page([{ ...sample, decision: { ...sample.decision, rule_id: null } }]),
  page([{ ...sample, decision: { ...sample.decision, decision_id: 'not-a-decision-id' } }]),
  page([{ ...sample, provenance: 'unknown' }]),
])('the Gatehouse schema refuses invalid boundary data: %j', (value) => {
  expect(() => parseBallotPage(JSON.stringify(value))).toThrow('Invalid contract value');
});

test('malformed JSON is rejected at the contract door', () => {
  expect(() => parseBallotPage('{')).toThrow();
});

test('SIMULATED pages are deterministic, bounded, chained and schema-valid', () => {
  const pages = simulateChatPages('mill:0:0', window_ms, opened_at);
  expect(SIMULATED_LABEL).toBe('SIMULATED');
  expect(simulateChatPages('mill:0:0', window_ms, opened_at)).toEqual(pages);
  expect(simulateChatPages('mill:0:1', window_ms, opened_at)).not.toEqual(pages);
  expect(pages.length).toBeGreaterThan(1);
  const ballots = pages.flatMap((text, index) => {
    const parsed = parseBallotPage(text);
    expect(parsed.items.length).toBeLessThanOrEqual(100);
    expect(parsed.next_cursor).toBe(index < pages.length - 1 ? `chat:${(index + 1) * 100}` : undefined);
    for (const ballot of parsed.items) {
      expect(ballot.provenance).toBe('simulated');
      expect(ballot.user_id).toMatch(/^[1-9][0-9]*$/);
      if (!/^[12]!*$/u.test(ballot.text)) expect(ballot.text).toContain('[generated ');
    }
    return parsed.items;
  });
  const events = classifyWindow(ballots, opened_at, window_ms);
  for (const status of ['counted', 'barred', 'held', 'repeat', 'chatter']) {
    expect(events.some((event) => event.status === status)).toBe(true);
  }
  expect(events.some((event) => event.cheer)).toBe(true);
  expect(events.filter((event) => event.text.includes('[generated blocked term]'))).toHaveLength(1);
});

// Golden sample counts measured from .port/winner/duel-engine.js, without importing the prototype.
test.each([
  { match_key: 'mill:0:0', first_at: 622, expected: { counted: [20, 39], held: 2, repeat: 18,
    chatter: 4, cheers_as_one: 4, seen: 110 } },
  { match_key: 'mill:0:1', first_at: 435, expected: { counted: [29, 28], held: 2, repeat: 15,
    chatter: 12, cheers_as_one: 6, seen: 100 } },
  { match_key: 'mill:1:0', first_at: 595, expected: { counted: [28, 25], held: 5, repeat: 12,
    chatter: 6, cheers_as_one: 5, seen: 88 } },
])('$match_key preserves the seeded mix and exposes a burst that would flip the bar', ({ match_key, first_at, expected }) => {
  const ballots = simulateChatPages(match_key, window_ms, opened_at).flatMap((text) => parseBallotPage(text).items);
  const events = classifyWindow(ballots, opened_at, window_ms);
  const tally = tallyAt(indexWindow(events), window_ms);
  expect(tally).toMatchObject(expected);
  expect(events[0]?.t_ms).toBe(first_at);
  expect(wouldFlip(tally)).toBe(true);
  expect(Math.sign(tally.counted[0] - tally.counted[1])).not.toBe(Math.sign(tally.shadow[0] - tally.shadow[1]));
  expect(tally.counted[0]).not.toBe(tally.counted[1]);
  expect(decide(tally.counted, 1, 2).side).not.toBe(decide(tally.shadow, 1, 2).side);
});
