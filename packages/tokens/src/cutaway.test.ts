import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tokens } from './generated.js';
import type { TokenName } from './generated.js';
import { renderStylesheet } from './render.js';
import {
  artTokens, cutawayTokens, layoutTokens, motionTokens, stockArtTokens,
  stockCutawayTokens, stockLayoutTokens, themeTokens, typeTokens,
} from './source.js';
import { winnerArt, winnerCutaway, winnerMotion } from './winner-reference.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const groups = [artTokens, cutawayTokens, motionTokens, typeTokens];
type AddedName = keyof typeof artTokens | keyof typeof cutawayTokens | keyof typeof motionTokens | keyof typeof typeTokens;
const names: TokenName[] = groups.flatMap(group => Object.keys(group)) as AddedName[];
const blocks = [...renderStylesheet().matchAll(/(?:^|\n)([^{}\n]+)\s*\{([^}]+)\}/g)];

test('new groups render their exact values in both existing blocks and the typed mirror', () => {
  expect(blocks.map(block => block[1]?.trim())).toEqual([':root, [data-theme="paper"]', '[data-theme="stock"]']);
  const themes = [groups, [stockArtTokens, stockCutawayTokens, motionTokens, typeTokens]];
  for (const [index, theme] of themes.entries()) {
    for (const group of theme) {
      for (const [name, value] of Object.entries(group)) {
        expect(blocks[index]?.[2]).toContain(`--${name}:${value};`);
      }
    }
  }
  expect(tokens.art).toEqual(artTokens);
  expect(tokens.stock_art).toEqual(stockArtTokens);
  expect(tokens.cutaway).toEqual(cutawayTokens);
  expect(tokens.stock_cutaway).toEqual(stockCutawayTokens);
  expect(tokens.motion).toEqual(motionTokens);
  expect(tokens.type).toEqual(typeTokens);
  expect(names).toHaveLength(161);
});

test('no custom property occurs twice across groups or declarations in one block', () => {
  const themes = [[themeTokens.paper, layoutTokens, ...groups],
    [themeTokens.stock, stockLayoutTokens, stockArtTokens, stockCutawayTokens, motionTokens, typeTokens]];
  for (const theme of themes) {
    const keys = theme.flatMap(group => Object.keys(group));
    expect(new Set(keys).size).toBe(keys.length);
  }
  for (const block of blocks) {
    const keys = [...(block[2] ?? '').matchAll(/--([\w-]+):/g)].map(match => match[1]);
    expect(new Set(keys).size).toBe(keys.length);
  }
});

test('D10 defines exactly the printed art paints, identical in both themes', () => {
  expect(artTokens).toEqual(winnerArt);
  expect(stockArtTokens).toEqual(artTokens);
});

test('all keep-art motion fallbacks are admitted byte-equal, with only CSS whitespace ignored for easing', () => {
  const art = read('../../keep-art/src/keep-art.css');
  const fallbacks = [...art.matchAll(/var\(--((?:m-|ease-)[\w-]+),\s*(cubic-bezier\([^)]*\)|[^)]+)\)/g)];
  expect(new Set(fallbacks.map(match => match[1])).size).toBe(17);
  for (const [, name, fallback] of fallbacks) {
    if (!name || !fallback) throw new Error('Incomplete motion fallback');
    const value = (motionTokens as Readonly<Record<string, string>>)[name];
    expect(value?.replaceAll(' ', '')).toBe(fallback.trim().replaceAll(' ', ''));
  }
});

test('paper paints and press motion retain the exact winner literals', () => {
  expect(cutawayTokens).toEqual(winnerCutaway);
  expect(motionTokens).toEqual(winnerMotion);
});

test('every rejected candidate name is absent from generated CSS', () => {
  const rejected = [...read('../REJECTED.md').matchAll(/^\| `--([\w-]+)` \|/gm)].map(match => match[1]);
  expect(rejected).toHaveLength(278);
  const css = read('./generated.css');
  for (const name of rejected) expect(css).not.toContain(`--${name}`);
});

test('the admission ledger defines every new role and records exact paper and stock values', () => {
  const ledger = [...read('../CUTAWAY.md').matchAll(/^\| `--([\w-]+)` \| `([^`]+)` \| `([^`]+)` \| ([^\n]+) \|$/gm)];
  const paper = { ...artTokens, ...cutawayTokens, ...motionTokens, ...typeTokens };
  const stock = { ...stockArtTokens, ...stockCutawayTokens, ...motionTokens, ...typeTokens };
  expect(ledger.map(row => row[1]).sort()).toEqual(Object.keys(paper).sort());
  for (const [, name, paperValue, stockValue, definition] of ledger) {
    if (!name) throw new Error('Missing admission name');
    expect(paperValue).toBe((paper as Readonly<Record<string, string>>)[name]);
    expect(stockValue).toBe((stock as Readonly<Record<string, string>>)[name]);
    expect(definition?.length).toBeGreaterThan(20);
  }
});

test('stock surface values use the existing dark papers and retain fixed on-dark inks', () => {
  const darkPapers = [themeTokens.stock.paper, themeTokens.stock['paper-2'], themeTokens.stock.card, themeTokens.stock.line];
  for (const name of ['stage-paper', 'strip-paper', 'column-paper', 'plaque-paper', 'panel-paper',
    'draft-paper', 'steward-paper', 'monitor-paper', 'ticket-paper'] as const) {
    expect(darkPapers).toContain(stockCutawayTokens[name]);
  }
  for (const name of ['rampart-background', 'rampart-paper', 'rampart-muted', 'rampart-rule',
    'rampart-offair', 'rampart-shadow', 'rampart-secondary', 'stamp-paper'] as const) {
    expect(stockCutawayTokens[name]).toBe(cutawayTokens[name]);
  }
  expect(stockCutawayTokens['press-paper']).toBe(themeTokens.stock.paper);
});
