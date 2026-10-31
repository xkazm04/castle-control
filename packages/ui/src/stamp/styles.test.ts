import { readFileSync } from 'node:fs';
import { tokens } from '@castle-control/tokens';
import { expect, test } from 'vitest';
import { stampKinds, stampTable } from './table.js';

const css = readFileSync(new URL('./stamp.css', import.meta.url), 'utf8');
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

test('the standalone stamp stylesheet uses declared tokens without literal colours or pixels', () => {
  const declarations = [...css.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]);
  // --stamp-size is the public host override; it inherits from the site stage or kit row.
  const shared = [tokens.theme.paper, tokens.layout, tokens.cutaway, tokens.motion, tokens.type];
  const known = new Set([...shared.flatMap(group => Object.keys(group)), ...declarations, 'stamp-size']);
  for (const [, name] of css.matchAll(/var\(--([\w-]+)/g)) expect(known.has(name ?? ''), name).toBe(true);
  const declarationsOnly = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  expect(declarationsOnly).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  expect(css).toContain('font-size: var(--stamp-size, var(--text-shell-stamp))');
});

test('every CSS kind agrees with the table on its fixed ink, tilt, fill and inner rule', () => {
  const solid = blocks.find(([, selector]) => selector?.includes('.cc-stamp:is('));
  expect(solid?.[2]).toContain('background: var(--stamp-ink)');
  expect(css).toContain('border: var(--rule-strong) solid var(--stamp-ink)');
  expect(css).toContain('winner: #FFF8EC on #E4472E is 3.8:1; ground darkened for AA, owner decision O6');
  expect(css).toContain('--stamp-rule: solid');
  expect(css).toContain('border: var(--rule-thin) var(--stamp-rule) var(--stamp-ink)');
  for (const kind of stampKinds) {
    const spec = stampTable[kind];
    const ink = spec.ink === 'key' ? 'ink' : spec.fill === 'solid' ? spec.ink : `${spec.ink}-text`;
    const token = spec.fill === 'solid' && spec.ink === 'gules' ? 'stamp-act-ground' : ink;
    const selector = `[data-stamp="${kind}"]`;
    const block = blocks.find(([, selectors, body]) => selectors?.includes(selector) && body?.includes('--stamp-ink:'))?.[2] ?? '';
    expect(block, kind).toContain(`--stamp-ink: var(--${token})`);
    expect(block, kind).toContain(`--stamp-tilt: ${spec.tilt}deg`);
    expect(block.includes('--stamp-rule: dashed'), kind).toBe(spec.rule === 'dashed');
    expect(solid?.[1]?.includes(selector), kind).toBe(spec.fill === 'solid');
  }
  const seal = blocks.find(([, selector]) => selector?.includes('[data-dot="seal"]'))?.[2] ?? '';
  expect(seal).toContain('background: var(--or)');
  expect(css).toContain('.cc-stamp:where(:not(.cc-chip))::before');
  expect(css).toContain('filter: url(#inkedge)');
});

test('each solid kind uses its intended lettering token and the lamp retains fixed light ink', () => {
  const solids = stampKinds.filter(kind => stampTable[kind].fill === 'solid');
  expect(solids).toEqual(['armed', 'on-air', 'sealed']);
  for (const kind of solids) {
    const color = blocks.filter(([, selector]) => selector?.includes(`[data-stamp="${kind}"]`))
      .flatMap(([, , body]) => [...(body ?? '').matchAll(/(?:^|;)\s*color:\s*var\(--([\w-]+)\)/g)])
      .at(-1)?.[1];
    expect(color, kind).toBe(kind === 'sealed' ? 'stamp-seal-text' : 'stamp-paper');
  }
  const lamp = blocks.find(([, selector]) => selector?.includes('[data-dot="lamp"]'))?.[2] ?? '';
  expect(lamp).toContain('background: var(--stamp-paper)');
  expect(lamp).toContain('color-mix(in srgb, var(--stamp-paper) 35%, transparent)');
  expect(css).not.toContain('var(--press-paper)');
});

test('stamp landing and bleed use shared motion tokens and reduced motion keeps the static meaning', () => {
  expect(css).toContain('.cc-stamp[data-land] { animation: stamp-land var(--m-stamp) var(--ease-stamp) both; }');
  expect(css).toContain('animation: ink-bleed var(--m-bleed) ease-out both');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(reduced).toContain('.cc-stamp[data-land], .cc-stamp-bleed { animation: none; }');
  expect(reduced).toContain('.cc-stamp-bleed { display: none; }');
  expect(reduced).not.toMatch(/\.cc-stamp(?:\[data-land\])?\s*\{[^}]*display:\s*none/);
  const kit = readFileSync(new URL('../../kit/stamps.css', import.meta.url), 'utf8');
  expect(kit).toContain('--stamp-size: var(--text-shell-stamp)');
  expect(kit).toContain('--stamp-size: var(--text-stage-stamp)');
});
