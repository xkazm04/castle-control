import { expect, test } from 'vitest';
import { parseVoteBarSnapshot, VOTE_BAR_SNAPSHOT_EVENT } from './generated/vote-bar-validation.js';
import { gatehouseSourceUrl } from './generated/gatehouse-validation.js';
import { parseMethodParams, parseMethodResult } from './index.js';

const snapshot = { directions: [{ share: 0.75 }, { share: 0.25 }], simulated: true, at: '2026-10-31T12:00:00Z' };
test('aggregate-only snapshot agrees with Rust and rejects private and unknown fields at every depth', () => {
  expect(VOTE_BAR_SNAPSHOT_EVENT).toBe('gatehouse.render.snapshot');
  expect(parseVoteBarSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(Object.keys(snapshot).sort()).toEqual(['at', 'directions', 'simulated']);
  for (const field of ['text', 'quote', 'login', 'user_id', 'label', 'unknown']) {
    expect(() => parseVoteBarSnapshot(JSON.stringify({ ...snapshot, [field]: 'simulated private data' }))).toThrow();
    expect(() => parseVoteBarSnapshot(JSON.stringify({ ...snapshot, directions: [{ share: 0.75, [field]: 'simulated' }] }))).toThrow();
  }
  for (const share of [-1, 1.1, '0.5', null]) {
    expect(() => parseVoteBarSnapshot(JSON.stringify({ ...snapshot, directions: [{ share }] }))).toThrow();
  }
});
test('source method takes no identity and returns only the isolated page URL', () => {
  expect(parseMethodParams(gatehouseSourceUrl, {})).toEqual({});
  expect(() => parseMethodParams(gatehouseSourceUrl, { user_id: '1' })).toThrow();
  const result = { url: 'http://localhost:3001/gatehouse/current' };
  expect(parseMethodResult(gatehouseSourceUrl, JSON.stringify(result))).toEqual(result);
});
