import { readFileSync, readdirSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

export interface StyleFile { readonly path: string; readonly text: string }
const literal = /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|-?\b\d+(?:\.\d+)?px\b/i;
const comments = /\/\*[\s\S]*?\*\//g;

/** The existing UI token rule extended to the complete duel CSS subtree. */
export function checkDuelStyles(files: readonly StyleFile[]): string[] {
  const defects: string[] = [];
  if (files.length === 0) return ['duel CSS: refused empty inventory'];
  const clean = files.map(file => ({ path: file.path.replaceAll('\\', '/'), text: file.text.replaceAll(comments, '') }));
  const joined = clean.map(file => file.text).join('\n');
  const declarations = new Set([...joined.matchAll(/--(ty-[\w-]+)\s*:/g)].map(match => match[1]!));
  const known = new Set([...Object.keys(tokens.theme.paper), ...Object.keys(tokens.layout), ...Object.keys(tokens.type), ...declarations]);
  const uses = new Set([...joined.matchAll(/var\(\s*--([\w-]+)/g)].map(match => match[1]!));
  for (const file of clean) {
    if (file.path.split('/').at(-1) === 'tokens.css') {
      // Remove only local declarations; literals in ordinary declarations or selectors remain defects.
      const remaining = file.text.replace(/--ty-[\w-]+\s*:[^;{}]+;?/g, '');
      if (literal.test(remaining)) defects.push(`${file.path}: literal outside a --ty-* declaration`);
    } else {
      // Container breakpoints cannot use a custom property. No viewport exception is granted.
      const checked = file.text.replace(/@container ty-stage \(max-width:\s*(?:980|620)px\)/g, '@container ty-stage (breakpoint)');
      if (literal.test(checked)) defects.push(`${file.path}: raw colour or px literal`);
    }
    for (const name of new Set([...file.text.matchAll(/var\(\s*--([\w-]+)/g)].map(match => match[1]!))) {
      if (!known.has(name)) defects.push(`${file.path}: unknown variable --${name}`);
    }
  }
  for (const name of declarations) if (!uses.has(name)) defects.push(`unused variable --${name}`);
  return defects;
}

function styleFiles(directory: URL): StyleFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) return styleFiles(new URL(`${entry.name}/`, directory));
    return entry.isFile() && entry.name.endsWith('.css') ? [{ path: path.pathname, text: readFileSync(path, 'utf8') }] : [];
  });
}
test('duel styles walk every CSS file and use only declared shared/local tokens', () => {
  const files = styleFiles(new URL('.', import.meta.url));
  console.log(`[duel CSS] walked ${files.length} files`);
  expect(files.length).toBeGreaterThanOrEqual(8);
  expect(checkDuelStyles(files)).toEqual([]);
});
test('duel styles prove red for a raw colour, an unknown variable and an unused local', () => {
  const defects = checkDuelStyles([
    { path: 'bad.css', text: '.ty-card{color:#fff;background:var(--missing)}' },
    { path: 'tokens.css', text: '.ty-stage{--ty-x:2px;}' },
  ]);
  expect(defects).toHaveLength(3);
  expect(defects).toEqual(expect.arrayContaining([
    expect.stringContaining('raw colour'), expect.stringContaining('unknown variable --missing'), expect.stringContaining('unused variable --ty-x'),
  ]));
  console.log('[duel CSS red proof] raw colour, unknown variable, unused local: 3 defects');
});
test('duel styles refuse an empty inventory and literals on non-local token declarations', () => {
  expect(checkDuelStyles([])).toEqual(['duel CSS: refused empty inventory']);
  expect(checkDuelStyles([{ path: 'tokens.css', text: '.ty-stage{--other:3px;color:#fff}' }])).toHaveLength(1);
  expect(checkDuelStyles([{ path: 'stage.css', text: '@media(max-width:980px){.ty-stage{margin:1px}}' }])).toHaveLength(1);
});
