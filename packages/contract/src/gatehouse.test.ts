import { expect, test } from 'vitest';
import { parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';

const at = '2026-10-25T12:00:00Z';
const decision_id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const rule = { rule_id: 'simulated-links', name: 'Simulated links', rule_class: 'pattern',
  mode: 'shadow', action: 'ban', delivery: 'streamer' };
const grant = { expires_at: '2026-10-25T13:00:00Z', max_bans_per_hour: 3, breaker_tripped: false };
const acknowledgement = { at, reason: 'Simulated consent' };
const decision = { decision_id, message_id: 'simulated-message', kind: 'ban_pending',
  verdict: 'hold', operator: 'human', at, simulated: true,
  reason_codes: ['simulated_pattern_match'], message_text: 'Simulated original message' };

const samples: Array<{ method: RpcMethod; params: Record<string, unknown>; result: Record<string, unknown> }> = [
  { method: 'gatehouse.rules.list', params: {}, result: { rules: [rule] } },
  { method: 'gatehouse.rules.upsert', params: { rule }, result: rule },
  { method: 'gatehouse.rules.setMode', params: { rule_id: rule.rule_id, mode: 'armed', acknowledgement }, result: decision },
  { method: 'gatehouse.ban.confirm', params: { decision_id }, result: decision },
  { method: 'gatehouse.ban.dismiss', params: { decision_id }, result: decision },
  { method: 'gatehouse.decision.undo', params: { decision_id }, result: decision },
  { method: 'gatehouse.petition.resolve', params: { decision_id, outcome: 'upheld' }, result: decision },
];

test.each(samples)('$method round-trips typed params and results', ({ method, params, result }) => {
  expect(parseParams(method, params)).toEqual(params);
  expect(parseResult(method, JSON.stringify(result))).toEqual(result);
});

test.each(samples)('$method refuses null and unknown fields in both directions', ({ method, params, result }) => {
  expect(() => parseParams(method, null)).toThrow();
  expect(() => parseResult(method, 'null')).toThrow();
  expect(() => parseParams(method, { ...params, extra: true })).toThrow();
  expect(() => parseResult(method, JSON.stringify({ ...result, extra: true }))).toThrow();
  for (const key of Object.keys(params)) {
    expect(() => parseParams(method, { ...params, [key]: null })).toThrow();
  }
  for (const key of Object.keys(result)) {
    expect(() => parseResult(method, JSON.stringify({ ...result, [key]: null }))).toThrow();
  }
});

test('pattern grant and both breaker states round-trip; classifier and rail grants fail', () => {
  for (const breaker_tripped of [false, true]) {
    const pattern = { ...rule, mode: 'armed', auto_ban_grant: { ...grant, breaker_tripped } };
    expect(parseParams('gatehouse.rules.upsert', { rule: pattern })).toEqual({ rule: pattern });
    expect(parseResult('gatehouse.rules.upsert', JSON.stringify(pattern))).toEqual(pattern);
  }
  for (const rule_class of ['classifier', 'rail']) {
    const invalid = { ...rule, rule_class, mode: 'armed', auto_ban_grant: grant };
    expect(() => parseParams('gatehouse.rules.upsert', { rule: invalid })).toThrow();
    expect(() => parseResult('gatehouse.rules.upsert', JSON.stringify(invalid))).toThrow();
    const valid = { ...rule, rule_class, mode: 'armed' };
    expect(parseResult('gatehouse.rules.upsert', JSON.stringify(valid))).toEqual(valid);
  }
  for (const max_bans_per_hour of [0, -1, 1.5, 4294967296]) {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: {
      ...rule, auto_ban_grant: { ...grant, max_bans_per_hour },
    } })).toThrow();
  }
});

test('optional and nested keys reject null instead of defaulting', () => {
  for (const key of [...Object.keys(rule), 'auto_ban_grant']) {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: { ...rule, [key]: null } })).toThrow();
  }
  for (const key of Object.keys(grant)) {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: {
      ...rule, auto_ban_grant: { ...grant, [key]: null },
    } })).toThrow();
  }
  for (const key of [...Object.keys(decision), 'rule_id']) {
    expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify({ ...decision, [key]: null }))).toThrow();
  }
  for (const key of Object.keys(acknowledgement)) {
    expect(() => parseParams('gatehouse.rules.setMode', { rule_id: rule.rule_id, mode: 'armed',
      acknowledgement: { ...acknowledgement, [key]: null } })).toThrow();
  }
  expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify({ ...decision, reason_codes: [null] }))).toThrow();
});

test('rail shadowing is refused; arming requires explicit nonblank consent', () => {
  expect(() => parseParams('gatehouse.rules.upsert', { rule: { ...rule, rule_class: 'rail' } })).toThrow();
  const base = { rule_id: rule.rule_id, mode: 'armed' };
  expect(() => parseParams('gatehouse.rules.setMode', base)).toThrow();
  for (const invalid of [null, true, { at, reason: ' ' }, { at: 'yesterday', reason: 'Simulated' }]) {
    expect(() => parseParams('gatehouse.rules.setMode', { ...base, acknowledgement: invalid })).toThrow();
  }
  const shadow = { rule_id: rule.rule_id, mode: 'shadow' };
  expect(parseParams('gatehouse.rules.setMode', shadow)).toEqual(shadow);
});

test('pending bans need original text; completed decisions can omit it', () => {
  const { message_text, ...base } = decision;
  expect(message_text).toBe('Simulated original message');
  expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify(base))).toThrow();
  expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify({ ...base, summary: message_text }))).toThrow();
  expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify({ ...decision, message_text: '' }))).toThrow();
  const completed = { ...base, kind: 'undone', rule_id: 'simulated-links' };
  expect(parseResult('gatehouse.decision.undo', JSON.stringify(completed))).toEqual(completed);
});

test('unknown enum values are errors; petition outcomes both round-trip', () => {
  for (const key of ['rule_class', 'mode', 'action']) {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: { ...rule, [key]: 'unknown' } })).toThrow();
  }
  for (const key of ['kind', 'verdict', 'operator']) {
    expect(() => parseResult('gatehouse.ban.confirm', JSON.stringify({ ...decision, [key]: 'unknown' }))).toThrow();
  }
  for (const outcome of ['upheld', 'overturned']) {
    expect(parseParams('gatehouse.petition.resolve', { decision_id, outcome })).toEqual({ decision_id, outcome });
  }
  expect(() => parseParams('gatehouse.petition.resolve', { decision_id, outcome: 'unknown' })).toThrow();
});
