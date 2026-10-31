import { artHooks } from './art-hooks.ts';
import { hexPoints } from './shapes.ts';
import type { ArtNode } from './types.ts';

export const hexSeed = [
  0, 1, 1, 2, 0, 3, 3, 1, 2, 1, 0, 2, 2, 3, 1, 0, 3, 3, 2, 2, 0, 1, 1,
  3, 0, 0, 1, 3, 1, 1, 0, 2, 2, 3, 1, 0, 0, 3, 2, 2, 1, 0, 1, 2, 3,
] as const;
export const hexPaints = ['art-paper', 'art-azure', 'art-or', 'art-gules'] as const;

function hexes(): ArtNode {
  const radius = 10.5, dx = radius * Math.sqrt(3), dy = radius * 1.5;
  const children: ArtNode[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const index = row * 9 + col;
      const colour = hexSeed[index];
      if (colour === undefined) throw new Error('Missing hex seed colour');
      const cx = 486 + col * dx * 1.12 + (row % 2 ? dx * .56 : 0) + row * 1.6;
      const cy = 176 + row * dy * 1.1;
      children.push({
        tag: 'polygon', cls: [artHooks.hex], attrs: {
          [artHooks.hexIndexAttribute]: String(index), [artHooks.hexColourAttribute]: String(colour),
          points: hexPoints(cx, cy, radius), 'stroke-width': '1.6',
        }, paint: { fill: hexPaints[colour], stroke: 'art-key' },
      });
    }
  }
  return { tag: 'g', attrs: {}, id: artHooks.hexes, cls: [artHooks.hexes], children };
}

// Geometry and plate order from .port/winner/keep-art.js mapRoom().
export function studioRoom(): readonly ArtNode[] {
  const window = 'M706 200 V140 Q706 110 732 110 Q758 110 758 140 V200Z';
  return [
    {
      tag: 'g', attrs: {}, cls: ['ink-k'], children: [
        { tag: 'path', attrs: { d: window, 'stroke-width': '3' }, paint: { fill: 'none', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M732 112 V200 M706 156 H758', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '650', y: '100', width: '34', height: '54', rx: '5' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '655', y: '128', width: '24', height: '5' }, paint: { fill: 'art-azure' } },
        { tag: 'rect', attrs: { x: '655', y: '136', width: '24', height: '5' }, paint: { fill: 'art-or' } },
        { tag: 'rect', attrs: { x: '655', y: '144', width: '24', height: '5' }, paint: { fill: 'art-gules' } },
        { tag: 'path', attrs: { d: 'M450 252 H752 L742 262 H460Z', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }, paint: { fill: 'art-wood', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M470 262 V284 M732 262 V284', 'stroke-width': '5' }, paint: { stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M462 160 H740 L752 252 H450Z', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }, paint: { fill: 'art-table', stroke: 'art-key' } },
        hexes(),
        {
          tag: 'text', attrs: {
            x: '440', y: '122', 'font-family': 'Bahnschrift,Arial Narrow,sans-serif',
            'font-weight': '700', 'font-size': '16', 'letter-spacing': '1.4',
          }, paint: { fill: 'art-key' }, text: 'SAND TABLE · 9 × 5 HEX',
        },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-a'], children: [
        { tag: 'path', attrs: { d: window, opacity: '.35' }, paint: { fill: 'art-azure' } },
        { tag: 'path', attrs: { d: 'M650 206 v-18 l10 4 l-10 4', 'stroke-width': '1' }, paint: { fill: 'art-azure', stroke: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-o'], children: [
        { tag: 'path', attrs: { d: 'M600 226 v-18 l10 4 l-10 4', 'stroke-width': '1' }, paint: { fill: 'art-or', stroke: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-g'], children: [
        { tag: 'path', attrs: { d: 'M520 186 v-18 l10 4 l-10 4', 'stroke-width': '1' }, paint: { fill: 'art-gules', stroke: 'art-key' } },
      ],
    },
  ];
}
