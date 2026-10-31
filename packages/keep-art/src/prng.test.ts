import { expect, test } from 'vitest';
import { fnv1a, hex8 } from './prng.ts';

// Constants captured once in Node by executing .port/winner/keep-art.js in a VM.
test.each([
  ['', 2166136261, '811c9dc5'],
  ['lanterns', 2123410388, '7e90abd4'],
  ['hello', 1335831723, '4f9f2cab'],
] as const)('winner hash and hexadecimal golden value for %j', (text, hash, hex) => {
  expect(fnv1a(text)).toBe(hash);
  expect(hex8(hash)).toBe(hex);
});

test('winner hashes UTF-16 code units without normalizing or UTF-8 encoding', () => {
  // Also captured by executing the winner in Node, with escaped input code units.
  expect(fnv1a('\ud83c\udff0')).toBe(19795025);
  expect(fnv1a('caf\u00e9')).toBe(856211068);
});

test.each([
  [0, '00000000'], [1, '00000001'], [255, '000000ff'],
  [4294967295, 'ffffffff'], [4294967296, '00000000'], [-1, '000000-1'],
] as const)('hex8 preserves winner padding and slicing for %s', (value, expected) => {
  expect(hex8(value)).toBe(expected);
});
