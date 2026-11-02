import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./deck.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): Map<string, string> {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1]?.split(',').some(item => item.trim() === selector));
  expect(found.length, `Missing scoped rule: ${selector}`).toBeGreaterThan(0);
  return new Map(found.flatMap(match => (match[2] ?? '').split(';').filter(item => item.trim()).map(item => {
    const colon = item.indexOf(':');
    return [item.slice(0, colon).trim(), item.slice(colon + 1).trim()];
  })));
}

test('section children discard legacy named grid placements, keeping the heading above full-width content', () => {
  const section = rule('.gh-deck .cc-chamber-section');
  expect(section.get('grid-template-columns')).toBe('minmax(0, 1fr)');
  expect(section.get('grid-template-areas')).toBe('none');
  expect(rule('.gh-deck .cc-chamber-section > *').get('grid-area')).toBe('auto');
  const queue = rule('.gh-deck .cc-chamber-section .gh-gate[data-part="queue"]');
  expect(queue.get('display')).toBe('flex');
  expect(queue.get('flex-direction')).toBe('column');
  expect(queue.get('padding')).toBe('0');
  expect(queue.get('overflow')).toBe('visible');
  expect(rule('.gh-deck .cc-chamber-section .gh-gate[data-part="queue"]::before').get('content')).toBe('none');
});

test('held and ban cards reset every legacy track and span; verdict pairs stay in one row', () => {
  for (const card of ['.gh-held', '.gh-warrant']) {
    const styles = rule(`.gh-deck .cc-chamber-section ${card}`);
    expect(styles.get('grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(styles.get('grid-template-areas')).toBe('none');
    expect(styles.get('min-width')).toBe('0');
    const child = rule(`.gh-deck ${card} > *`);
    expect(child.get('grid-area')).toBe('auto');
    expect(child.get('word-break')).toBe('normal');
    expect(child.get('overflow-wrap')).toBe('normal');
  }
  for (const actions of ['.gh-gate__act', '.gh-warrant__act']) {
    expect(rule(`.gh-deck ${actions}`).get('display')).toBe('flex');
    expect(rule(`.gh-deck ${actions}`).get('flex-wrap')).toBe('nowrap');
  }
});

test('compact Herald uses one filter row, a 90-pixel chart and two columns of swatch/label/share rows', () => {
  const prefix = '.gh-deck .gh-herald--compact';
  expect(rule(`${prefix} .moderator-chip-toggles`).get('flex-wrap')).toBe('nowrap');
  expect(rule(`${prefix} .gh-chart`).get('height')).toBe('calc(var(--space-10) * 9)');
  expect(rule(`${prefix} .moderator-tiles`).get('grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))');
  expect(rule(`${prefix} .moderator-tile`).get('grid-template-columns')).toBe('var(--space-16) minmax(0, 1fr) max-content');
  expect(rule(`${prefix} .moderator-tile > *`).get('grid-area')).toBe('auto');
  expect(rule(`${prefix} .moderator-tile > *`).get('overflow-wrap')).toBe('normal');
  const tokens = readFileSync(new URL('../../../../../packages/tokens/src/generated.css', import.meta.url), 'utf8');
  for (const [, token] of css.matchAll(/var\((--space-\d+)\)/g)) expect(tokens).toContain(`${token}:`);
});
