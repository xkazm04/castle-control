import { inkEdgeFilter } from '@castle-control/ui/stamp';

export function mountInkFilter(document: Document, parent: HTMLElement): void {
  const create = (tag: string, attributes: Readonly<Record<string, string>>): SVGElement => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const svg = create('svg', { width: '0', height: '0', 'aria-hidden': 'true', class: 'cc-inkedge-filter' });
  const defs = create('defs', {});
  const filter = create('filter', {
    id: inkEdgeFilter.id, x: inkEdgeFilter.x, y: inkEdgeFilter.y,
    width: inkEdgeFilter.width, height: inkEdgeFilter.height,
  });
  filter.append(create('feTurbulence', inkEdgeFilter.turbulence), create('feDisplacementMap', inkEdgeFilter.displacement));
  defs.append(filter);
  svg.append(defs);
  parent.append(svg);
}
