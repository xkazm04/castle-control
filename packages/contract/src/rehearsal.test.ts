import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { EVENT_KINDS, RPC_METHODS, parseEvent, parseParams, parseResult, parseRehearsalEvent,
  parseMethodParams, parseMethodResult, obsConnect, obsSceneEnsure, obsRehearsalClear,
  lotsSourceUrl, rehearsalStart, rehearsalStop, rehearsalScenarioRun, rehearsalCrowdSet,
  tiltyardSourceUrl } from './index.js';
import { lotsSourceUrl as lazyLotsSourceUrl } from './generated/lots-validation.js';
import { parseTiltyardRenderSnapshot, TILTYARD_RENDER_SNAPSHOT_EVENT } from './generated/tiltyard-render-validation.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture object');
  return value as Record<string, unknown>;
}
// Generated and labelled simulated; Rust reads these exact same bytes.
const fixture = record(parseJson(readFileSync(new URL(
  '../../../crates/cc-types/tests/fixtures/rehearsal.json', import.meta.url), 'utf8')));
const contracts = [obsConnect, obsSceneEnsure, obsRehearsalClear, lotsSourceUrl,
  rehearsalStart, rehearsalStop, rehearsalScenarioRun, rehearsalCrowdSet, tiltyardSourceUrl] as const;
if (!Array.isArray(fixture.methods)) throw new Error('Expected simulated method array');
const methods = fixture.methods.map((value: unknown) => {
  const entry = record(value), contract = contracts.find(contract => contract.method === entry.method);
  if (!contract) throw new Error('Unexpected fixture method');
  return { contract, params: record(entry.params), result: record(entry.result) };
});
const statusEvent = record(fixture.status_event), status = record(statusEvent.payload);
const snapshot = record(fixture.snapshot);

test('all nine WP R.1 declarations round-trip matching Rust params and results', () => {
  expect(fixture.simulated).toBe(true);
  expect(methods).toHaveLength(9);
  for (const { contract, params, result } of methods) {
    expect(RPC_METHODS).toContain(contract.method);
    expect(parseParams(contract.method, params)).toEqual(params);
    expect(parseResult(contract.method, JSON.stringify(result))).toEqual(result);
    expect(parseMethodParams(contract, params)).toEqual(params);
    expect(parseMethodResult(contract, JSON.stringify(result))).toEqual(result);
    for (const bad of [null, [], { ...params, extra: true }]) {
      expect(() => parseParams(contract.method, bad)).toThrow();
      expect(() => parseMethodParams(contract, bad)).toThrow();
    }
    for (const bad of [null, [], { ...result, extra: true }]) {
      expect(() => parseResult(contract.method, JSON.stringify(bad))).toThrow();
      expect(() => parseMethodResult(contract, JSON.stringify(bad))).toThrow();
    }
  }
  const result = { url: 'http://localhost:4312/lots/simulated-draw' };
  expect(parseMethodParams(lazyLotsSourceUrl, { draw_id: 'simulated-draw' })).toEqual({ draw_id: 'simulated-draw' });
  expect(parseMethodResult(lazyLotsSourceUrl, JSON.stringify(result))).toEqual(result);
});

test('required fields reject missing keys and null; optional keys stay omitted', () => {
  for (const { contract, params, result } of methods) {
    for (const key of Object.keys(params)) {
      expect(() => parseParams(contract.method, { ...params, [key]: null })).toThrow();
      if (key === 'visual_id') continue;
      const missing = { ...params };
      delete missing[key];
      expect(() => parseParams(contract.method, missing)).toThrow();
    }
    for (const key of Object.keys(result)) {
      expect(() => parseResult(contract.method, JSON.stringify({ ...result, [key]: null }))).toThrow();
      if (key === 'scene_name') continue;
      const missing = { ...result };
      delete missing[key];
      expect(() => parseResult(contract.method, JSON.stringify(missing))).toThrow();
    }
  }
  expect(parseParams('rehearsal.scenario.run', { scenario: 'beacon_fire' })).not.toHaveProperty('visual_id');
  expect(parseResult('rehearsal.start', JSON.stringify(status))).not.toHaveProperty('scene_name');
  expect(parseResult('rehearsal.start', JSON.stringify(status))).not.toHaveProperty('simulated');
});

test('OBS connection keeps uint16 port bounds and errors do not echo the password', () => {
  const params = { host: 'localhost', port: 4455, password: 'simulated', remember: false };
  for (const port of [0, 65535]) expect(parseParams('obs.connect', { ...params, port }).port).toBe(port);
  for (const port of [-1, 65536, 1.5, '4455']) {
    expect(() => parseParams('obs.connect', { ...params, port })).toThrow('Invalid contract value');
  }
  expect(() => parseParams('obs.connect', { ...params, remember: 'yes' })).toThrow('Invalid contract value');
});

