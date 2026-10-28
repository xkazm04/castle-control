import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { parseParams, parseResult } from './index.js';
import { gatehouseChatList, gatehouseHistoryList } from './generated/gatehouse-validation.js';

const methods = [gatehouseChatList, gatehouseHistoryList];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected simulated fixture record');
  return value as Record<string, unknown>;
}
const fixture = record(parseJson(readFileSync(new URL(
  '../../../crates/cc-types/tests/fixtures/gatehouse_reads.json', import.meta.url,
), 'utf8')));
const decision = record(fixture.decision);
const message = record(fixture.message);

test.each(methods)('$method agrees with Rust on bounded requests and cursor shapes', ({ method, params }) => {
  for (const valid of [{ limit: 1 }, { limit: 100, cursor: 'history:100' }]) {
    expect(parseParams(method, valid)).toEqual(valid);
    expect(params(valid)).toBe(true);
  }
  for (const invalid of [{}, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: 1, cursor: null },
    { limit: 1, cursor: 'history:01' }, { limit: 1, cursor: 'chat:10000000000000000' },
    { limit: 1, cursor: 'history:1\n' }, { limit: 1, unexpected: true }]) {
    expect(() => parseParams(method, invalid)).toThrow();
    expect(params(invalid)).toBe(false);
  }
});

test.each(methods)('$method round-trips both provenances and enforces page bounds', ({ method, result }) => {
  for (const provenance of ['live', 'simulated']) {
    const item = { decision, provenance,
      ...(method === 'gatehouse.chat.list' ? { message } : { recorded_at: '2026-10-28T12:00:01Z' }) };
    const page = { items: [item], unavailable_count: 0 };
    expect(parseResult(method, JSON.stringify(page))).toEqual(page);
    expect(result(page)).toBe(true);
    const bounded = { items: Array.from({ length: 100 }, () => item), unavailable_count: 0, next_cursor: 'history:100' };
    expect(parseResult(method, JSON.stringify(bounded))).toEqual(bounded);
    expect(result(bounded)).toBe(true);
    for (const invalid of [{ ...page, items: Array.from({ length: 101 }, () => item) },
      { ...page, next_cursor: null }, { ...page, extra: true },
      { ...page, items: [{ ...item, provenance: 'unknown' }] },
      { ...page, items: [{ ...item, decision: { ...decision, rule_id: null } }] }]) {
      expect(() => parseResult(method, JSON.stringify(invalid))).toThrow();
      expect(result(invalid)).toBe(false);
    }
  }
  const empty = { items: [], unavailable_count: 0 };
  expect(parseResult(method, JSON.stringify(empty))).toEqual(empty);
});
