import { artHooks } from './art-hooks.js';
import type { ArtNode } from './types.js';

// Invented, simulated sample chat from the winner, used only to size ruled marks.
const sampleLines = [
  ['viewer_01  that stamp was clean', false], ['viewer_02  which door next?', false],
  ['viewer_03  CAPS CAPS CAPS', true], ['viewer_04  what is the ledger for?', false],
  ['viewer_05  [link removed]', true], ['viewer_06  left door', false],
  ['viewer_07  when is the next draw?', false], ['viewer_08  good luck everyone', false],
  ['viewer_09  go left!!', false], ['viewer_10  hype', false],
  ['viewer_11  skip the boss', false], ['viewer_12  go right', false],
] as const;

function rollMarks(): readonly ArtNode[] {
  return [...sampleLines, ...sampleLines].flatMap(([text, held], index): ArtNode[] => {
    const y = 400 + index * 10;
    const mark: ArtNode = {
      tag: 'path', attrs: { d: `M232 ${y} h${text.length * 3}`, 'stroke-width': '1' },
      paint: { stroke: held ? 'art-gules-text' : 'art-key' },
    };
    return held ? [mark, {
      tag: 'rect', attrs: { x: '229', y: String(y - 6), width: '2', height: '7' },
      paint: { fill: 'art-gules' },
    }] : [mark];
  });
}

// Geometry and plate order from .port/winner/keep-art.js gateRoom().
export function gatehouseRoom(): readonly ArtNode[] {
  const key: ArtNode[] = [
    {
      tag: 'path', attrs: {
        d: 'M128 540 V420 Q128 384 172 384 Q216 384 216 420 V540', 'stroke-width': '3',
      }, paint: { fill: 'none', stroke: 'art-key' },
    },
    {
      tag: 'g', attrs: { 'stroke-width': '3' }, paint: { stroke: 'art-paper' }, children: [
        ...[146, 164, 182, 200].map((x): ArtNode => ({ tag: 'path', attrs: { d: `M${x} 392 V532` } })),
        { tag: 'path', attrs: { d: 'M130 432 H214 M130 468 H214 M130 504 H214' } },
      ],
    },
    {
      tag: 'rect', attrs: { x: '222', y: '374', width: '120', height: '118', 'stroke-width': '2.5' },
      paint: { fill: 'art-sheet', stroke: 'art-key' },
    },
    // The 7.5-unit heading cannot fit at 16; the surrounding UI supplies SAMPLE.
    {
      tag: 'g', attrs: { 'clip-path': 'url(#rollClip)' }, children: [{
        tag: 'g', attrs: {}, cls: [artHooks.chatroll], children: rollMarks(),
      }],
    },
    {
      tag: 'path', attrs: { d: 'M236 540 L246 530 H318 L328 540', 'stroke-width': '2' },
      paint: { fill: 'none', stroke: 'art-key' },
    },
    { tag: 'path', attrs: { d: 'M300 360 V372', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
  ];
  const bars: ArtNode[] = [];
  for (let x = 84; x <= 112; x += 7) {
    bars.push({ tag: 'path', attrs: { d: `M${x} 438 V520 l-2 7 l-2 -7` } });
  }
  return [
    { tag: 'g', attrs: {}, cls: ['ink-k'], children: key },
    {
      tag: 'g', attrs: {}, cls: ['ink-a'], children: [
        {
          tag: 'g', attrs: { 'stroke-width': '3.2' },
          paint: { stroke: 'art-azure', fill: 'art-azure' }, children: [
            ...bars,
            { tag: 'path', attrs: { d: 'M80 462 H116 M80 486 H116 M80 508 H116' }, paint: { fill: 'none' } },
          ],
        },
        { tag: 'path', attrs: { d: 'M128 540 V420 Q128 384 172 384 Q216 384 216 420 V540Z' }, paint: { fill: 'art-azure' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-g'], children: [{
        tag: 'g', attrs: { transform: 'rotate(-6 282 512)' }, children: [
          {
            tag: 'rect', attrs: { x: '248', y: '502', width: '70', height: '20', 'stroke-width': '2.5' },
            paint: { fill: 'none', stroke: 'art-gules' },
          },
          {
            tag: 'text', attrs: {
              x: '283', y: '517', 'text-anchor': 'middle',
              'font-family': 'Bahnschrift,Arial Narrow,sans-serif', 'font-weight': '700',
              'font-size': '16', 'letter-spacing': '1.5',
            }, paint: { fill: 'art-key' }, text: 'HELD',
          },
        ],
      }],
    },
  ];
}
