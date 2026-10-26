import { readFileSync, readdirSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

test('component styles use declared shared tokens, not raw colors or pixel sizes', () => {
  const directory = new URL('.', import.meta.url);
  const files = readdirSync(directory).filter(path => path.endsWith('.css'));
  expect(files.length).toBeGreaterThan(0);
  console.log(`[component CSS] walked ${files.length} files`);
  const styles = files.map(path => readFileSync(new URL(path, directory), 'utf8')).join('\n');
  const declarations = new Set([...styles.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]));
  const known = new Set([...Object.keys(tokens.theme.paper), ...Object.keys(tokens.layout), ...declarations]);
  for (const [, name] of styles.matchAll(/var\(--([\w-]+)/g)) expect(known.has(name ?? '')).toBe(true);
  expect(styles).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  // Media queries cannot consume CSS custom properties. This is the measured prototype breakpoint.
  const declarationsOnly = styles.replaceAll('@media (max-width: 1420px)', '@media (max-width: breakpoint)')
    .replaceAll('@media (max-width: 900px)', '@media (max-width: breakpoint)');
  expect(declarationsOnly).not.toMatch(/\b\d+(?:\.\d+)?px\b/);
});
