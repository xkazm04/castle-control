import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { parseParams, parseResult, parseWrit } from './index.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture object');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture array');
  return value;
}
// Shared with cc-types: synthetic shapes and signature bytes, never real chat/assets.
const fixtures = record(parseJson(readFileSync(new URL(
  '../../../crates/cc-types/tests/fixtures/display_images.json', import.meta.url), 'utf8')));
const methods = ['lots.draw.upsert', 'beacons.visual.upsert', 'gatehouse.rules.upsert', 'maproom.design.upsert'] as const;
const payloads = array(fixtures.payloads).map(record).map(payload => {
  const method = methods.find(method => method === payload.method);
  if (!method) throw new Error('Unexpected fixture method');
  return { method, params: record(payload.params) };
});
const valid = array(fixtures.valid_displays);
const invalid = array(fixtures.invalid_displays);

test.each(payloads)('$method accepts old payloads and every existing display vocabulary value', ({ method, params }) => {
  expect(parseParams(method, params)).toEqual(params);
  for (const display of valid) {
    const value = { ...params, display };
    expect(parseParams(method, value)).toEqual(value);
  }
});

test.each(payloads)('$method refuses each bound, unknown field and present null like Rust', ({ method, params }) => {
  for (const display of invalid) expect(() => parseParams(method, { ...params, display })).toThrow();
  expect(() => parseParams(method, { ...params, extra: true })).toThrow();
});

test('Steward wrappers retain the same display validation for draws, visuals and rules', () => {
  const input = array(parseJson(readFileSync(new URL(
    '../../../crates/cc-types/tests/fixtures/steward.json', import.meta.url), 'utf8')));
  const sample = record(input[0]);
  for (const { method, params } of payloads.slice(0, 3)) {
    const chamber = method.startsWith('lots.') ? 'lots' : method.startsWith('beacons.') ? 'beacons' : 'gatehouse';
    const wrapped = (display: unknown) => {
      const after = { ...params, display };
      return { ...sample, chamber, proposal: { method, diff: { before: after, after } } };
    };
    for (const display of valid) {
      const value = wrapped(display);
      expect(parseWrit(JSON.stringify(value))).toEqual(value);
    }
    for (const display of invalid) expect(() => parseWrit(JSON.stringify(wrapped(display)))).toThrow();
  }
});

test('upload sniffs PNG/JPEG/WebP bytes and refuses remote URLs, wrong types and formats', () => {
  for (const content of array(fixtures.valid_images)) {
    expect(parseParams('lots.image.upload', { content })).toEqual({ content });
  }
  for (const content of array(fixtures.invalid_images)) {
    expect(() => parseParams('lots.image.upload', { content })).toThrow();
  }
  expect(() => parseParams('lots.image.upload', {})).toThrow();
  expect(() => parseParams('lots.image.upload', { content: 'ffd8ff', mime_type: 'image/png' })).toThrow();
  for (const image of ['a'.repeat(64), null, '../image.png', 'https://example.invalid/image.png',
    7, 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(64)}\n`]) {
    const params = payloads[0]?.params;
    if (!params) throw new Error('Missing draw fixture');
    const value = { ...params, draw: { ...record(params.draw), image } };
    if (image === 'a'.repeat(64)) {
      expect(parseParams('lots.draw.upsert', value)).toEqual(value);
      expect(parseResult('lots.image.upload', JSON.stringify({ image }))).toEqual({ image });
    } else {
      expect(() => parseParams('lots.draw.upsert', value)).toThrow();
      expect(() => parseResult('lots.image.upload', JSON.stringify({ image }))).toThrow();
    }
  }
});

test('the exact decoded 2 MiB boundary passes and one more byte fails', () => {
  const content = 'ffd8ff' + '00'.repeat(2 * 1024 * 1024 - 3);
  expect(parseParams('lots.image.upload', { content })).toEqual({ content });
  expect(() => parseParams('lots.image.upload', { content: content + '00' })).toThrow();
});