test('scene names count Unicode characters and enforce one through 256', () => {
  for (const scene_name of ['S', 'Simulated scene', '🦇'.repeat(256)]) {
    expect(parseParams('obs.scene.ensure', { scene_name })).toEqual({ scene_name });
  }
  for (const scene_name of ['', '🦇'.repeat(257), null, 1]) {
    expect(() => parseParams('obs.scene.ensure', { scene_name })).toThrow();
  }
});

test('crowd rate accepts endpoints and rejects 601 and noninteger values', () => {
  for (const per_minute of [0, 1, 600]) {
    expect(parseParams('rehearsal.crowd.set', { per_minute })).toEqual({ per_minute });
  }
  for (const per_minute of [601, -1, 65536, 1.5, '60', null]) {
    expect(() => parseParams('rehearsal.crowd.set', { per_minute })).toThrow();
  }
});

test('scenario vocabulary is closed and optional visual IDs use the Beacons slug door', () => {
  for (const scenario of ['lots_fill', 'vote_round', 'beacon_fire', 'duel_round']) {
    const params = { scenario };
    expect(parseParams('rehearsal.scenario.run', params)).toEqual(params);
  }
  for (const params of [{ scenario: 'unknown' }, { scenario: 'BeaconFire' },
    { scenario: 'beacon_fire', visual_id: null }, { scenario: 'beacon_fire', visual_id: 'not a slug' }]) {
    expect(() => parseParams('rehearsal.scenario.run', params)).toThrow();
  }
  for (const draw_id of [null, '', 'not a slug', 1]) {
    expect(() => parseParams('lots.source.url', { draw_id })).toThrow();
  }
  for (const method of ['lots.source.url', 'tiltyard.source.url'] as const) {
    for (const url of ['https://example.com/', 'http://localhost:0/', 'http://localhost:4312/#fragment']) {
      expect(() => parseResult(method, JSON.stringify({ url }))).toThrow();
    }
  }
});

test('status event binds the typed payload while control envelopes stay invalidation only', () => {
  expect(EVENT_KINDS).toContain('rehearsal.status');
  expect(parseRehearsalEvent(JSON.stringify(statusEvent))).toEqual(statusEvent);
  const control = { seq: 1, at: status.at, kind: 'rehearsal.status' };
  expect(parseEvent(JSON.stringify(control))).toEqual(control);
  expect(() => parseEvent(JSON.stringify({ ...control, payload: status }))).toThrow();
  for (const invalid of [{ ...statusEvent, extra: true }, { ...statusEvent, kind: 'unknown' },
    { ...statusEvent, payload: { ...status, extra: true } }, { ...statusEvent, payload: null }]) {
    expect(() => parseRehearsalEvent(JSON.stringify(invalid))).toThrow();
  }
  for (const invalid of [{ ...status, scene_name: null }, { ...status, simulated: true },
    { ...status, obs: { connected: false, extra: true } }, { ...status, crowd_per_minute: 65536 },
    { ...status, at: '2026-02-30T12:00:00Z' }]) {
    expect(() => parseResult('rehearsal.start', JSON.stringify(invalid))).toThrow();
    expect(() => parseRehearsalEvent(JSON.stringify({ kind: 'rehearsal.status', payload: invalid }))).toThrow();
  }
});

test('tiltyard overlay full replacements round-trip without an absent verdict', () => {
  expect(TILTYARD_RENDER_SNAPSHOT_EVENT).toBe('tiltyard.render.snapshot');
  expect(EVENT_KINDS).not.toContain(TILTYARD_RENDER_SNAPSHOT_EVENT);
  expect(parseTiltyardRenderSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(parseTiltyardRenderSnapshot(JSON.stringify(snapshot))).not.toHaveProperty('verdict');
  for (const verdict of ['left', 'right', 'tie']) {
    const value = { ...snapshot, verdict };
    expect(parseTiltyardRenderSnapshot(JSON.stringify(value))).toEqual(value);
  }
  for (const invalid of [{ ...snapshot, extra: true }, { ...snapshot, verdict: null },
    { ...snapshot, verdict: 'unknown' }, { ...snapshot, ballots: -1 }, { ...snapshot, ballots: 4294967296 },
    { ...snapshot, simulated: null }, { ...snapshot, simulated: 'true' },
    { ...snapshot, at: '2026-02-30T12:00:00Z' }]) {
    expect(() => parseTiltyardRenderSnapshot(JSON.stringify(invalid))).toThrow();
  }
  for (const side of ['left', 'right']) {
    for (const invalid of [{ ...record(snapshot[side]), extra: true },
      { ...record(snapshot[side]), count: -1 }, { ...record(snapshot[side]), label: null }]) {
      expect(() => parseTiltyardRenderSnapshot(JSON.stringify({ ...snapshot, [side]: invalid }))).toThrow();
    }
  }
  for (const key of ['left', 'right', 'ballots', 'simulated', 'at']) {
    const invalid = { ...snapshot };
    delete invalid[key];
    expect(() => parseTiltyardRenderSnapshot(JSON.stringify(invalid))).toThrow();
  }
  expect(() => parseTiltyardRenderSnapshot('{')).toThrow();
});
