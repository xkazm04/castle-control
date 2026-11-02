import { readFileSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

test('the dock reads shared or fused tokens; every fused name carries a fallback, and no raw colours', () => {
  const styles = ['dock.css', 'deck.css'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n').replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const declared = new Set([...styles.matchAll(/(?:^|[\s;{])--([\w-]+)\s*:/gm)].map(match => match[1]));
  const shared = [tokens.theme.paper, tokens.layout, tokens.art, tokens.cutaway, tokens.motion, tokens.type];
  const fused = [...readFileSync(new URL('../fused/tokens.css', import.meta.url), 'utf8').matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]);
  const known = new Set([...shared.flatMap(group => Object.keys(group)), ...declared, ...fused]);
  const uses = [...styles.matchAll(/var\(--([\w-]+)\s*(,)?/g)];
  expect(uses.length).toBeGreaterThan(50);
  for (const [, name, fallback] of uses) expect(known.has(name ?? '') || fallback === ',', `--${name} needs a fallback`).toBe(true);
  expect(styles).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  // Local aliases are only declared on the dock root, so they never shadow the shell's tokens.
  expect([...declared].every(name => name?.startsWith('sd-'))).toBe(true);
});
