import { readFileSync, readdirSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';

function cssFiles(folder: URL): URL[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) return [];
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}

test('component styles use declared shared tokens, not raw colors or pixel sizes', () => {
  const directory = new URL('.', import.meta.url);
  // Duel's counted styles.test.ts checks its local token sheet and container breakpoints.
  const duel = new URL('./duel/', directory);
  // The fused direction sheets carry structural px from the design; fused-styles.test.ts checks them.
  const fused = new URL('./fused/', directory);
  const files = [directory, new URL('../kit/', directory)].flatMap(cssFiles)
    .filter(path => !path.href.startsWith(duel.href) && !path.href.startsWith(fused.href));
  expect(files.length).toBeGreaterThan(0);
  expect(files.some(path => path.pathname.endsWith('/stamp/stamp.css'))).toBe(true);
  expect(files.some(path => path.pathname.endsWith('/design/focus.css'))).toBe(true);
  console.log(`[component CSS] walked ${files.length} files`);
  // Design provenance comments may record the original colours; declarations stay token-only.
  const styles = files.map(path => readFileSync(path, 'utf8')).join('\n').replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Set([...styles.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]));
  const shared = [tokens.theme.paper, tokens.layout, tokens.art, tokens.cutaway, tokens.motion, tokens.type];
  const known = new Set([...shared.flatMap(group => Object.keys(group)), ...declarations]);
  for (const [, name] of styles.matchAll(/var\(--([\w-]+)/g)) expect(known.has(name ?? ''), name).toBe(true);
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

test('disabled seals retain ink lettering and rules with the winner half-opacity treatment', () => {
  const styles = readFileSync(new URL('./seal-button.css', import.meta.url), 'utf8');
  const seal = styles.match(/\.cc-seal-button\s*\{([^}]+)\}/)?.[1] ?? '';
  const disabled = styles.match(/\.cc-seal-button:disabled\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(seal).toContain('color: var(--ink)');
  expect(seal).toContain('background: var(--card)');
  expect(seal).toContain('border: var(--space-3) solid var(--ink)');
  expect(seal).toContain('padding: var(--space-1) var(--space-6)');
  expect(disabled).toContain('opacity: .5');
  expect(disabled).toContain('cursor: not-allowed');
  expect(disabled).toContain('box-shadow: none');
  expect(disabled).not.toMatch(/(?:color|background|border)[\w-]*\s*:/);
  for (const theme of ['paper', 'stock'] as const) {
    const ink = { ...tokens.theme.paper, ...tokens.theme[theme] }.ink;
    const { card } = tokens.theme[theme];
    const values = [luminance(ink), luminance(card)];
    const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    console.log(`[seal ink before disabled opacity ${theme}] contrast ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test('shell containers and strip tiles explicitly preserve the winner defaults and intrinsic state width', () => {
  const shell = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  const strip = readFileSync(new URL('./chamber-strip.css', import.meta.url), 'utf8');
  for (const rule of [shell.match(/\.cc-rampart\s*\{([^}]+)\}/)?.[1], strip.match(/\.cc-chamber-strip\s*\{([^}]+)\}/)?.[1]]) {
    expect(rule).toContain('font-size: var(--text-number)');
    expect(rule).toContain('line-height: normal');
  }
  const tile = strip.match(/\.cc-chamber-tile\s*\{([^}]+)\}/)?.[1] ?? '';
  for (const declaration of ['display: flex', 'align-items: center', 'padding: 0 var(--space-14)',
    'font: 400 var(--text-number)/normal var(--font-ui)']) expect(tile).toContain(declaration);
  const state = strip.match(/\.cc-chamber-state\s*\{([^}]+)\}/)?.[1] ?? '';
  for (const declaration of ['flex: 0 1 auto', 'min-width: 0', 'overflow: hidden', 'text-overflow: ellipsis',
    'white-space: nowrap', 'font: 500 var(--text-shell-state)/1 var(--font-ui)']) expect(state).toContain(declaration);
  expect(state).not.toMatch(/(?:^|;)\s*width\s*:/);
});

test('shell keycaps retain an unpadded minimum box but grow for longer keys, and monitors keep normal line height', () => {
  const kbd = readFileSync(new URL('./kbd.css', import.meta.url), 'utf8');
  for (const declaration of ['min-width: var(--space-22)', 'width: max-content', 'height: var(--space-22)', 'padding: 0']) expect(kbd).toContain(declaration);
  expect(kbd).not.toMatch(/(?:^|;)\s*width:\s*var\(--space-22\)/);
  expect(kbd).not.toContain('padding-inline:');
  const monitor = readFileSync(new URL('./program-monitor.css', import.meta.url), 'utf8');
  expect(monitor).toContain('font: 400 var(--text-shell-body)/normal var(--font-ui)');
});

test('room titles and Back controls retain winner type and dimensions over host defaults', () => {
  const css = readFileSync(new URL('./breadcrumb.css', import.meta.url), 'utf8');
  const card = css.match(/\.cc-room-title-card\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(card).toContain('font-size: var(--text-number)');
  expect(card).toContain('line-height: normal');
  expect(css).toContain('.cc-room-title[data-module] > .cc-room-title-card { max-width: calc(var(--space-40) * 18); }');
  const name = css.match(/\.cc-room-title-card h1\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(name).toContain('font: 700 var(--text-shell-title)/.86 var(--font-display)');
  expect(name).toContain('font-stretch: condensed');
  expect(css).toContain('.cc-room-title .cc-room-back, .cc-room-header .cc-room-back { padding: 0 var(--space-14); max-width: none; }');
  const key = css.match(/\.cc-room-back \.cc-kbd\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(key).toContain('height: auto');
  expect(key).toContain('padding: var(--space-3) var(--space-5)');
  expect(key).toContain('border-bottom-width: var(--rule-medium)');
});
