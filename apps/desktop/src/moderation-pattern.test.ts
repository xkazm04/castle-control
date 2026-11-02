import { expect, test } from 'vitest';
import { previewPattern } from './moderation-pattern.js';

// Rust verdicts below were measured against regex 1.13.1 (the version in Cargo.lock) with the gate's own
// builder options (case_insensitive, 1 MiB size limit): an unmatched ] or } outside a class is a literal.
const rustAccepts: readonly (readonly [string, string, boolean])[] = [
  ['end]', 'the end] of it', true], ['end]', 'the end', false], ['a}', 'A}', true], ['a}', 'a', false],
  [']', 'x]', true], ['}', 'x}', true], ['a]b', 'a]b', true], ['end]+', 'end]]', true],
  ['x{2}}', 'xx}', true], ['x{2}}', 'x}', false], ['a{1,2}}', 'aa}', true], ['[a]]', 'a]', true],
];
// Rust rejects each of these outright (unclosed repetition, unclosed group, bad quantifier).
const rustRejects = ['a{', 'a{1', '{', '}{', 'a{x}', 'a{,3}', '(a]'];

test.each(rustAccepts)('literal stray bracket pattern %j on %j matches %s like the gate', (pattern, text, expected) => {
  expect(previewPattern(pattern, text)).toEqual({ ok: true, matches: expected });
});

test.each(rustRejects)('pattern %j that the gate cannot compile is still refused, never approximated', pattern => {
  const result = previewPattern(pattern, 'a');
  expect(result.ok).toBe(false);
});
