import { expect, test } from 'vitest';
import { keepArt } from './art.js';
import { mountArt } from './dom.js';
import { paintStyle } from './paint.js';
import type { ArtNode } from './types.js';

// A minimal, dependency-free document; only mountArt's DOM operations are implemented.
class FakeElement {
  readonly attrs = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly ownerDocument: FakeDocument;
  readonly namespace: string;
  readonly tag: string;
  textContent: string | null = null;

  constructor(ownerDocument: FakeDocument, namespace: string, tag: string) {
    this.ownerDocument = ownerDocument;
    this.namespace = namespace;
    this.tag = tag;
  }

  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
  appendChild(child: FakeElement): FakeElement { this.children.push(child); return child; }
}

class FakeDocument {
  readonly created: FakeElement[] = [];

  createElementNS(namespace: string, tag: string): FakeElement {
    const element = new FakeElement(this, namespace, tag);
    this.created.push(element);
    return element;
  }
}

function walk(node: ArtNode): ArtNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

test('paintStyle serializes roles, URL paints and none in one stable order', () => {
  expect(paintStyle(undefined)).toBe('');
  expect(paintStyle({})).toBe('');
  expect(paintStyle({ stroke: 'none', fill: 'art-key', stop: 'art-or' }))
    .toBe('fill:var(--art-key);stroke:none;stop-color:var(--art-or)');
  expect(paintStyle({ fill: 'url(#warm)', stroke: 'art-azure' }))
    .toBe('fill:url(#warm);stroke:var(--art-azure)');
});

test('mountArt attaches one tree with identical element count, ids, attributes and styles', () => {
  const document = new FakeDocument();
  const parent = new FakeElement(document, 'simulated-host', 'section');
  const room: ArtNode = {
    tag: 'g', attrs: { transform: 'translate(2 3)' }, room: 'lottery', id: 'simulated-room',
    children: [{
      tag: 'text', attrs: { x: '0', y: '16', style: 'opacity:.5' },
      cls: ['simulated-label'], paint: { fill: 'art-key', stroke: 'none' }, text: '<SIMULATED & SAMPLE>',
    }],
  };
  const tree = keepArt([room]);
  // One narrow assertion adapts the fake host; production DOM types stay in dom.ts.
  const mounted = mountArt(parent as FakeElement & Parameters<typeof mountArt>[0], tree);
  expect(parent.children).toHaveLength(1);
  expect(mounted).toBe(parent.children[0]);
  const nodes = walk(tree);
  expect(document.created).toHaveLength(nodes.length);
  expect(document.created.flatMap((element) => element.attrs.get('id') ?? [])).toEqual(
    nodes.flatMap((node) => node.id ?? []),
  );
  for (const [index, node] of nodes.entries()) {
    const element = document.created[index];
    expect(element?.namespace).toBe('http://www.w3.org/2000/svg');
    expect(element?.tag).toBe(node.tag);
    const attrs: Record<string, string> = { ...node.attrs };
    const paint = paintStyle(node.paint);
    if (paint) attrs['style'] = attrs['style'] ? `${attrs['style']};${paint}` : paint;
    if (node.cls !== undefined) attrs['class'] = node.cls.join(' ');
    if (node.id !== undefined) attrs['id'] = node.id;
    if (node.room !== undefined) attrs['data-room'] = node.room;
    expect(Object.fromEntries(element?.attrs ?? [])).toEqual(attrs);
    expect(element?.textContent).toBe(node.text ?? null);
  }
  expect(document.created.find((element) => element.tag === 'text')?.attrs.get('style'))
    .toBe('opacity:.5;fill:var(--art-key);stroke:none');
  expect(document.created.find((element) => element.tag === 'text')?.textContent)
    .toBe('<SIMULATED & SAMPLE>');
});
