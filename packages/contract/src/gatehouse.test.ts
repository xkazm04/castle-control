import { expect, test } from 'vitest';
import { parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';

const at = '2026-10-25T12:00:00Z';
const decision_id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const rule = { rule_id: 'simulated-links', name: 'Simulated links', rule_class: 'pattern',
  mode: 'shadow', action: 'ban', delivery: 'streamer', pattern: 'simulated' };
function ruleFor(rule_class: string): Record<string, unknown> {
  const value: Record<string, unknown> = { ...rule, rule_class, mode: 'armed' };
  if (rule_class !== 'pattern') delete value.pattern;
  if (rule_class === 'classifier') value.text = 'Simulated classifier rule';
  return value;
}
const strikes = { count: 3, window_s: 60, then: 'timeout', then_timeout_s: 30 };
const actions = ['warn', 'delete', 'timeout', 'ban', 'hold'];

function checkRule(value: Record<string, unknown>, valid: boolean) {
  if (valid) {
    expect(parseParams('gatehouse.rules.upsert', { rule: value })).toEqual({ rule: value });
    expect(parseResult('gatehouse.rules.upsert', JSON.stringify(value))).toEqual(value);
    expect(parseResult('gatehouse.rules.list', JSON.stringify({ rules: [value] }))).toEqual({ rules: [value] });
  } else {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: value })).toThrow();
    expect(() => parseResult('gatehouse.rules.upsert', JSON.stringify(value))).toThrow();
    expect(() => parseResult('gatehouse.rules.list', JSON.stringify({ rules: [value] }))).toThrow();
  }
}
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
    const invalid = { ...ruleFor(rule_class), auto_ban_grant: grant };
    expect(() => parseParams('gatehouse.rules.upsert', { rule: invalid })).toThrow();
    expect(() => parseResult('gatehouse.rules.upsert', JSON.stringify(invalid))).toThrow();
    const valid = ruleFor(rule_class);
    expect(parseResult('gatehouse.rules.upsert', JSON.stringify(valid))).toEqual(valid);
  }
  for (const max_bans_per_hour of [0, -1, 1.5, 4294967296]) {
    expect(() => parseParams('gatehouse.rules.upsert', { rule: {
      ...rule, auto_ban_grant: { ...grant, max_bans_per_hour },
    } })).toThrow();
  }
});

test('optional and nested keys reject null instead of defaulting', () => {
  for (const key of [...Object.keys(rule), 'auto_ban_grant', 'text', 'timeout_s', 'strikes']) {
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
  expect(() => parseParams('gatehouse.rules.upsert', { rule: { ...ruleFor('rail'), mode: 'shadow' } })).toThrow();
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

test('evaluation settings are required nonblank and exclusive by class', () => {
  for (const [rule_class, key, other] of [['pattern', 'pattern', 'text'], ['classifier', 'text', 'pattern']] as const) {
    checkRule(ruleFor(rule_class), true);
    const missing = ruleFor(rule_class);
    delete missing[key];
    checkRule(missing, false);
    for (const invalid of ['', ' \t\n', false, 7]) checkRule({ ...ruleFor(rule_class), [key]: invalid }, false);
    checkRule({ ...ruleFor(rule_class), [other]: 'Simulated extra setting' }, false);
  }
  for (const [text, valid] of [['x'.repeat(500), true], ['😀'.repeat(500), true], ['x'.repeat(501), false]] as const) {
    checkRule({ ...ruleFor('classifier'), text }, valid);
  }
  checkRule({ ...rule, pattern: '[' }, true); // Regex compilation belongs to cc-gatehouse.
});

test('rail detectors forbid evaluation settings and strikes', () => {
  checkRule(ruleFor('rail'), true);
  for (const [key, setting] of [['pattern', 'simulated'], ['text', 'Simulated'], ['strikes', strikes]] as const) {
    checkRule({ ...ruleFor('rail'), [key]: setting }, false);
  }
});

test('timeout durations are bounded and required only for timeout actions', () => {
  for (const action of actions) {
    for (const seconds of [undefined, 1, 1209600, 0, 1209601, -1, 1.5, 4294967296]) {
      const valid = action === 'timeout' ? seconds === 1 || seconds === 1209600 : seconds === undefined;
      checkRule({ ...rule, action, ...(seconds === undefined ? {} : { timeout_s: seconds }) }, valid);
      const policy = { count: 3, window_s: 60, then: action,
        ...(seconds === undefined ? {} : { then_timeout_s: seconds }) };
      checkRule({ ...rule, strikes: policy }, valid);
    }
  }
});

test('strike counts and windows are positive u32 and classifier cannot escalate to ban', () => {
  for (const key of ['count', 'window_s']) {
    for (const [number, valid] of [[1, true], [4294967295, true], [0, false], [-1, false],
      [1.5, false], [4294967296, false]] as const) {
      checkRule({ ...rule, strikes: { ...strikes, [key]: number } }, valid);
    }
  }
  for (const rule_class of ['pattern', 'classifier']) {
    for (const action of actions) {
      const policy = { count: 3, window_s: 60, then: action, ...(action === 'timeout' ? { then_timeout_s: 30 } : {}) };
      checkRule({ ...ruleFor(rule_class), strikes: policy }, rule_class !== 'classifier' || action !== 'ban');
    }
  }
  checkRule({ ...rule, strikes: { ...strikes, then: 'unknown' } }, false);
});

test('strike records and every optional key reject null and unknown fields', () => {
  for (const key of Object.keys(strikes)) {
    checkRule({ ...rule, strikes: { ...strikes, [key]: null } }, false);
  }
  const withoutDuration = { count: 3, window_s: 60, then: 'warn' };
  checkRule({ ...rule, strikes: withoutDuration }, true);
  checkRule({ ...rule, strikes: { ...withoutDuration, then_timeout_s: null } }, false);
  checkRule({ ...rule, strikes: { ...strikes, extra: true } }, false);
  for (const key of ['count', 'window_s', 'then']) {
    const missing: Record<string, unknown> = { ...strikes };
    delete missing[key];
    checkRule({ ...rule, strikes: missing }, false);
  }
  for (const key of ['pattern', 'text', 'timeout_s', 'strikes']) checkRule({ ...rule, [key]: null }, false);
  for (const key of ['pattern', 'text', 'timeout_s', 'strikes', 'auto_ban_grant']) {
    checkRule({ ...ruleFor('rail'), [key]: null }, false);
  }
  checkRule({ ...rule, extra: true }, false);
});
