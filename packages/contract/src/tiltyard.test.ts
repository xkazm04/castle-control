/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { maproomStageGet, maproomTurnRun, parseEvent, parseParams, parseResult,
  parseMethodParams, parseMethodResult, RPC_METHODS } from './index.js';
import { parseTiltyardRenderSnapshot, TILTYARD_CURRENT_ROUTE, TILTYARD_PUSH_ROUTE } from './generated/tiltyard-render-validation.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture record');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture array');
  return value;
}
const fixture = record(parseJson(readFileSync(new URL('../../../crates/cc-types/tests/fixtures/tiltyard.json', import.meta.url), 'utf8')));
const actions = array(fixture.actions), stages = array(fixture.stages), snapshots = array(fixture.snapshots);

function parse(door: unknown, value: unknown): unknown {
  if (door === 'params') return parseParams('maproom.turn.run', value);
  if (door === 'result') return parseResult('maproom.stage.get', JSON.stringify(value));
  if (door === 'snapshot') return parseTiltyardRenderSnapshot(JSON.stringify(value));
  throw new Error('Unexpected simulated fixture door');
}

test('all simulated actions, session states and overlay phases round-trip with Rust fixtures', () => {
  expect(fixture.simulated).toBe(true);
  expect(actions).toHaveLength(9);
  expect(RPC_METHODS).toHaveLength(62);
  expect(parseMethodParams(maproomStageGet, {})).toEqual({});
  for (const action of actions) {
    const params = { action };
    expect(parseParams('maproom.turn.run', params)).toEqual(params);
    expect(parseMethodParams(maproomTurnRun, params)).toEqual(params);
  }
  for (const value of stages) {
    for (const contract of [maproomStageGet, maproomTurnRun]) {
      expect(parseResult(contract.method, JSON.stringify(value))).toEqual(value);
      expect(parseMethodResult(contract, JSON.stringify(value))).toEqual(value);
    }
  }
  for (const value of snapshots) expect(parseTiltyardRenderSnapshot(JSON.stringify(value))).toEqual(value);
  expect(parseEvent(JSON.stringify(fixture.control_event))).toEqual(fixture.control_event);
  expect(TILTYARD_CURRENT_ROUTE).toBe('/tiltyard/current');
  expect(TILTYARD_PUSH_ROUTE).toBe('/push/tiltyard');
});

test('shared invalid corpus rejects unknown fields, nulls, wrong types and bounds', () => {
  const cases = array(fixture.invalid);
  expect(cases.length).toBeGreaterThan(80);
  for (const raw of cases) {
    const item = record(raw);
    expect(() => parse(item.door, item.value), JSON.stringify(item)).toThrow();
  }
  expect(() => parseParams('maproom.stage.get', { extra: true })).toThrow();
  expect(() => parseEvent(JSON.stringify({ ...record(fixture.control_event), payload: stages[1] }))).toThrow();
});

test('labels count Unicode code points; seeds remain strings; endpoints and absent keys survive', () => {
  const start = record(actions[0]), list = record(start.list), items = array(list.items);
  for (const title of ['x', '\u0085', '🦇'.repeat(256), '<script>SIMULATED</script>']) {
    const params = { action: { ...start, list: { ...list, items: [{ ...record(items[0]), title }, items[1]] } } };
    expect(parse('params', params)).toEqual(params);
  }
  for (const seed of ['0', '9007199254740993', '9'.repeat(128)]) {
    const params = { action: { ...start, list: { ...list, items: [{ ...record(items[0]), seed }, items[1]] } } };
    expect(parse('params', params)).toEqual(params);
  }
  for (const window_ms of [1, 4294967295]) {
    const params = { action: { ...start, window_ms } };
    expect(parse('params', params)).toEqual(params);
  }
  expect(parse('result', stages[0])).not.toHaveProperty('session');
  expect(parse('snapshot', snapshots[0])).not.toHaveProperty('verdict');
  expect(parse('snapshot', snapshots[0])).not.toHaveProperty('champion');
});

test('every nested record rejects unknown keys and explicit null', () => {
  type Path = Array<string | number>;
  function paths(value: unknown, path: Path = []): Path[] {
    if (Array.isArray(value)) return value.flatMap((child: unknown, index) => paths(child, [...path, index]));
    if (!value || typeof value !== 'object') return [];
    return [path, ...Object.entries(value).flatMap(([key, child]) => paths(child, [...path, key]))];
  }
  function at(value: unknown, path: Path): Record<string, unknown> {
    return record(path.reduce<unknown>((v, key) => Array.isArray(v) && typeof key === 'number' ? v[key] : record(v)[key], value));
  }
  for (const [door, value] of [['params', { action: actions[0] }], ['result', stages[5]], ['snapshot', snapshots[6]]]) {
    for (const path of paths(value)) {
      const unknown: unknown = structuredClone(value);
      at(unknown, path).extra = true;
      expect(() => parse(door, unknown)).toThrow();
      for (const key of Object.keys(at(value, path))) {
        const null_value: unknown = structuredClone(value);
        at(null_value, path)[key] = null;
        expect(() => parse(door, null_value)).toThrow();
      }
    }
  }
});
