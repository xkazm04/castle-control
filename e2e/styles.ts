import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { counted, tokens } from './inventory.ts';

export type Surface = { name: string; selector: string };
export const desktopSurfaces: Surface[] = [
  { name: 'frame', selector: '.cc-frame' },
  { name: 'rampart', selector: '.cc-rampart' },
  // The current shell exposes chamber navigation as a keep, strip or locator.
  { name: 'chamber navigation', selector: '.cc-chambers, .cc-chamber-strip, .cc-room-locator, .keep-cross-section' },
  { name: 'room body', selector: '.keep-home, .overview-workspace, .shell-room' },
];

/** No injected product CSS: compare rendered styles to a fresh browser document. */
export async function auditStyles(page: Page, surfaces: Surface[]): Promise<void> {
  const report = await page.evaluate(({ names, surfaces }) => {
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
    const transparent = (color: string) => color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
    const effectiveBackground = (element: Element): string => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const background = getComputedStyle(current).backgroundColor;
        if (!transparent(background)) return background;
      }
      return 'rgb(255, 255, 255)'; // The browser canvas under transparent html/body.
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
  }, { names: tokens, surfaces });
  counted('resolved-token checks', report.tokenCount);
  counted('surface groups', report.walkedSurfaces.length);
  counted('visible elements', report.visibleCount);
  counted('canvas probes', report.canvasCount);
  counted('overflow documents', 1);
  console.log(`[e2e style inventory] ${JSON.stringify(report)}`);
  assert.deepEqual(report.errors, [], 'Rendered style/overflow audit failed');
}
