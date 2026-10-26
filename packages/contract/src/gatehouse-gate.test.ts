import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { parseError, parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';

// Generated, simulated fixtures shared byte-for-byte with the Rust tests.
const input: unknown = parseJson(readFileSync(new URL(
  '../../../crates/cc-types/tests/fixtures/gatehouse_gate.json', import.meta.url,
), 'utf8'));
type Fixture = { method: RpcMethod; params: Record<string, unknown>; result: Record<string, unknown> };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture object');
  return value as Record<string, unknown>;
}
function method(value: unknown): RpcMethod {
  switch (value) {
    case 'gatehouse.held.resolve': case 'gatehouse.delay.set':
    case 'gatehouse.shield.set': case 'gatehouse.lease.end': return value;
    default: throw new Error('Unexpected gate fixture method');
  }
}
if (!Array.isArray(input)) throw new Error('Expected simulated fixture array');
const fixtures: Fixture[] = input.map((value: unknown) => {
  const fixture = record(value), request = record(fixture.request);
  return { method: method(request.method), params: record(request.params), result: record(fixture.result) };
});

test('shared gate fixtures round-trip all four typed method pairs', () => {
  expect(fixtures).toHaveLength(9);
  expect(new Set(fixtures.map((fixture) => fixture.method)).size).toBe(4);
  for (const fixture of fixtures) {
    expect(parseParams(fixture.method, fixture.params)).toEqual(fixture.params);
    expect(parseResult(fixture.method, JSON.stringify(fixture.result))).toEqual(fixture.result);
  }
});

test('gate records reject unknown fields, missing required fields and explicit nulls', () => {
  for (const fixture of fixtures) {
    const { method, params, result } = fixture;
    for (const bad of [null, { ...params, extra: true }]) {
      expect(() => parseParams(method, bad)).toThrow();
    }
    for (const key of Object.keys(params)) {
      expect(() => parseParams(method, { ...params, [key]: null })).toThrow();
      const missing = { ...params };
      delete missing[key];
      expect(() => parseParams(method, missing)).toThrow();
    }
    for (const bad of [null, { ...result, extra: true }]) {
      expect(() => parseResult(method, JSON.stringify(bad))).toThrow();
    }
    for (const key of Object.keys(result)) {
      expect(() => parseResult(method, JSON.stringify({ ...result, [key]: null }))).toThrow();
    }
    if ('decision_id' in result) {
      for (const key of ['rule_id', 'message_text']) {
        expect(() => parseResult(method, JSON.stringify({ ...result, [key]: null }))).toThrow();
      }
    }
  }
});

test('delay seconds and Shield states are strict in both directions', () => {
  for (const delay_s of [-1, 1, 3, 5, 7, 256, 2.5, '2', true]) {
    expect(() => parseParams('gatehouse.delay.set', { delay_s })).toThrow();
    expect(() => parseResult('gatehouse.delay.set', JSON.stringify({ delay_s }))).toThrow();
  }
  for (const enabled of [0, 1, 'on', 'off']) {
    expect(() => parseParams('gatehouse.shield.set', { enabled })).toThrow();
    expect(() => parseResult('gatehouse.shield.set', JSON.stringify({ enabled }))).toThrow();
  }
});

test('held outcomes and message and lease IDs have validating doors', () => {
  for (const outcome of ['pass', 'released', 'unknown', true]) {
    expect(() => parseParams('gatehouse.held.resolve', { message_id: 'simulated-held', outcome })).toThrow();
  }
  for (const message_id of ['', 'bad id', 42, 'simulated\n']) {
    expect(() => parseParams('gatehouse.held.resolve', { message_id, outcome: 'allow' })).toThrow();
  }
  for (const lease_id of ['', 42, 'not-ulid', '81ARZ3NDEKTSV4RRFFQ69G5FAX',
    '01arz3ndektsv4rrffq69g5fax', '01ARZ3NDEKTSV4RRFFQ69G5FAX\n']) {
    expect(() => parseParams('gatehouse.lease.end', { lease_id })).toThrow();
  }
});

test('gate results retain Decision constraints and the existing rate_limited error', () => {
  for (const fixture of fixtures.filter((value) => 'decision_id' in value.result)) {
    for (const [key, value] of [['decision_id', 'not-ulid'], ['at', '2026-02-30T12:00:00Z'],
      ['kind', 'unknown'], ['verdict', 'unknown']] as const) {
      expect(() => parseResult(fixture.method, JSON.stringify({ ...fixture.result, [key]: value }))).toThrow();
    }
  }
  const limited = { code: 'rate_limited', message: 'Simulated limit', retry_after_ms: 2000 };
  expect(parseError(JSON.stringify(limited))).toEqual(limited);
});
