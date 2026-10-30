import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { counted, tokens } from './inventory.ts';

export type Surface = { name: string; selector: string };
type StylePolicy = { canvas: 'opaque' | 'obs-transparent' };
export const desktopSurfaces: Surface[] = [
  { name: 'frame', selector: '.cc-frame' },
  { name: 'rampart', selector: '.cc-rampart' },
  // The current shell exposes chamber navigation as a keep, strip or locator.
  { name: 'chamber navigation', selector: '.cc-chambers, .cc-chamber-strip, .cc-room-locator, .keep-cross-section, .demo-heading' },
  { name: 'room body', selector: '.keep-home, .overview-workspace, .shell-room, .demo-workspace' },
];

type FieldBorder = { color: string; style: string; width: string };
type FieldStyle = { appearance: string; borders: FieldBorder[] };

/** Pure policy: removing native chrome alone does not establish kit borders. */
export function fieldStyleErrors(actual: FieldStyle, expected: FieldBorder): string[] {
  const errors: string[] = [];
  if (actual.appearance !== 'none') errors.push(`Browser-default field appearance: ${actual.appearance}`);
  if (actual.borders.length !== 4) errors.push('Missing field border sides');
  for (const [side, border] of actual.borders.entries()) {
    if (border.color !== expected.color || border.style !== 'solid' || border.width !== expected.width) {
      errors.push(`Field border ${side}: expected ${expected.width} solid ${expected.color}, got ${border.width} ${border.style} ${border.color}`);
    }
  }
  return errors;
}

