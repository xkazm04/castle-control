import { artHooks } from './art-hooks.js';
import { hexPoints } from './shapes.js';
import type { ArtNode } from './types.js';

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
          }, paint: { fill: 'art-key' }, text: 'CHAT DUEL · TYPE 1 OR 2',
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

/**
 * The desktop Map Room is a chat duel now: two shields on pennant poles face each
 * other over a tally bar, low in the room where the Keep plaque leaves it visible,
 * under the sand-table room's window and banner rack. Same ink layers and paints.
 */
export function duelRoom(): readonly ArtNode[] {
  const window = 'M706 200 V140 Q706 110 732 110 Q758 110 758 140 V200Z';
  const numeral = (x: string, value: string): ArtNode => ({
    tag: 'text', attrs: {
      x, y: '257', 'text-anchor': 'middle', 'font-family': 'Bahnschrift,Arial Narrow,sans-serif',
      'font-weight': '700', 'font-size': '20',
    }, paint: { fill: 'art-paper' }, text: value,
  });
  return [
    {
      tag: 'g', attrs: {}, cls: ['ink-k'], children: [
        { tag: 'path', attrs: { d: window, 'stroke-width': '3' }, paint: { fill: 'none', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M732 112 V200 M706 156 H758', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '650', y: '100', width: '34', height: '54', rx: '5' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '655', y: '128', width: '24', height: '5' }, paint: { fill: 'art-azure' } },
        { tag: 'rect', attrs: { x: '655', y: '136', width: '24', height: '5' }, paint: { fill: 'art-or' } },
        { tag: 'rect', attrs: { x: '655', y: '144', width: '24', height: '5' }, paint: { fill: 'art-gules' } },
        { tag: 'path', attrs: { d: 'M452 276 H748 L738 286 H462Z', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }, paint: { fill: 'art-wood', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M486 226 V206 M714 226 V206', 'stroke-width': '2.5' }, paint: { stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M466 226 H506 V246 Q506 266 486 274 Q466 266 466 246Z', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }, paint: { fill: 'art-azure', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M694 226 H734 V246 Q734 266 714 274 Q694 266 694 246Z', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }, paint: { fill: 'art-gules', stroke: 'art-key' } },
        numeral('486', '1'), numeral('714', '2'),
        { tag: 'rect', attrs: { x: '520', y: '242', width: '160', height: '14', rx: '3', 'stroke-width': '2.5' }, paint: { fill: 'art-paper', stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '522', y: '244', width: '94', height: '10' }, paint: { fill: 'art-azure' } },
        { tag: 'rect', attrs: { x: '616', y: '244', width: '62', height: '10' }, paint: { fill: 'art-gules' } },
        { tag: 'path', attrs: { d: 'M600 238 V260 M510 249 H518 M682 249 H690', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
        {
          tag: 'text', attrs: {
            x: '440', y: '122', 'font-family': 'Bahnschrift,Arial Narrow,sans-serif',
            'font-weight': '700', 'font-size': '16', 'letter-spacing': '1.4',
          }, paint: { fill: 'art-key' }, text: 'CHAT DUEL · TYPE 1 OR 2',
        },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-a'], children: [
        { tag: 'path', attrs: { d: window, opacity: '.35' }, paint: { fill: 'art-azure' } },
        { tag: 'path', attrs: { d: 'M486 208 v-14 l12 4 l-12 4', 'stroke-width': '1' }, paint: { fill: 'art-azure', stroke: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-o'], children: [
        { tag: 'circle', attrs: { cx: '600', cy: '232', r: '4' }, paint: { fill: 'art-or', stroke: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-g'], children: [
        { tag: 'path', attrs: { d: 'M714 208 v-14 l-12 4 l12 4', 'stroke-width': '1' }, paint: { fill: 'art-gules', stroke: 'art-key' } },
      ],
    },
  ];
}
