import { expect, test } from 'vitest';
import { parseParams, parseResult } from './index.js';
import type { RpcMethod } from './validate.js';
import { beaconsEvent } from './generated/validators.mjs';

// Generated simulated data, matching the Rust Beacons fixtures. No live intake.
const curve = { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }],
  decay: { kind: 'exponential', half_life_s: 300 } };
const visual = { visual_id: 'simulated-frame', name: 'Simulated frame', design_id: 'simulated-design', curve };
const intensity = { visual_id: visual.visual_id, intensity: 0.5 };
const contribution = { source: 'cheer', broadcaster_id: '9007199254740993', user_id: '9007199254740994',
  event_id: 'simulated-event', amount: 100, dedupe_key: 'simulated-cheer-1' };
const samples: Array<{ method: RpcMethod; params: Record<string, unknown>; result: Record<string, unknown> }> = [
  { method: 'beacons.visual.list', params: {}, result: { visuals: [visual] } },
  { method: 'beacons.visual.upsert', params: { visual }, result: visual },
  { method: 'beacons.curve.set', params: { visual_id: visual.visual_id, curve }, result: visual },
  { method: 'beacons.simulate', params: { visual_id: visual.visual_id, burst: { source: 'gift', amount: 50 } },
    result: { label: 'simulated', intensity } },
  { method: 'beacons.source.url', params: { visual_id: visual.visual_id },
    result: { url: 'http://localhost:4312/visuals/simulated-frame?hash=abc' } },
];

test.each(samples)('$method round-trips its typed simulated fixture', ({ method, params, result }) => {
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

test('optional design and anonymous contributor keys are omitted, never null', () => {
  const { design_id, ...minimal } = visual;
  expect(design_id).toBe('simulated-design');
  expect(parseResult('beacons.visual.upsert', JSON.stringify(minimal))).toEqual(minimal);
  expect(() => parseParams('beacons.visual.upsert', { visual: { ...minimal, design_id: null } })).toThrow();
  const { user_id, ...anonymous } = contribution;
  expect(user_id).toBe('9007199254740994');
  expect(beaconsEvent({ kind: 'beacons.contribution', payload: anonymous })).toBe(true);
  expect(beaconsEvent({ kind: 'beacons.contribution', payload: { ...anonymous, user_id: null } })).toBe(false);
});

test('curve shapes, finite fractions, names and slugs enforce Rust boundaries', () => {
  for (const value of [NaN, Infinity, -Infinity, -0.01, 1.01, null]) {
    expect(beaconsEvent({ kind: 'beacons.intensity', payload: { ...intensity, intensity: value } })).toBe(false);
    expect(() => parseParams('beacons.curve.set', { visual_id: visual.visual_id,
      curve: { ...curve, ranges: [{ total: 0, intensity: value }] } })).toThrow();
  }
  for (const value of [0, 0.5, 1]) {
    expect(beaconsEvent({ kind: 'beacons.intensity', payload: { ...intensity, intensity: value } })).toBe(true);
  }
  for (const bad of [{ ...visual, name: '' }, { ...visual, name: ' \n\t' },
    { ...visual, visual_id: 'Bad Id' }, { ...visual, design_id: 'Bad Id' },
    { ...visual, curve: { ...curve, ranges: [] } }, { ...visual, curve: { ...curve, extra: true } },
    { ...visual, curve: { ...curve, ranges: [{ total: 1, intensity: 0.5, extra: true }] } }]) {
    expect(() => parseParams('beacons.visual.upsert', { visual: bad })).toThrow();
  }
  for (const decay of [{ kind: 'unknown' }, { kind: 'none', half_life_s: 1 },
    { kind: 'exponential', half_life_s: 0 }, { kind: 'exponential', half_life_s: 0.5 },
    { kind: 'exponential', half_life_s: 4294967296 }, { kind: 'exponential', half_life_s: null }]) {
    expect(() => parseParams('beacons.curve.set', { visual_id: visual.visual_id, curve: { ...curve, decay } })).toThrow();
  }
  expect(parseParams('beacons.curve.set', { visual_id: visual.visual_id,
    curve: { ...curve, decay: { kind: 'none' } } })).toBeDefined();
});

test('contributions carry integer amounts and string Twitch identities with shared dedupe identity', () => {
  for (const source of ['cheer', 'bits_use', 'subscribe', 'gift', 'resub', 'hype_train',
    'channel_points', 'charity', 'goal', 'power_up']) {
    expect(beaconsEvent({ kind: 'beacons.contribution', payload: { ...contribution, source } })).toBe(true);
  }
  const overlap = { ...contribution, source: 'bits_use', event_id: 'other-transport-event' };
  expect(overlap.dedupe_key).toBe(contribution.dedupe_key);
  for (const amount of [-1, 0.5, 4294967296, '50', null]) {
    expect(beaconsEvent({ kind: 'beacons.contribution', payload: { ...contribution, amount } })).toBe(false);
    expect(() => parseParams('beacons.simulate', { visual_id: visual.visual_id, burst: { source: 'gift', amount } })).toThrow();
    expect(() => parseParams('beacons.curve.set', { visual_id: visual.visual_id,
      curve: { ...curve, ranges: [{ total: amount, intensity: 0.5 }] } })).toThrow();
  }
  for (const bad of [{ ...contribution, source: 'unknown' }, { ...contribution, dedupe_key: ' \n' },
    { ...contribution, broadcaster_id: 123 }, { ...contribution, user_id: '0' },
    { ...contribution, event_id: '' }, { ...contribution, extra: true }]) {
    expect(beaconsEvent({ kind: 'beacons.contribution', payload: bad })).toBe(false);
  }
});

test('event bindings are closed and the 50-sub simulation is always labelled simulated', () => {
  for (const event of [{ kind: 'beacons.intensity', payload: intensity },
    { kind: 'beacons.contribution', payload: contribution }]) {
    expect(beaconsEvent(event)).toBe(true);
    expect(beaconsEvent({ ...event, extra: true })).toBe(false);
    expect(beaconsEvent({ ...event, payload: null })).toBe(false);
    expect(beaconsEvent({ ...event, payload: { ...event.payload, extra: true } })).toBe(false);
    for (const key of Object.keys(event.payload)) {
      expect(beaconsEvent({ ...event, payload: { ...event.payload, [key]: null } })).toBe(false);
    }
    for (const kind of ['lots.roll', 'gatehouse.verdict', 'beacons.unknown']) {
      expect(beaconsEvent({ ...event, kind })).toBe(false);
    }
  }
  expect(() => parseResult('beacons.simulate', JSON.stringify({ label: 'live', intensity }))).toThrow();
  expect(() => parseParams('beacons.simulate', { visual_id: visual.visual_id,
    burst: { source: 'gift', amount: 50, user_id: '123' } })).toThrow();
});

test('source URLs allow only canonical loopback hosts and valid ports', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    for (const port of [1, 4312, 65535]) {
      const url = `http://${host}:${port}/visuals/simulated-frame?hash=abc`;
      expect(parseResult('beacons.source.url', JSON.stringify({ url }))).toEqual({ url });
    }
  }
  for (const url of ['https://localhost:4312/', 'http://example.com:4312/', 'http://localhost.evil:4312/',
    'http://localhost@evil:4312/', 'http://localhost:0/', 'http://localhost:65536/',
    'http://localhost:01/', 'http://localhost/', 'http://127.0.0.2:4312/',
    'http://localhost:4312/#fragment', 'http://localhost:4312/\n', 'http://localhost:4312/%zz']) {
    expect(() => parseResult('beacons.source.url', JSON.stringify({ url }))).toThrow();
  }
});
