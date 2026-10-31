import type { Rect } from './geometry.ts';
import type { ArtNode } from './types.ts';

export function rectAttrs(rect: Rect): Readonly<Record<string, string>> {
  return { x: String(rect.x), y: String(rect.y), width: String(rect.w), height: String(rect.h) };
}

export function hexPoints(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 180 * (60 * index - 30);
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

export function merlons(
  x0: number, x1: number, y: number, h: number, w: number, gap: number,
): readonly ArtNode[] {
  const nodes: ArtNode[] = [];
  for (let x = x0; x + w <= x1 + 0.1; x += w + gap) {
    nodes.push({ tag: 'rect', attrs: rectAttrs({ x, y, w, h }) });
  }
  return nodes;
}

export function wavy(x0: number, x1: number, y: number, amp: number, len: number): string {
  let d = `M${x0},${y}`;
  for (let x = x0; x < x1; x += len) {
    d += ` q${len / 4},${-amp} ${len / 2},0 t${len / 2},0`;
  }
  return d;
}