/** Runs in the page, resolving tokens under each field's own theme scope. */
export function measureFields() {
  const selector = 'select, input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"])';
  const fields = [...document.querySelectorAll(selector)].filter((node): node is HTMLElement =>
    node instanceof HTMLElement && node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  return fields.map(field => {
    const probe = document.createElement('span');
    probe.hidden = true;
    probe.style.border = 'var(--rule-thin) solid var(--ink)';
    if (!field.parentElement) throw new Error('Cannot resolve field theme tokens');
    field.parentElement.append(probe);
    const token = getComputedStyle(probe);
    const expected = { color: token.borderTopColor, style: token.borderTopStyle, width: token.borderTopWidth };
    probe.remove();
    const style = getComputedStyle(field);
    const actual = { appearance: style.appearance, borders: [
      { color: style.borderTopColor, style: style.borderTopStyle, width: style.borderTopWidth },
      { color: style.borderRightColor, style: style.borderRightStyle, width: style.borderRightWidth },
      { color: style.borderBottomColor, style: style.borderBottomStyle, width: style.borderBottomWidth },
      { color: style.borderLeftColor, style: style.borderLeftStyle, width: style.borderLeftWidth },
    ] };
    return { name: `${field.tagName}[${field.getAttribute('aria-label') ?? field.getAttribute('name') ?? ''}]`, actual, expected };
  });
}

export async function auditFields(page: Page): Promise<void> {
  const fields = await page.evaluate(measureFields);
  counted('visible desktop fields', fields.length);
  const errors = fields.flatMap(field => fieldStyleErrors(field.actual, field.expected).map(error => `${field.name}: ${error}`));
  console.log(`[e2e field inventory] ${JSON.stringify(fields)}`);
  assert.deepEqual(errors, [], 'Rendered desktop fields must use kit appearance and token borders');
}

/** Runs in the page; exported so the policy can also be tested without Chrome. */
export function measureStyles({ names, surfaces, policy }: { names: string[]; surfaces: Surface[]; policy: StylePolicy }) {
    const errors: string[] = [];
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    document.body.append(iframe);
    const blank = iframe.contentDocument;
    const blankWindow = iframe.contentWindow;
    if (!blank || !blankWindow) throw new Error('Cannot measure browser defaults');
    const defaults = blankWindow.getComputedStyle(blank.body);
    const defaultFont = defaults.fontFamily;
    const defaultColor = defaults.color;
    iframe.remove();
    // A measurement-only probe resolves the actual token font and ink to the
    // same computed syntax as rendered nodes. It never styles product content.
    const probe = document.createElement('span');
    probe.style.fontFamily = 'var(--font-ui)';
    probe.style.color = 'var(--ink)';
    document.body.append(probe);
    const tokenFont = getComputedStyle(probe).fontFamily;
    const tokenInk = getComputedStyle(probe).color;
    probe.remove();
    const transparent = (color: string) => color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
    const effectiveBackground = (element: Element): string => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const background = getComputedStyle(current).backgroundColor;
        if (!transparent(background)) return background;
      }
      return policy.canvas === 'obs-transparent' ? 'transparent' : 'rgb(255, 255, 255)';
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const missingTokens = names.filter(name => !rootStyle.getPropertyValue(name).trim());
    if (missingTokens.length) errors.push(`Root tokens unresolved: ${missingTokens.join(', ')}`);
    const walkedSurfaces: { name: string; count: number }[] = [];
    for (const surface of surfaces) {
      const nodes = [...document.querySelectorAll(surface.selector)].filter(node =>
        node instanceof HTMLElement && node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
      walkedSurfaces.push({ name: surface.name, count: nodes.length });
      if (!nodes.length) errors.push(`Missing visible ${surface.name}: ${surface.selector}`);
      for (const node of nodes) {
        const style = getComputedStyle(node);
        if (!style.fontFamily || style.fontFamily === defaultFont) errors.push(`${surface.name}: browser-default font ${style.fontFamily}`);
        if (!style.color || style.color === defaultColor) errors.push(`${surface.name}: browser-default colour ${style.color}`);
        if (policy.canvas === 'obs-transparent') {
          if (style.fontFamily !== tokenFont) errors.push(`${surface.name}: expected token UI font ${tokenFont}, got ${style.fontFamily}`);
          if (style.color !== tokenInk) errors.push(`${surface.name}: expected token ink ${tokenInk}, got ${style.color}`);
        }
        const background = effectiveBackground(node);
        if (background === 'rgb(255, 255, 255)') errors.push(`${surface.name}: default white background`);
      }
    }
    const elements = [...document.body.querySelectorAll('*')].filter((node): node is HTMLElement =>
      node instanceof HTMLElement && node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    for (const element of elements) {
      const style = getComputedStyle(element);
      const firstFont = style.fontFamily.split(',')[0]?.replaceAll(/["']/g, '').trim().toLowerCase();
      if (style.fontFamily === defaultFont || firstFont === 'times new roman' || firstFont === 'serif') {
        errors.push(`Default serif: ${element.tagName}.${element.className}`);
      }
    }
    // The app may paint a full-size frame instead of painting body itself.
    const canvasPoints = [[1, 1], [innerWidth - 1, 1], [1, innerHeight - 1],
      [innerWidth - 1, innerHeight - 1], [innerWidth / 2, innerHeight / 2]];
    for (const [x = 0, y = 0] of canvasPoints) {
      const backdrop = document.elementFromPoint(x, y) ?? document.body;
      if (effectiveBackground(backdrop) === 'rgb(255, 255, 255)') errors.push(`Default white canvas at ${x},${y}`);
    }
    const width = document.documentElement.scrollWidth;
    if (width > innerWidth) errors.push(`Horizontal overflow: ${width} > ${innerWidth}`);
    return { errors, tokenCount: names.length, walkedSurfaces, visibleCount: elements.length,
      canvasCount: canvasPoints.length, width, viewport: innerWidth };
}

/** No injected product CSS: compare rendered styles to a fresh browser document. */
export async function auditStyles(page: Page, surfaces: Surface[], policy: StylePolicy = { canvas: 'opaque' }): Promise<void> {
  const report = await page.evaluate(measureStyles, { names: tokens, surfaces, policy });
  counted('resolved-token checks', report.tokenCount);
  counted('surface groups', report.walkedSurfaces.length);
  counted('visible elements', report.visibleCount);
  counted('canvas probes', report.canvasCount);
  counted('overflow documents', 1);
  console.log(`[e2e style inventory] ${JSON.stringify(report)}`);
  assert.deepEqual(report.errors, [], 'Rendered style/overflow audit failed');
}
