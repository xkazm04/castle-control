import { tokens } from '@castle-control/tokens';
import { describe, expect, test } from 'vitest';
import { stampKinds, stampTable } from './table.js';

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5);
}

function contrastRatio(text: string, ground: string) {
  const values = [luminance(text), luminance(ground)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}

test('WCAG contrast calculation preserves the black/white and equal-colour reference ratios', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
  expect(contrastRatio('#123456', '#123456')).toBe(1);
});

describe.each(['paper', 'stock'] as const)('%s solid stamp contrast from generated tokens', theme => {
  const palette = { ...tokens.theme.paper, ...tokens.theme[theme], ...tokens.cutaway,
    ...(theme === 'stock' ? tokens.stock_cutaway : {}) };
  test.each(stampKinds.filter(kind => stampTable[kind].fill === 'solid'))('%s lettering meets 4.5:1 on its stamp ground', kind => {
    const text = palette[kind === 'sealed' ? 'stamp-seal-text' : 'stamp-paper'];
    const ink = stampTable[kind].ink;
    const ground = palette[ink === 'key' ? 'ink' : ink === 'gules' ? 'stamp-act-ground' : ink];
    const ratio = contrastRatio(text, ground);
    console.log(`[stamp contrast ${theme}/${kind}] ${ratio.toFixed(4)}:1`);
    expect(ratio, `${text} on ${ground}: ${ratio.toFixed(4)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
