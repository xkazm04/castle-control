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

test('frame fields share token chrome and a token-drawn select chevron', () => {
  const styles = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8');
  const fields = styles.match(/\.cc-frame :is\(select, input[^{}]+\{([^}]+)\}/)?.[1] ?? '';
  for (const declaration of ['appearance: none', 'border: var(--rule-thin) solid var(--ink)',
    'border-radius: var(--r-sm)', 'background: var(--card)', 'color: var(--ink)',
    'padding: var(--space-7) var(--space-10)', 'font: var(--text-body)/1.4 var(--font-ui)']) {
    expect(fields).toContain(declaration);
  }
  for (const type of ['hidden', 'checkbox', 'radio', 'range']) expect(styles).toContain(`[type="${type}"]`);
  const select = styles.match(/\.cc-frame select\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(select).toContain('background-image: linear-gradient(');
  expect(select).toContain('var(--ink)');
  expect(select).toContain('padding-inline-end: var(--space-24)');
});

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

test('disabled seals use muted ink on a neutral card with AA contrast in both themes', () => {
  const styles = readFileSync(new URL('./seal-button.css', import.meta.url), 'utf8');
  const disabled = styles.match(/\.cc-seal-button:disabled\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(disabled).toContain('color: var(--muted)');
  expect(disabled).toContain('background: var(--card)');
  expect(disabled).toContain('border-color: var(--muted)');
  expect(disabled).not.toContain('opacity:');
  for (const theme of ['paper', 'stock'] as const) {
    const { muted, card } = tokens.theme[theme];
    const values = [luminance(muted), luminance(card)];
    const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    console.log(`[disabled seal ${theme}] contrast ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
