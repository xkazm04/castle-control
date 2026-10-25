import { expect, test } from 'vitest';
import { parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';
import { consensusEvent } from './generated/validators.mjs';

// All messages and results in this file are generated, simulated test data.
const at = '2026-10-25T12:00:00Z';
const hash = 'a'.repeat(64);
const source = 'simulated recording';
const gap = { from: at, to: '2026-10-25T12:00:10Z' };
const rule = { rule_id: 'simulated-links', name: 'Simulated links', rule_class: 'pattern',
  mode: 'shadow', action: 'delete', delivery: 'simulated', pattern: 'example' };
const configuration = { rules: [rule], bank: 'simulated-near-misses', judge: 'simulated-blind-judge',
  prompts: ['Simulated prompt'] };
const params = { recording: 'simulated-recording', configuration };
const outcome = { message_id: 'simulated-message', source, at, state: 'acted',
  verdict: 'bar', action: 'delete', rule_id: 'simulated-links', passed: true };
const run = { label: 'simulated', source, instrument_hash: hash,
  instrument: { rules_hash: hash, bank_hash: hash, judge_hash: hash, prompts_hash: hash },
  outcomes: [outcome], summary: { passes: 1,
    states: { acted: 1, not_provoked: 0, not_evaluable: 0, judge_pending: 0, judge_void: 0, engine_failed: 0 },
    over_moderation: { evaluated: 1, false_positives: 0 } }, gaps: [gap] };
const consensusParams = { window_s: 900, filter: { kind: 'all' } };
const direction = { key: 'simulated-direction', label: 'Simulated opinion', share: 0.5,
  delta_3m: -0.1, messages: 2, series: [{ at, share: 0.5 }] };
const consensus = { at, window_s: 900, filter: { kind: 'all' }, directions: [direction], shed_count: 3 };
const imported = { recording: 'simulated-recording', source, message_count: 1, gaps: [gap] };
const message = { message_id: 'simulated-message', user_id: '9007199254740993', at, text: 'Simulated chat' };
const samples: Array<{ method: RpcMethod; params: Record<string, unknown>; result: Record<string, unknown> }> = [
  { method: 'gatehouse.consensus.get', params: consensusParams, result: consensus },
  { method: 'gatehouse.drill.run', params, result: run },
  { method: 'gatehouse.drill.diff', params: { recording: params.recording, baseline: configuration, candidate: configuration },
    result: { label: 'simulated', baseline: run, candidate: run,
      changes: [{ message_id: message.message_id, before: 'acted', after: 'not_provoked' }] } },
  { method: 'gatehouse.recording.import', params: { source, messages: [message], gaps: [gap] }, result: imported },
];

test.each(samples)('$method accepts its typed simulated payloads', ({ method, params, result }) => {
  expect(parseParams(method, params)).toEqual(params);
  expect(parseResult(method, JSON.stringify(result))).toEqual(result);
});

test.each(samples)('$method rejects unknown fields and null', ({ method, params, result }) => {
  expect(() => parseParams(method, { ...params, extra: true })).toThrow();
  expect(() => parseResult(method, JSON.stringify({ ...result, extra: true }))).toThrow();
  expect(() => parseParams(method, null)).toThrow();
  expect(() => parseResult(method, 'null')).toThrow();
  for (const key of Object.keys(params)) expect(() => parseParams(method, { ...params, [key]: null })).toThrow();
  for (const key of Object.keys(result)) {
    expect(() => parseResult(method, JSON.stringify({ ...result, [key]: null }))).toThrow();
  }
});

test('instrument hashes are canonical SHA-256 hex, including component hashes', () => {
  for (const instrument_hash of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'z'.repeat(64), `${hash}\n`, null, 7]) {
    expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run, instrument_hash }))).toThrow();
    for (const key of Object.keys(run.instrument)) {
      expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run,
        instrument: { ...run.instrument, [key]: instrument_hash } }))).toThrow();
    }
  }
});

