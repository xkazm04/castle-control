import { expect, test } from 'vitest';
import { JsonParseError, parseJson } from './door.mjs';

test('shared_door_decodes_json_values_without_schema_coercion', () => {
  expect(parseJson('{"value":[true,null,42,"simulated"]}')).toEqual({ value: [true, null, 42, 'simulated'] });
  expect(parseJson('false')).toBe(false);
  expect(parseJson('null')).toBeNull();
});

test('invalid_json_has_a_typed_plain_failure_without_echoing_input', () => {
  for (const input of ['', '{', 'undefined', '{"simulated_private_text":}']) {
    expect(() => parseJson(input)).toThrow(JsonParseError);
    expect(() => parseJson(input)).toThrow('Invalid JSON input');
  }
});

test('byte_limit_counts_utf8_and_accepts_the_exact_limit', () => {
  expect(parseJson('"é"', { max_bytes: 4 })).toBe('é');
  expect(() => parseJson('"é"', { max_bytes: 3 })).toThrow('JSON input exceeds byte limit');
  expect(parseJson('0', { max_bytes: 1 })).toBe(0);
  expect(() => parseJson('0', { max_bytes: 0 })).toThrow(JsonParseError);
  expect(() => parseJson('"😀"', { max_bytes: 5 })).toThrow(JsonParseError);
});

test('invalid_byte_limit_is_rejected_instead_of_disabling_the_cap', () => {
  for (const max_bytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => parseJson('0', { max_bytes })).toThrow(RangeError);
  }
});
