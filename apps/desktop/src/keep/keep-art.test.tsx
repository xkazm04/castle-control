import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { ArtNode } from '@castle-control/keep-art';
import type { SVGProps } from 'react';
import { artHooks, heraldSample, keepRooms } from '@castle-control/keep-art';
import { mountArt } from '@castle-control/keep-art/dom';
import { KeepArt, keepTree, reactStyle, svgAttributes } from './keep-art.jsx';

vi.mock('@castle-control/keep-art', async original => {
  const actual = await original<typeof import('@castle-control/keep-art')>();
  return { ...actual, keepArt: vi.fn(actual.keepArt), keepRoomsArt: vi.fn(actual.keepRoomsArt) };
});

function nodes(node: ArtNode): ArtNode[] { return [node, ...(node.children ?? []).flatMap(nodes)]; }

class SimulatedElement {
  readonly attrs = new Map<string, string>();
  readonly children: SimulatedElement[] = [];
  textContent: string | null = null;
  readonly ownerDocument: SimulatedDocument;
  constructor(ownerDocument: SimulatedDocument) { this.ownerDocument = ownerDocument; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  appendChild(child: SimulatedElement) { this.children.push(child); return child; }
}
class SimulatedDocument {
  readonly created: SimulatedElement[] = [];
  createElementNS() {
    const element = new SimulatedElement(this);
    this.created.push(element);
    return element;
  }
}

test('style declarations parse once after merging, with CSS precedence and custom properties', () => {
  expect(reactStyle('opacity:.4;fill:none;fill:var(--art-key);stop-color:var(--art-or);animation-delay:.5s;--dx:-8px;transform-box:view-box'))
    .toEqual({ opacity: '.4', fill: 'var(--art-key)', stopColor: 'var(--art-or)', animationDelay: '.5s', '--dx': '-8px', transformBox: 'view-box' });
  expect(reactStyle(' ;bad; :ignored;fill:;stroke:url(data:simulated);')).toEqual({ stroke: 'url(data:simulated)' });
  const node: ArtNode = { tag: 'rect', attrs: { style: 'fill:none;opacity:.5' }, paint: { fill: 'art-key' } };
  expect(renderToStaticMarkup(<KeepArt node={node} />)).toContain('style="fill:var(--art-key);opacity:.5"');
});

test('every tree attribute uses the one explicit React map or a native SVG spelling', () => {
  const native: readonly (keyof SVGProps<SVGElement>)[] = [
    'viewBox', 'xmlns', 'role', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'transform', 'opacity', 'offset', 'style',
  ];
  const accepted = new Set<string>([...native, ...Object.keys(svgAttributes)]);
  for (const node of nodes(keepTree)) for (const name of Object.keys(node.attrs)) {
    expect(accepted.has(name) || name.startsWith('aria-') || name.startsWith('data-'), name).toBe(true);
  }
  expect(svgAttributes['stroke-width']).toBe('strokeWidth');
  expect(svgAttributes['clip-path']).toBe('clipPath');
  expect(svgAttributes['stop-color']).toBe('stopColor');
});

test('React and the DOM door render the same element inventory and id set', () => {
  const document = new SimulatedDocument();
  const parent = new SimulatedElement(document);
  mountArt(parent as SimulatedElement & Element, keepTree);
  const html = renderToStaticMarkup(<KeepArt node={keepTree} />);
  expect([...html.matchAll(/<[a-zA-Z][^>]*>/g)]).toHaveLength(document.created.length);
  expect(new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])))
    .toEqual(new Set(document.created.flatMap(element => element.attrs.get('id') ?? [])));
  expect(html).toContain(`id="${artHooks.lotWheel}"`);
  expect(heraldSample).toHaveLength(4);
});

test('twenty redraws and room crops reuse the single module-built tree', async () => {
  vi.resetModules();
  const builders = await import('@castle-control/keep-art');
  const drawing = await import('./keep-art.jsx');
  const initial = renderToStaticMarkup(<drawing.KeepArt node={drawing.keepTree} />);
  for (let index = 0; index < 20; index++) {
    expect(renderToStaticMarkup(<drawing.KeepArt node={drawing.keepTree} />)).toBe(initial);
    const crop = renderToStaticMarkup(<drawing.KeepArt frame={keepRooms.lottery.frame} className="overview-room-art" />);
    expect(crop).toContain('viewBox="410 300 380 252"');
    expect(crop).toContain('class="overview-room-art"');
  }
  expect(builders.keepArt).toHaveBeenCalledOnce();
  expect(builders.keepRoomsArt).toHaveBeenCalledOnce();
});
