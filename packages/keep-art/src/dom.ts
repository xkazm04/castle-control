import { paintStyle } from './paint.ts';
import type { ArtNode } from './types.ts';

function createArt(document: Document, node: ArtNode): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  const style = paintStyle(node.paint);
  if (style) {
    const existing = node.attrs['style'];
    element.setAttribute('style', existing ? `${existing};${style}` : style);
  }
  if (node.cls !== undefined) element.setAttribute('class', node.cls.join(' '));
  if (node.room !== undefined) element.setAttribute('data-room', node.room);
  if (node.id !== undefined) element.setAttribute('id', node.id);
  if (node.text !== undefined) element.textContent = node.text;
  for (const child of node.children ?? []) element.appendChild(createArt(document, child));
  return element;
}

// Construct off-tree, then attach once. The parent's document also supports iframe hosts.
export function mountArt(parent: Element, node: ArtNode): SVGElement {
  const element = createArt(parent.ownerDocument, node);
  parent.appendChild(element);
  return element;
}
