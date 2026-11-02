import { readFileSync, readdirSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

const folder = new URL('./', import.meta.url);
const tokenFolder = new URL('../../../tokens/src/fused/', import.meta.url);
const read = (url: URL) => readFileSync(url, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');
const sheets = readdirSync(folder).filter(name => name.endsWith('.css'));
const fusedTokens = ['tokens.css', 'textures.css', 'bridge.css'].map(name => read(new URL(name, tokenFolder))).join('\n');
const names = (css: string) => new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1] ?? ''));

test('the fused sheets read declared tokens only: no literal colours, every var() is defined', () => {
  expect(sheets).toEqual(expect.arrayContaining(['shell.css', 'primitives.css', 'glass.css', 'folio.css', 'rampart.css', 'skin.css', 'caps.css', 'surface.css']));
  console.log(`[fused CSS] walked ${sheets.length} files`);
  const styles = sheets.map(name => read(new URL(name, folder))).join('\n');
  const legacy = [tokens.theme.paper, tokens.layout, tokens.art, tokens.cutaway, tokens.motion, tokens.type].flatMap(group => Object.keys(group));
  const known = new Set([...legacy, ...names(fusedTokens), ...names(styles)]);
  for (const [, name] of styles.matchAll(/var\(--([\w-]+)/g)) expect(known.has(name ?? ''), name).toBe(true);
  const components = sheets.filter(name => name !== 'tokens.css').map(name => read(new URL(name, folder))).join('\n');
  expect(components.replaceAll(/url\("data:[^"]*"\)/g, '')).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
});

test('fused type keeps the 13 px floor through --text-* aliases', () => {
  const tokenSizes = [...fusedTokens.matchAll(/--(?:t|text-px)-[\w-]+:\s*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  expect(tokenSizes.length).toBeGreaterThan(10);
  for (const size of tokenSizes) expect(size).toBeGreaterThanOrEqual(13);
  const styles = sheets.map(name => read(new URL(name, folder))).join('\n');
  // No raw pixel font sizes: the repo type-floor lint admits only --text-* tokens.
  expect(styles).not.toMatch(/font(?:-size)?\s*:[^;}]*?\b\d+(?:\.\d+)?px/);
});

test('the night override preserves each winner palette value byte for byte', () => {
  const winner = read(new URL('../../../../.port/winner/base.css', import.meta.url)).split('}')[0] ?? '';
  const night = read(new URL('./tokens.css', folder)).split('[data-theme="night"]')[1] ?? '';
  const palette: Readonly<Record<string, string>> = {
    bg: 'stone', bg2: 'stone-2', panel: 'surface', panel2: 'surface-2', line: 'hair', line2: 'hair-2',
    text: 'ink', text2: 'ink-2', mute: 'muted', gold: 'deck-gold', gold2: 'deck-gold-2',
    ruby: 'gules', 'ruby-d': 'gules-deep', sap: 'azure', 'sap-d': 'azure-deep',
    amb: 'or', 'amb-d': 'or-deep', ame: 'amethyst', 'ame-d': 'amethyst-deep', ok: 'ok',
  };
  for (const [source, target] of Object.entries(palette)) {
    const value = new RegExp(`--${source}:\\s*([^;]+)`).exec(winner)?.[1];
    expect(value, source).toBeDefined();
    expect(new RegExp(`--${target}:\\s*([^;]+)`).exec(night)?.[1], target).toBe(value);
  }
});
