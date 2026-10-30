import { expect, test } from 'vitest';
import { checkTokenDefinitions } from './check-build.js';
import { renderStylesheet } from './render.js';

test('accepts every generated token in formatted and minified CSS', () => {
  const css = renderStylesheet();
  const names = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  expect(checkTokenDefinitions(css, 'test')).toBe(names.size);
  expect(checkTokenDefinitions(css.replace(/\s*([{};:])\s*/g, '$1'), 'test')).toBe(names.size);
});

test('rejects empty CSS, variable references and unrelated declarations', () => {
  expect(() => checkTokenDefinitions('', 'test')).toThrow('missing generated token definitions');
  const references = [...renderStylesheet().matchAll(/(--[\w-]+)\s*:/g)]
    .map(match => `color:var(${match[1]});`).join('');
  expect(() => checkTokenDefinitions(`:root{--unrelated:1;${references}}`, 'test')).toThrow('missing generated token definitions');
});

test('rejects one missing token even when the others are duplicated', () => {
  const css = renderStylesheet();
  const name = /(--[\w-]+)\s*:/.exec(css)?.[1];
  if (!name) throw new Error('Generated tokens missing');
  const partial = css.replaceAll(`${name}:`, '--unrelated:');
  expect(() => checkTokenDefinitions(partial + partial, 'test')).toThrow(name);
});
