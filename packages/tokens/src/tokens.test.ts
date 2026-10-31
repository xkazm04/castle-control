import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { renderMirror, renderStylesheet } from './render.js';
import { layoutTokens, stockLayoutTokens, themeTokens } from './source.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('pre-Cutaway layout groups remain byte-equal, including WP1 follow-up type roles', () => {
  const digest = (values: Readonly<Record<string, string>>) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
  expect(digest(layoutTokens)).toBe('538295eafc5b0f8b370ac2924a966c0c130b7f7554f06d59fb2e07c7e3571336');
  expect(digest(stockLayoutTokens)).toBe('af3f52fff32e28155b4a73e626c454d8e5a810f11009bdd32bf0d635edb65b73');
});

test('every prototype token value is byte-equal, in both themes', () => {
  const prototype = read('../../../prototype/tokens.css');
  const groups = [...prototype.matchAll(/(:root|\[data-theme="stock"\])\s*\{([^}]+)\}/g)];
  expect(groups).toHaveLength(2);
  for (const [index, name] of (['paper', 'stock'] as const).entries()) {
    const body = groups[index]?.[2];
    if (!body) throw new Error('Missing prototype theme');
    const declarations = [...body.matchAll(/--([\w-]+):([^;]+);/g)];
    expect(declarations.length).toBe(Object.keys(themeTokens[name]).length);
    for (const [, key, value] of declarations) {
      if (!key || !value) throw new Error('Incomplete token declaration');
      expect(Buffer.from((themeTokens[name] as Readonly<Record<string, string>>)[key] ?? '')).toEqual(Buffer.from(value));
      expect(renderStylesheet()).toContain(`--${key}:${value};`);
    }
  }
});

test('generated CSS and typed mirror have no drift', () => {
  expect(read('./generated.css')).toBe(renderStylesheet());
  expect(read('./generated.ts')).toBe(renderMirror());
});
