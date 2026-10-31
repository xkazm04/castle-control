import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('art CSS variables resolve and only the per-ember displacement retains a fallback', () => {
  const css = readFileSync(new URL('./keep-art.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../../tokens/src/generated.css', import.meta.url), 'utf8');
  const tokenNames = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  // Registration offsets are defined on the local ink plates; --dx comes from ember attrs.
  const localNames = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const references = [...css.matchAll(/var\(\s*(--[\w-]+)\s*([^)]*)\)/g)];
  expect(tokenNames.size).toBeGreaterThan(0);
  expect([...localNames].sort()).toEqual(['--rx', '--ry']);
  expect(references).toHaveLength([...css.matchAll(/var\(/g)].length);
  expect(references.length).toBeGreaterThan(0);
  expect(references.filter((reference) => reference[1] === '--dx')).toHaveLength(1);
  for (const reference of references) {
    const name = reference[1];
    if (name === '--dx') {
      expect(reference[0]).toBe('var(--dx, 10px)');
    } else {
      expect(tokenNames.has(name) || localNames.has(name), `${name} must be declared`).toBe(true);
      expect(reference[2], `${name} must not have a fallback`).toBe('');
    }
  }
});
