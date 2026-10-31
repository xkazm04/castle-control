import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { entranceStyle } from './entrance.js';

test('entranceStyle supplies only the stagger index and composes with native React styles', () => {
  for (const index of [0, 1, 8]) {
    expect(entranceStyle(index)).toEqual({ '--cc-entrance-index': index });
    const html = renderToStaticMarkup(<section className="cc-print-in" style={entranceStyle(index)}>Present content</section>);
    expect(html).toContain(`style="--cc-entrance-index:${index}"`);
    expect(html).toContain('Present content');
  }
});

test.each([-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('entranceStyle refuses invalid index %s', index => {
  expect(() => entranceStyle(index)).toThrow(RangeError);
});

test('print-in uses the shared motion tokens and reduced motion leaves content present', () => {
  const css = readFileSync(new URL('./entrance.css', import.meta.url), 'utf8');
  expect(css).toContain('animation: print-in var(--m-print) var(--ease-press) both');
  expect(css).toContain('var(--cc-entrance-index, 0) * var(--cc-entrance-step)');
  expect(css).toContain('--cc-entrance-start: .35s; --cc-entrance-step: .14s');
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cc-print-in, \.cc-slip \{ animation: none; \}/);
  expect(css.slice(0, css.indexOf('@keyframes'))).not.toMatch(/opacity: 0|visibility: hidden|clip-path:/);
});