test('six named states preserve direct passes, source, gaps and the over-moderation axis', () => {
  for (const state of Object.keys(run.summary.states)) {
    const value = { ...run, outcomes: [{ message_id: message.message_id, source, at, state }] };
    expect(parseResult('gatehouse.drill.run', JSON.stringify(value))).toEqual(value);
  }
  const value = parseResult('gatehouse.drill.run', JSON.stringify(run));
  expect(value.summary.passes).toBe(1);
  expect(value.summary.over_moderation.false_positives).toBe(0);
  expect(value.gaps).toEqual([gap]);
  for (const key of ['state', 'source', 'verdict', 'action', 'rule_id', 'passed']) {
    expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run,
      outcomes: [{ ...outcome, [key]: null }] }))).toThrow();
  }
  for (const bad of [{ ...outcome, source: '' }, { ...outcome, state: 'pass' }, { ...outcome, extra: true }]) {
    expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run, outcomes: [bad] }))).toThrow();
  }
  expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run, label: 'live' }))).toThrow();
});

test('a diff retains each instrument separately instead of pooling incompatible runs', () => {
  const candidate = { ...run, instrument_hash: 'b'.repeat(64) };
  const value = { label: 'simulated', baseline: run, candidate, changes: [] };
  expect(parseResult('gatehouse.drill.diff', JSON.stringify(value))).toEqual(value);
});

test('consensus filters and bounded shares and deltas have closed shapes', () => {
  for (const filter of [{ kind: 'all' }, { kind: 'emotes' }, { kind: 'text' }, { kind: 'emote', emote: 'simulated-emote' }]) {
    expect(parseParams('gatehouse.consensus.get', { window_s: 900, filter })).toBeDefined();
  }
  for (const filter of [{ kind: 'emote' }, { kind: 'emote', emote: '' }, { kind: 'all', emote: 'x' },
    { kind: 'emote', emote: null }, { kind: 'unknown' }]) {
    expect(() => parseParams('gatehouse.consensus.get', { window_s: 900, filter })).toThrow();
  }
  for (const window_s of [0, -1, 0.5, 4294967296]) {
    expect(() => parseParams('gatehouse.consensus.get', { ...consensusParams, window_s })).toThrow();
  }
  for (const [key, value] of [['share', -0.01], ['share', 1.01], ['delta_3m', -1.01], ['delta_3m', 1.01],
    ['messages', -1], ['messages', 0.5], ['extra', true]] as const) {
    expect(() => parseResult('gatehouse.consensus.get', JSON.stringify({ ...consensus,
      directions: [{ ...direction, [key]: value }] }))).toThrow();
  }
});

test('only the planned consensus event binds a closed, finite payload', () => {
  const event = { kind: 'gatehouse.consensus', payload: consensus };
  expect(consensusEvent(event)).toBe(true);
  expect(consensusEvent({ ...event, kind: 'gatehouse.drill' })).toBe(false);
  expect(consensusEvent({ ...event, extra: true })).toBe(false);
  expect(consensusEvent({ ...event, payload: null })).toBe(false);
  const { delta_3m: omitted, ...withoutDelta } = direction;
  expect(omitted).toBe(-0.1);
  expect(consensusEvent({ ...event, payload: { ...consensus, directions: [withoutDelta] } })).toBe(true);
  for (const value of [NaN, Infinity, -Infinity, null]) {
    for (const key of ['share', 'delta_3m']) {
      expect(consensusEvent({ ...event, payload: { ...consensus,
        directions: [{ ...direction, [key]: value }] } })).toBe(false);
    }
  }
});

test('nested recording, summary and configuration records reject unknowns and null', () => {
  for (const bad of [{ ...message, extra: true }, { ...message, text: null }, { ...message, user_id: 1 }]) {
    expect(() => parseParams('gatehouse.recording.import', { source, messages: [bad], gaps: [] })).toThrow();
  }
  expect(() => parseParams('gatehouse.recording.import', { source: '', messages: [], gaps: [] })).toThrow();
  expect(() => parseParams('gatehouse.drill.run', { ...params, configuration: { ...configuration, extra: true } })).toThrow();
  expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run,
    gaps: [{ ...gap, extra: true }] }))).toThrow();
  for (const summary of [{ ...run.summary, passes: -1 }, { ...run.summary, passes: 0.5 },
    { ...run.summary, extra: true }, { ...run.summary, states: { ...run.summary.states, extra: 0 } },
    { ...run.summary, over_moderation: { evaluated: 0, false_positives: null } }]) {
    expect(() => parseResult('gatehouse.drill.run', JSON.stringify({ ...run, summary }))).toThrow();
  }
});
