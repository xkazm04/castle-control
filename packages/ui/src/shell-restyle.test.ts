import { readFileSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

function contrast(text: string, ground: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return .2126 * (channels[0] ?? 0) + .7152 * (channels[1] ?? 0) + .0722 * (channels[2] ?? 0);
  };
  const values = [luminance(text), luminance(ground)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}

test.each(['paper', 'stock'] as const)('Rampart on-dark stamp inks stay readable in %s', theme => {
  const palette = { ...tokens.theme.paper, ...tokens.theme[theme], ...tokens.cutaway, ...(theme === 'stock' ? tokens.stock_cutaway : {}) };
  for (const ink of ['rampart-paper', 'rampart-offair', 'rampart-shadow', 'or'] as const) {
    expect(contrast(palette[ink], palette['rampart-background']), ink).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(palette['stamp-paper'], palette['stamp-act-ground'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(palette['rampart-background'], palette['rampart-paper'])).toBeGreaterThanOrEqual(4.5);
});

test('Rampart scopes preserve key, gules, azure and or stamp families instead of applying a blanket ink', () => {
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.cc-rampart \.cc-stamp\[data-stamp\]\s*\{\s*--stamp-ink: var\(--rampart-paper\)/);
  for (const [kinds, ink] of [
    ['armed|on-air', 'stamp-act-ground'], ['off-air|held|blocked', 'rampart-offair'],
    ['shadow|pass', 'rampart-shadow'], ['draft', 'or'],
  ]) {
    for (const kind of kinds?.split('|') ?? []) {
      const rule = css.split('\n').find(line => line.includes(`[data-stamp="${kind}"]`));
      expect(rule).toContain(`--stamp-ink: var(--${ink})`);
    }
  }
  expect(css).toContain('[data-theme="stock"] .cc-rampart { background: var(--rampart-background); }');
});
