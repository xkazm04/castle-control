import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tokens } from '@castle-control/tokens';

function renderedSize(design_px: number, floor_px: number, scale: number) {
  return Math.max(design_px, floor_px / scale) * scale;
}

function tokenPixels(name: string) {
  const values: Readonly<Record<string, string>> = tokens.type;
  const value = values[name];
  if (!value || !/^\d+(?:\.\d+)?px$/.test(value)) throw new Error(`Missing pixel type token: ${name}`);
  return Number.parseFloat(value);
}

test('every Keep type formula preserves its token floor at effective scales 0.5 through 1.2', () => {
  const css = readFileSync(new URL('./keep.css', import.meta.url), 'utf8');
  const formulas = [...css.matchAll(/(--keep-[\w-]+-size):\s*([^;]+);/g)];
  const floors: Readonly<Record<string, string>> = {
    '--keep-label-size': 'text-shell-label', '--keep-eyebrow-size': 'text-shell-label',
    '--keep-name-size': 'text-shell-label', '--keep-line-size': 'text-shell-body',
    '--keep-art-size': 'text-shell-label', '--keep-headline-size': 'text-shell-label',
    '--keep-sub-size': 'text-shell-body', '--keep-word-size': 'text-shell-label',
  };
  expect(formulas.map(formula => formula[1]).sort()).toEqual(Object.keys(floors).sort());
  for (const [, name, expression] of formulas) {
    const parsed = /^max\(var\(--(text-[\w-]+)\), calc\(var\(--(text-[\w-]+)\) \* var\(--keep-inverse\)\)\)$/.exec(expression ?? '');
    if (!name || !parsed?.[1] || !parsed[2]) throw new Error(`Unsupported Keep size formula: ${expression}`);
    expect(parsed[2], name).toBe(floors[name]);
    const design = tokenPixels(parsed[1]);
    const floor = tokenPixels(parsed[2]);
    for (let hundredths = 50; hundredths <= 120; hundredths++) {
      const scale = hundredths / 100;
      expect(renderedSize(design, floor, scale), `${name} at ${scale}`).toBeGreaterThanOrEqual(floor - 1e-10);
    }
  }
});
