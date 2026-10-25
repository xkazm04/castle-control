import { expect, test } from 'vitest';
import { parseParams, parseResult, RPC_METHODS } from './index.js';

const status = { at: '2026-10-25T12:00:00Z', version: '0.1.0', uptime_ms: 42,
  twitch_connected: false, obs_connected: false, simulated: true };

test('bridge read validates all states with and without the last gap', () => {
  expect(RPC_METHODS).toContain('bridge.status.get');
  expect(parseParams('bridge.status.get', {})).toEqual({});
  for (const state of ['disconnected', 'connecting', 'connected', 'error']) {
    const value = { state };
    expect(parseResult('bridge.status.get', JSON.stringify(value))).toEqual(value);
    const gap = { ...value, last_gap: { from: status.at, to: '2026-10-25T12:01:00Z' } };
    expect(parseResult('bridge.status.get', JSON.stringify(gap))).toEqual(gap);
  }
  for (const value of [
    { state: 'unknown' }, { state: 'connected', last_gap: null },
    { state: 'connected', detail: 'simulated' },
    { state: 'connected', last_gap: { from: 'yesterday', to: status.at } },
    { state: 'connected', last_gap: { from: status.at, to: status.at, unknown: true } },
  ]) {
    expect(() => parseResult('bridge.status.get', JSON.stringify(value))).toThrow();
  }
});

test('status summaries preserve unknown, offline and known zero as separate values', () => {
  expect(parseResult('status.get', JSON.stringify(status))).toEqual(status);
  for (const stream of [{ live: false }, { live: true, started_at: status.at, viewer_count: 0 }]) {
    const value = { ...status, stream, gatehouse: { armed_rules: 0, shadow_rules: 2, shield: false } };
    expect(parseResult('status.get', JSON.stringify(value))).toEqual(value);
  }
  for (const extra of [
    { stream: null }, { gatehouse: null }, { unknown: true },
    { stream: { live: true, started_at: null } },
    { stream: { live: true, viewer_count: null } },
    { stream: { live: true, viewer_count: -1 } },
    { stream: { live: true, viewer_count: 4294967296 } },
    { stream: { live: true, started_at: 'yesterday' } },
    { stream: { live: false, unknown: true } },
    { gatehouse: { armed_rules: 0, shadow_rules: 0, shield: false, unknown: true } },
  ]) {
    expect(() => parseResult('status.get', JSON.stringify({ ...status, ...extra }))).toThrow();
  }
});
