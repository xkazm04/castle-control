import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { parseParams, parseResult } from './index.js';
import { gatehouseLiveRunGet } from './generated/gatehouse-validation.js';

const fixture: unknown = parseJson(readFileSync(new URL(
  '../../../crates/cc-types/tests/fixtures/gatehouse_live_run.json', import.meta.url,
), 'utf8'));

test('live capture has Rust/TS/lazy validation parity', () => {
  expect(gatehouseLiveRunGet.result(fixture)).toBe(true);
  const valid = parseResult('gatehouse.liveRun.get', JSON.stringify(fixture));
  expect(valid).toEqual(fixture);
  const retained = valid.items[0];
  if (retained?.coverage !== 'retained') throw new Error('Expected simulated capture fixture');
  for (const invalid of [{ items: [], unavailable_count: 0, next_cursor: null },
    { items: [{ coverage: 'retained', decision_id: 'bad' }], unavailable_count: 0 },
    { items: [], unavailable_count: 0, extra: true },
    ...['bank', 'judge', 'prompts'].map(field => ({ ...valid, items: [{ ...retained,
      capture: { ...retained.capture, inputs: { ...retained.capture.inputs, [field]: true } },
    }] })),
    { ...valid, items: [{ ...retained, capture: { ...retained.capture, replay_gap: null } }] }]) {
    expect(gatehouseLiveRunGet.result(invalid)).toBe(false);
    expect(() => parseResult('gatehouse.liveRun.get', JSON.stringify(invalid))).toThrow();
  }
  expect(parseParams('gatehouse.liveRun.get', { limit: 100, cursor: 'liveRun:2' })).toEqual({ limit: 100, cursor: 'liveRun:2' });
  for (const invalid of [{ limit: 101 }, { limit: 0 }, { limit: 1, instrument_hash: 'a'.repeat(64) }]) {
    expect(gatehouseLiveRunGet.params(invalid)).toBe(false);
  }
});
