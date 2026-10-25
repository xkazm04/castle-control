import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';
import { parseJson } from './door.mjs';
import { lotsEvent } from './generated/validators.mjs';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture record');
  return value as Record<string, unknown>;
}
// Read cc-verify's generated fixture in place. Never regenerate or copy it here.
const fixture = record(parseJson(readFileSync(new URL('../../verifier-web/src/simulated-writs.json', import.meta.url), 'utf8')));
const cases: unknown[] = Array.isArray(fixture.cases) ? fixture.cases : [];
const writ = record(record(cases[0]).writ);
const roll = record(writ.roll);
const at = '2026-10-25T12:00:00Z';
const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const draw_id = 'simulated-draw';
const policy = { content: 'question', paid_entry: false, paid_weight: false, subscriber_only: false,
  channel_points: false, free_entry_equal_odds: true, regions: [], prize_value_usd_cents: 0,
  registration_confirmed: false, official_rules: true, twitch_disclaimer: true };
const rules = { pool: { kind: 'chatters' }, winner_count: 1, cooldown_s: 0, cohort_caps: [],
  weight_curve: { kind: 'equal' }, free_join_equal_odds: true };
const draw = { draw_id, name: 'Simulated draw', policy, rules };
const sealed = { roll, seal: writ.seal };
const sealResult = { draw_id, draw_run_id: id, sealed };
const castResult = { draw_run_id: id, writ_id: id,
  cast: { seal: writ.seal, winners: writ.winners, label: 'drand-quicknet' } };
const weight_table = { rows: [{ user_id: '9007199254740993', weight: 1 }], newcomer_weight: 1,
  heaviest_weight: 1, newcomers_to_outweigh_heaviest: 2 };
const entry = { user_id: '9007199254740993', source_message_id: 'simulated-message',
  entered_at: at, cohorts: ['simulated'], weight: 1 };
const samples: Array<{ method: RpcMethod; params: Record<string, unknown>; result: Record<string, unknown> }> = [
  { method: 'lots.draw.list', params: {}, result: { draws: [draw] } },
  { method: 'lots.draw.upsert', params: { draw }, result: draw },
  { method: 'lots.draw.check', params: { policy }, result: { result: 'ok', reasons: [] } },
  { method: 'lots.roll.lookup', params: { draw_id, user_id: entry.user_id }, result: { draw_id, entry } },
  { method: 'lots.roll.seal', params: { draw_id, source: 'drand_quicknet', margin_s: 6 }, result: sealResult },
  { method: 'lots.cast', params: { draw_run_id: id }, result: castResult },
  { method: 'lots.writ.get', params: { writ_id: id }, result: writ },
];

test.each(samples)('$method has typed params and result', ({ method, params, result }) => {
  expect(parseParams(method, params)).toEqual(params);
  expect(parseResult(method, JSON.stringify(result))).toEqual(result);
});

test.each(samples)('$method rejects unknown fields and null on both sides', ({ method, params, result }) => {
  expect(() => parseParams(method, { ...params, extra: true })).toThrow();
  expect(() => parseResult(method, JSON.stringify({ ...result, extra: true }))).toThrow();
  expect(() => parseParams(method, null)).toThrow();
  expect(() => parseResult(method, 'null')).toThrow();
  for (const key of Object.keys(params)) expect(() => parseParams(method, { ...params, [key]: null })).toThrow();
  for (const key of Object.keys(result)) {
    expect(() => parseResult(method, JSON.stringify({ ...result, [key]: null }))).toThrow();
  }
});

test('all 1,000 cc-verify fixture writs parse with their original JSON shape', () => {
  expect(fixture.label).toBe('simulated');
  expect(cases).toHaveLength(1000);
  for (const item of cases) {
    const value = record(item);
    const parsed = parseResult('lots.writ.get', JSON.stringify(value.writ));
    expect(parsed).toEqual(value.writ);
    expect(parsed.winners).toEqual(value.winners);
  }
});

test('nested writ records reject unknown fields and null', () => {
  for (const value of [
    { ...writ, proof: { ...record(writ.proof), extra: true } },
    { ...writ, roll: { ...roll, extra: true } },
    { ...writ, roll: { ...roll, randomness: { ...record(roll.randomness), extra: true } } },
    { ...writ, roll: { ...roll, entries: [{ handle: 'simulated', weight: 1, extra: true }] } },
    { ...writ, proof: { source: 'streamer_commit', seed: null } },
  ]) expect(() => parseResult('lots.writ.get', JSON.stringify(value))).toThrow();
});

