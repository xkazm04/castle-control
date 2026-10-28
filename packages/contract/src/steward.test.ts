import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { parseStewardAskParams, parseStewardAskResult, parseWrit, parseWritSealParams,
  parseWritSealResult, parseWritTearParams, parseWritTearResult, parseStewardEvent, parseParams,
  parseResult } from './index.js';

// The exact same synthetic JSON bytes are round-tripped by Rust.
const input: unknown = parseJson(readFileSync(new URL('../../../crates/cc-types/tests/fixtures/steward.json', import.meta.url), 'utf8'));
if (!Array.isArray(input)) throw new Error('Expected simulated writ fixtures');
const writs = input.map((value: unknown) => parseWrit(JSON.stringify(value)));
const sample = writs[0];
if (!sample) throw new Error('Empty simulated fixtures');

test('shared writ fixtures round-trip every supported proposal and status', () => {
  expect(writs).toEqual(input);
  expect(new Set(writs.map((writ) => writ.proposal.method)).size).toBe(5);
  expect(new Set(writs.map((writ) => writ.status)).size).toBe(4);
  for (const writ of writs) {
    const text = JSON.stringify(writ);
    expect(parseWrit(text)).toEqual(writ);
    for (const parse of [parseStewardAskResult, parseWritSealResult, parseWritTearResult]) {
      expect(parse(JSON.stringify({ writ }))).toEqual({ writ });
      expect(() => parse(JSON.stringify({ writ, extra: true }))).toThrow();
      expect(() => parse('{"writ":null}')).toThrow();
    }
    const event = { kind: 'steward.writ', payload: writ };
    expect(parseStewardEvent(JSON.stringify(event))).toEqual(event);
    expect(() => parseStewardEvent(JSON.stringify({ ...event, extra: true }))).toThrow();
  }
});

test('ask and decision parameters use the same strict JSON door', () => {
  const params = { chamber: 'lots', prompt: 'Simulated: three questions' };
  expect(parseStewardAskParams(JSON.stringify(params))).toEqual(params);
  expect(parseStewardAskParams(JSON.stringify({ ...params, writ_id: sample.writ_id })))
    .toEqual({ ...params, writ_id: sample.writ_id });
  for (const bad of [{ ...params, writ_id: null }, { ...params, extra: true },
    { ...params, chamber: 'maproom' }, { ...params, prompt: ' \n' }]) {
    expect(() => parseStewardAskParams(JSON.stringify(bad))).toThrow();
  }
  for (const parse of [parseWritSealParams, parseWritTearParams]) {
    expect(parse(JSON.stringify({ writ_id: sample.writ_id }))).toEqual({ writ_id: sample.writ_id });
    for (const bad of [{}, { writ_id: null }, { writ_id: 'not-ulid' },
      { writ_id: sample.writ_id, extra: true }]) expect(() => parse(JSON.stringify(bad))).toThrow();
  }
});

test('rejects unknown chambers, methods, statuses, fields, nulls and mismatched chambers', () => {
  const invalid = [
    { ...sample, chamber: 'unknown' }, { ...sample, chamber: 'maproom' },
    { ...sample, chamber: 'beacons' }, { ...sample, status: 'applied' },
    { ...sample, writ_id: 'not-ulid' }, { ...sample, created_at: '2026-02-30T00:00:00Z' },
    { ...sample, updated_at: '2026-10-26T00:00:00+01:00' }, { ...sample, error: null },
    { ...sample, extra: true }, { ...sample, proposal: { ...sample.proposal, extra: true } },
    { ...sample, proposal: { method: 'maproom.design.upsert', diff: sample.proposal.diff } },
    { ...sample, proposal: { ...sample.proposal, diff: { ...sample.proposal.diff, extra: true } } },
    { ...sample, proposal: { ...sample.proposal, diff: { ...sample.proposal.diff, before: null } } },
  ];
  for (const value of invalid) expect(() => parseWrit(JSON.stringify(value))).toThrow();
  for (const writ of writs) {
    for (const field of Object.keys(writ)) {
      expect(() => parseWrit(JSON.stringify({ ...writ, [field]: null }))).toThrow();
    }
    const diff = writ.proposal.diff;
    for (const after of [{ ...diff.after, extra: true }, null]) {
      expect(() => parseWrit(JSON.stringify({ ...writ,
        proposal: { ...writ.proposal, diff: { ...diff, after } } }))).toThrow();
    }
  }
  expect(() => parseWrit('null')).toThrow();
  expect(() => parseWrit('{')).toThrow();
  expect(() => parseStewardEvent(JSON.stringify({ kind: 'unknown', payload: sample }))).toThrow();
});

test('reused config constraints are enforced inside the typed diff', () => {
  const value = { ...sample, chamber: 'gatehouse', proposal: {
    method: 'gatehouse.rules.setMode', diff: { after: { rule_id: 'simulated-links', mode: 'armed' } },
  } };
  // Proposed arming still needs the existing typed acknowledgement.
  expect(() => parseWrit(JSON.stringify(value))).toThrow();
  expect(() => parseWrit(JSON.stringify({ ...sample,
    proposal: { ...sample.proposal, diff: { after: { draw: null } } } }))).toThrow();
  for (const method of ['steward.ask', 'steward.writ.seal', 'steward.writ.tear'] as const) {
    expect(() => parseParams(method, {})).toThrow();
  }
});

test('bound Steward methods use the existing typed parameters and results without storage metadata', () => {
  for (const writ of writs) {
    const cases = [
      { method: 'steward.ask', params: { chamber: writ.chamber, prompt: 'Simulated request' } },
      { method: 'steward.writ.seal', params: { writ_id: writ.writ_id } },
      { method: 'steward.writ.tear', params: { writ_id: writ.writ_id } },
    ] as const;
    for (const { method, params } of cases) {
      expect(parseParams(method, params)).toEqual(params);
      const result = parseResult(method, JSON.stringify({ writ }));
      expect(result).toEqual({ writ });
      for (const value of [params, result]) {
        expect(JSON.stringify(value)).not.toMatch(/"(?:simulated|SIMULATED)":/);
      }
      expect(() => parseResult(method, '{}')).toThrow();
      for (const key of ['simulated', 'SIMULATED']) {
        expect(() => parseParams(method, { ...params, [key]: true })).toThrow();
        expect(() => parseResult(method, JSON.stringify({ writ, [key]: true }))).toThrow();
        expect(() => parseResult(method, JSON.stringify({ writ: { ...writ, [key]: true } }))).toThrow();
      }
    }
  }
});
