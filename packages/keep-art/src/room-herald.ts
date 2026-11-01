import type { ArtNode, ArtPaint } from './types.js';

// Sample consensus from the winner; rounded percentages deliberately total 101.
export const heraldSample = [
  ['Go left', 37], ['Hype', 27], ['Skip the boss', 21], ['Go right', 16],
] as const;

// Geometry and plate order from .port/winner/keep-art.js heraldRoom().
export function heraldRoom(): readonly ArtNode[] {
  const key: ArtNode[] = [
    { tag: 'rect', attrs: { x: '118', y: '212', width: '226', height: '4' }, paint: { fill: 'art-key' } },
    { tag: 'circle', attrs: { cx: '118', cy: '214', r: '5' }, paint: { fill: 'art-key' } },
    { tag: 'circle', attrs: { cx: '344', cy: '214', r: '5' }, paint: { fill: 'art-key' } },
  ];
  const gules: ArtNode[] = [], azure: ArtNode[] = [], or: ArtNode[] = [];
  const pennants: readonly { x: number; fill: ArtPaint; plate: ArtNode[] }[] = [
    { x: 134, fill: 'art-gules', plate: gules },
    { x: 186, fill: 'art-azure', plate: azure },
    { x: 238, fill: 'art-or', plate: or },
    { x: 290, fill: 'art-key', plate: key },
  ];
  for (const [index, [, percentage]] of heraldSample.entries()) {
    const pennant = pennants[index];
    if (!pennant) throw new Error('Missing sample pennant');
    const { x, fill, plate } = pennant;
    const length = Math.round(percentage * 2.35);
    plate.push({
      tag: 'path', attrs: { d: `M${x} 216 h38 v${length} l-19 -12 l-19 12z` }, paint: { fill },
    });
    key.push({
      tag: 'text', attrs: {
        x: String(x + 19), y: String(216 + length + 18), 'text-anchor': 'middle',
        'font-family': 'Bahnschrift,Arial Narrow,sans-serif', 'font-weight': '700', 'font-size': '16',
      }, paint: { fill: 'art-key' }, text: String(percentage),
    });
  }
  key.push({
    tag: 'text', attrs: {
      x: '118', y: '202', 'font-family': 'Bahnschrift,Arial Narrow,sans-serif',
      'font-weight': '700', 'font-size': '16', 'letter-spacing': '1.6',
    }, paint: { fill: 'art-key' }, text: 'THE HERALD · SAMPLE',
  });
  return [
    { tag: 'g', attrs: {}, cls: ['ink-k'], children: key },
    { tag: 'g', attrs: {}, cls: ['ink-g'], children: gules },
    { tag: 'g', attrs: {}, cls: ['ink-a'], children: azure },
    { tag: 'g', attrs: {}, cls: ['ink-o'], children: or },
  ];
}