test('round strings are canonical positive u64, including their upper bound', () => {
  for (const round of ['1', '9007199254740993', '18446744073709551615']) {
    const value = { ...writ, roll: { ...roll, randomness: { ...record(roll.randomness), round } } };
    expect(parseResult('lots.writ.get', JSON.stringify(value))).toEqual(value);
  }
  for (const round of ['', '0', '01', '-1', '+1', '1.5', '1e3', '1\n', '18446744073709551616', 1, null]) {
    const value = { ...writ, roll: { ...roll, randomness: { ...record(roll.randomness), round } } };
    expect(() => parseResult('lots.writ.get', JSON.stringify(value))).toThrow();
  }
});

test('optional values omit unknowns and refuse explicit null', () => {
  expect(parseResult('lots.roll.lookup', JSON.stringify({ draw_id }))).toEqual({ draw_id });
  expect(() => parseResult('lots.roll.lookup', JSON.stringify({ draw_id, entry: null }))).toThrow();
  expect(() => parseParams('lots.draw.check', { policy: { ...policy, minimum_age: null } })).toThrow();
  expect(parseParams('lots.draw.check', { policy: { ...policy, minimum_age: 18 } })).toBeDefined();
  const empty = { draw_id, weight_table: { rows: [], newcomer_weight: 1, heaviest_weight: 0 } };
  expect(lotsEvent({ kind: 'lots.roll', payload: empty })).toBe(true);
  expect(lotsEvent({ kind: 'lots.roll', payload: { ...empty,
    weight_table: { ...empty.weight_table, newcomers_to_outweigh_heaviest: null } } })).toBe(false);
});

test('three event names bind to typed payloads without changing transport', () => {
  const events = [{ kind: 'lots.roll', payload: { draw_id, weight_table } },
    { kind: 'lots.sealed', payload: sealResult }, { kind: 'lots.cast', payload: castResult }];
  for (const value of events) {
    expect(lotsEvent(value)).toBe(true);
    expect(lotsEvent({ ...value, extra: true })).toBe(false);
    expect(lotsEvent({ ...value, payload: { ...value.payload, extra: true } })).toBe(false);
    expect(lotsEvent({ ...value, payload: null })).toBe(false);
  }
  expect(lotsEvent({ kind: 'lots.roll', payload: castResult })).toBe(false);
  expect(lotsEvent({ kind: 'beacons.contribution', payload: weight_table })).toBe(false);
});

test('draw configuration bounds and numeric IDs match the domain', () => {
  for (const winner_count of [0, -1, 1.5, 65536]) {
    expect(() => parseParams('lots.draw.upsert', { draw: { ...draw, rules: { ...rules, winner_count } } })).toThrow();
  }
  for (const user_id of [0, '0', '01', '123\n', 'x', '1'.repeat(33)]) {
    expect(() => parseParams('lots.roll.lookup', { draw_id, user_id })).toThrow();
  }
  for (const pool of [{ kind: 'keyword', keyword: '' }, { kind: 'keyword', keyword: 'two words' },
    { kind: 'keyword', keyword: 'x\u0085y' }, { kind: 'chatters', keyword: 'simulated' }]) {
    expect(() => parseParams('lots.draw.upsert', { draw: { ...draw, rules: { ...rules, pool } } })).toThrow();
  }
  for (const weight_curve of [{ kind: 'concave', max_units: 0 }, { kind: 'concave', max_units: 65536 },
    { kind: 'equal', max_units: 1 }]) {
    expect(() => parseParams('lots.draw.upsert', { draw: { ...draw, rules: { ...rules, weight_curve } } })).toThrow();
  }
  expect(() => parseParams('lots.draw.check', { policy: { ...policy, prize_value_usd_cents: 9007199254740992 } })).toThrow();
  for (const sealed_at of [at.replace('Z', '.123Z'), '2026-02-30T00:00:00Z']) {
    expect(() => parseResult('lots.writ.get', JSON.stringify({ ...writ, roll: { ...roll, sealed_at } }))).toThrow();
  }
  for (const [key, value] of [['entries', []], ['entries', Array.from({ length: 10001 }, () => ({ handle: 'simulated', weight: 1 }))],
    ['sealed_at', '1969-12-31T23:59:59Z'], ['version', 2], ['winner_count', 0], ['margin_s', 0]] as const) {
    expect(() => parseResult('lots.writ.get', JSON.stringify({ ...writ, roll: { ...roll, [key]: value } }))).toThrow();
  }
  expect(() => parseResult('lots.writ.get', JSON.stringify({ ...writ, winners: [] }))).toThrow();
  expect(() => parseResult('lots.roll.lookup', JSON.stringify({ draw_id, entry: { ...entry,
    cohorts: ['simulated', 'simulated'] } }))).toThrow();
  expect(parseParams('lots.draw.upsert', { draw: { ...draw, rules: { ...rules,
    pool: { kind: 'keyword', keyword: 'x\ufeffy' } } } })).toBeDefined();
});
