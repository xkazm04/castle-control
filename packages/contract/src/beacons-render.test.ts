import { expect, test } from 'vitest';
import { BEACONS_RENDER_SNAPSHOT_EVENT, parseBeaconsRenderSnapshot,
  validateBeaconsRenderSnapshot } from './generated/beacons-render-validation.js';
import { EVENT_KINDS, RPC_METHODS } from './index.js';

// Fabricated, simulated package. No assets are loaded and no hash is verified.
const visual = { visual_id: 'simulated-frame', name: 'Simulated frame',
  curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } };
const intensity = { visual_id: visual.visual_id, intensity: 0.5 };
const design = { design_id: 'simulated-design', content_hash: 'a'.repeat(64),
  layers: [{ kind: 'shape', shape: 'rectangle', bindings: [],
    properties: { x: 0, y: 0, width: 1920, height: 1080, scale: 1, opacity: 1 } }] };
const neutral = { visual, intensity, simulated: true };
const sample = { visual: { ...visual, design_id: design.design_id }, package: design, intensity, simulated: true };

test.each([sample, neutral])('accepted snapshot round-trips including omitted package', (value) => {
  const parsed = parseBeaconsRenderSnapshot(JSON.stringify(value));
  expect(parsed).toEqual(value);
  expect(parseBeaconsRenderSnapshot(JSON.stringify(parsed))).toEqual(value);
  expect(validateBeaconsRenderSnapshot(value)).toBe(true);
  expect(Object.hasOwn(parsed, 'package')).toBe(Object.hasOwn(value, 'package'));
});

test.each([sample, neutral])('requires boolean simulated provenance', (value) => {
  const missing: Record<string, unknown> = { ...value };
  delete missing['simulated'];
  for (const bad of [missing, ...[null, 'true', 1, {}, []].map(simulated => ({ ...value, simulated }))]) {
    expect(validateBeaconsRenderSnapshot(bad)).toBe(false);
    expect(() => parseBeaconsRenderSnapshot(JSON.stringify(bad))).toThrow();
  }
});

test.each([sample, neutral])('round-trips true and false simulated provenance', (value) => {
  for (const simulated of [true, false]) {
    const snapshot = { ...value, simulated };
    expect(validateBeaconsRenderSnapshot(snapshot)).toBe(true);
    const parsed = parseBeaconsRenderSnapshot(JSON.stringify(snapshot));
    expect(parsed).toEqual(snapshot);
    expect(parseBeaconsRenderSnapshot(JSON.stringify(parsed))).toEqual(snapshot);
  }
});

test('render snapshot is an overlay SSE identifier, not control invalidation or RPC', () => {
  expect(BEACONS_RENDER_SNAPSHOT_EVENT).toBe('beacons.render.snapshot');
  expect([...EVENT_KINDS, ...RPC_METHODS]).not.toContain(BEACONS_RENDER_SNAPSHOT_EVENT);
});

test.each([
  { ...sample, intensity: { ...intensity, visual_id: 'simulated-other-frame' } },
  { ...neutral, intensity: { ...intensity, visual_id: 'simulated-other-frame' } },
  { visual: sample.visual, intensity, simulated: true },
  { visual, package: design, intensity, simulated: true },
  { ...sample, package: { ...design, design_id: 'simulated-other-design' } },
])('rejects inconsistent visual/package/intensity relationships', (value) => {
  expect(validateBeaconsRenderSnapshot(value)).toBe(false);
  expect(() => parseBeaconsRenderSnapshot(JSON.stringify(value))).toThrow();
});

test.each([sample, neutral])('rejects unknown fields and present-null package', (value) => {
  for (const bad of [{ ...value, extra: true }, { ...value, package: null }]) {
    expect(validateBeaconsRenderSnapshot(bad)).toBe(false);
    expect(() => parseBeaconsRenderSnapshot(JSON.stringify(bad))).toThrow();
  }
});

test('nested boundaries and malformed JSON stay closed', () => {
  for (const value of [
    { ...sample, visual: { ...sample.visual, extra: true } },
    { ...sample, package: { ...design, extra: true } },
    { ...sample, intensity: { ...intensity, extra: true } },
    { ...sample, intensity: { ...intensity, intensity: 1.01 } },
    { ...sample, package: { ...design, content_hash: 'unverified-syntax' } },
    { ...neutral, visual: { ...visual, design_id: null } },
    null, [], {},
  ]) {
    expect(validateBeaconsRenderSnapshot(value)).toBe(false);
    expect(() => parseBeaconsRenderSnapshot(JSON.stringify(value))).toThrow();
  }
  expect(() => parseBeaconsRenderSnapshot('{')).toThrow();
});
