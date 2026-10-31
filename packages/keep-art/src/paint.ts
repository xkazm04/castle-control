import type { ArtNode, ArtPaint } from './types.js';

function cssPaint(value: ArtPaint): string {
  return value === 'none' || value.startsWith('url(#') ? value : `var(--${value})`;
}

// Shared serialization order for the DOM and future React renderers.
export function paintStyle(paint: ArtNode['paint']): string {
  if (!paint) return '';
  const declarations: string[] = [];
  if (paint.fill !== undefined) declarations.push(`fill:${cssPaint(paint.fill)}`);
  if (paint.stroke !== undefined) declarations.push(`stroke:${cssPaint(paint.stroke)}`);
  if (paint.stop !== undefined) declarations.push(`stop-color:${cssPaint(paint.stop)}`);
  return declarations.join(';');
}
