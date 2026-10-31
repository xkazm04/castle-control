import { readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SAMPLE } from '@castle-control/duel';
import { expect, test } from 'vitest';
import { Tiltyard } from './stage.jsx';
import { tiltyardWords } from './words.js';

type Specificity = readonly [number, number, number];
interface Rule { selector: string; declarations: ReadonlyMap<string, string>; source: string }

function withoutWhere(selector: string): string {
  let start = selector.indexOf(':where(');
  while (start !== -1) {
    let end = start + 7;
    let depth = 1;
    while (depth && end < selector.length) {
      const character = selector[end++];
      if (character === '(') depth++;
      if (character === ')') depth--;
    }
    selector = selector.slice(0, start) + selector.slice(end);
    start = selector.indexOf(':where(');
  }
  return selector;
}
/** The baseline selectors below use types/classes and zero-specificity :where(). */
function specificity(selector: string): Specificity {
  const plain = withoutWhere(selector);
  const ids = plain.match(/#[\w-]+/g)?.length ?? 0;
  const classes = plain.match(/\.[\w-]+/g)?.length ?? 0;
  const types = plain.replace(/[#.][\w-]+/g, '').split(/[\s>+~]+/).filter(part => part && part !== '*').length;
  return [ids, classes, types];
}
function compare(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
function parseRules(source: string, text: string): Rule[] {
  return [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) => {
    const declarations = new Map((body ?? '').split(';').flatMap(declaration => {
      const colon = declaration.indexOf(':');
      return colon < 0 ? [] : [[declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const];
    }));
    return (selectors ?? '').split(',').map(selector => ({ selector: selector.trim(), declarations, source }));
  });
}
function matchesButton(selector: string, classes: readonly string[]): boolean {
  const plain = selector.replace(/:not\(\.cc-seal-button\)/g, '').replace(/:where\(([^()]*)\)/g, '$1');
  const parts = plain.trim().split(/\s+/);
  const target = parts.pop() ?? '';
  // Only unconditional rules on the button apply; descendant text and state rules do not.
  return parts.every(part => part === '.ty-stage' || part === '.shell-room')
    && /^(?:button|\*)?(?:\.[\w-]+)*$/.test(target)
    && [...target.matchAll(/\.([\w-]+)/g)].every(([, name]) => classes.includes(name ?? ''));
}
function winner(rules: readonly Rule[], classes: readonly string[], property: string): Rule | undefined {
  let result: Rule | undefined;
  for (const rule of rules) {
    if (!rule.declarations.has(property) || !matchesButton(rule.selector, classes)) continue;
    if (!result || compare(specificity(rule.selector), specificity(result.selector)) >= 0) result = rule;
  }
  return result;
}
const host_floor: Specificity = [0, 1, 0];
const host = parseRules('host', `.shell-room :where(button:not(.cc-seal-button)){
  font:600 var(--text-body)/1.4 var(--font-ui);color:var(--ink);
  border:var(--rule-medium) solid var(--line);background:var(--card);
  padding:var(--space-7) var(--space-10);max-width:100%;cursor:pointer;
}`);
const properties = ['font', 'color', 'border', 'background', 'padding', 'max-width', 'cursor'] as const;

function buttonDefects(rules: readonly Rule[], buttons: readonly (readonly string[])[]): string[] {
  return buttons.flatMap(classes => properties.flatMap(property => {
    const rule = winner(rules, classes, property);
    return rule && rule.source !== 'host' && compare(specificity(rule.selector), host_floor) > 0 ? []
      : [`${classes.join('.')}: ${property} does not outrank (0,1,0)`];
  }));
}

test('button specificity counts :where as zero, including nested shell exclusions', () => {
  expect(specificity(host[0]!.selector)).toEqual(host_floor);
  expect(specificity(':where(.ty-stage) button')).toEqual([0, 0, 1]);
  expect(specificity('.ty-stage button')).toEqual([0, 1, 1]);
  expect(specificity('.ty-stage .ty-card')).toEqual([0, 2, 0]);
});
test('every rendered duel button outranks host button styles in either stylesheet order', () => {
  const directory = new URL('.', import.meta.url);
  const files = readdirSync(directory).filter(name => name.endsWith('.css'));
  expect(files.length).toBeGreaterThanOrEqual(10);
  const rules = files.flatMap(name => parseRules(name, readFileSync(new URL(name, directory), 'utf8')));
  const card_widths = rules.filter(rule => rule.source === 'card.css' && rule.declarations.has('width')
    && matchesButton(rule.selector, ['ty-card']));
  expect(card_widths).toHaveLength(2);
  expect(card_widths[1]!.declarations.get('width')).toBe('100%');
  expect(compare(specificity(card_widths[1]!.selector), specificity(card_widths[0]!.selector))).toBeGreaterThanOrEqual(0);
  const buttons = (['show', 'chat', 'ladder'] as const).flatMap(initial_mode => {
    const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={tiltyardWords} initial_mode={initial_mode} label="SAMPLE lists" />);
    return [...html.matchAll(/<button\b[^>]*\bclass="([^"]+)"/g)].map(([, classes]) => (classes ?? '').split(/\s+/));
  });
  const classes = new Set(buttons.flat());
  for (const name of ['ty-pennant', 'ty-card', 'ty-yb', 'ty-primary']) expect(classes.has(name)).toBe(true);
  for (const ordered of [[...host, ...rules], [...rules, ...host]]) {
    expect(buttonDefects(ordered, buttons)).toEqual([]);
    for (const button of buttons) {
      expect(winner(ordered, button, 'max-width')?.declarations.get('max-width')).toBe('none');
      expect(winner(ordered, button, 'font')?.declarations.get('font')).toBe(button.includes('ty-yb')
        ? '700 var(--text-small)/1 var(--font-ui)' : 'inherit');
      // The shorthand decides weight, size, family and line-height; no longhand may let the host back in.
      for (const property of ['font-weight', 'font-size', 'font-family', 'line-height']) {
        const longhand = winner(ordered, button, property);
        if (longhand) expect(compare(specificity(longhand.selector), host_floor)).toBeGreaterThan(0);
      }
    }
  }
  console.log(`[duel buttons] walked ${files.length} CSS files; ${buttons.length} buttons; host before/after: 0 defects`);
});
test('button style proof rejects the old weak reset and class-only defaults', () => {
  const rules = parseRules('weak.css', `:where(.ty-stage) button{font:inherit;max-width:none}
    .ty-pennant,.ty-card,.ty-yb{color:inherit;border:0;background:transparent;padding:0;cursor:pointer}`);
  const defects = buttonDefects([...rules, ...host], [['ty-pennant'], ['ty-card'], ['ty-yb']]);
  for (const name of ['ty-pennant', 'ty-card', 'ty-yb']) {
    expect(defects).toContain(`${name}: font does not outrank (0,1,0)`);
    expect(defects).toContain(`${name}: max-width does not outrank (0,1,0)`);
  }
});
