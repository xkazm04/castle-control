import { artHooks } from './art-hooks.ts';
import type { ArtNode, ArtPaint } from './types.ts';

// Invented sample handles from the winner; never real viewer fixtures.
export const lotHandles = [
  'sableclerk53', 'duskowl39', 'lanternmage47', 'ironquill12', 'mossbanner08', 'emberwick77',
  'saltgrinder21', 'hollowfen90', 'cindergate44', 'tallowcat66', 'rookhollow05', 'brindlefox31',
] as const;

function wheel(): ArtNode {
  const nodes: ArtNode[] = [
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: '84' }, paint: { fill: 'art-or' } },
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: '84', opacity: '.5' }, paint: { fill: 'url(#htGu)' } },
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: '84', 'stroke-width': '7' }, paint: { fill: 'none', stroke: 'art-key' } },
    { tag: 'circle', attrs: { cx: '0', cy: '0', r: '70', 'stroke-width': '2' }, paint: { fill: 'none', stroke: 'art-key' } },
  ];
  for (let index = 0; index < 12; index += 1) {
    nodes.push({
      tag: 'path', attrs: { d: 'M0 0 L0 -70', 'stroke-width': '2.4', transform: `rotate(${index * 30})` },
      paint: { stroke: 'art-key' },
    });
  }
  for (let index = 0; index < 12; index += 1) {
    nodes.push({
      tag: 'g', attrs: { transform: `rotate(${index * 30 + 15}) translate(0 -48)` }, children: [{
        tag: 'rect', attrs: {
          x: '-13', y: '-8', width: '26', height: '16', 'stroke-width': '1.4',
          [artHooks.ticketAttribute]: String(index),
        }, paint: { fill: 'art-paper', stroke: 'art-key' },
        // Ticket numbers are texture; retain the tickets without undersized lettering.
      }],
    });
  }
  nodes.push(
    { tag: 'circle', attrs: { r: '13' }, paint: { fill: 'art-key' } },
    { tag: 'circle', attrs: { r: '5' }, paint: { fill: 'art-paper' } },
  );
  return {
    tag: 'g', attrs: { transform: 'translate(528 440)' }, children: [{
      tag: 'g', id: artHooks.lotWheel, attrs: { style: 'transform-box:view-box' }, children: nodes,
    }],
  };
}

// Geometry and plate order from .port/winner/keep-art.js lotsRoom().
export function lotsRoom(): readonly ArtNode[] {
  const key: ArtNode[] = [
    { tag: 'path', attrs: { d: 'M422 326 Q600 352 778 326', 'stroke-width': '1.6' }, paint: { fill: 'none', stroke: 'art-key' } },
  ];
  const gules: ArtNode[] = [], or: ArtNode[] = [], azure: ArtNode[] = [];
  const colours: readonly { fill: ArtPaint; plate: ArtNode[] }[] = [
    { fill: 'art-gules', plate: gules }, { fill: 'art-or', plate: or }, { fill: 'art-azure', plate: azure },
  ];
  for (let index = 0; index < 13; index += 1) {
    const t = index / 12, x = 432 + t * 336, y = 326 + Math.sin(t * Math.PI) * 24 + 2;
    const colour = colours[index % 3];
    if (!colour) throw new Error('Missing bunting colour');
    colour.plate.push({
      tag: 'path', attrs: { d: `M${x - 9} ${y - 2} L${x + 9} ${y - 1} L${x} ${y + 16}Z` },
      paint: { fill: colour.fill },
    });
  }
  key.push(
    { tag: 'path', attrs: { d: 'M470 540 L528 444 L586 540', 'stroke-width': '5', 'stroke-linejoin': 'round' }, paint: { fill: 'none', stroke: 'art-key' } },
    wheel(),
    { tag: 'path', attrs: { d: 'M528 344 L520 330 H536Z', 'stroke-width': '1.5' }, paint: { fill: 'none', stroke: 'art-key' } },
    { tag: 'path', attrs: { d: 'M528 440 L628 440', 'stroke-width': '4' }, paint: { stroke: 'art-key' } },
    { tag: 'circle', attrs: { cx: '632', cy: '440', r: '8' }, paint: { fill: 'art-key' } },
    { tag: 'rect', attrs: { x: '664', y: '500', width: '64', height: '40', 'stroke-width': '2.5' }, paint: { fill: 'art-stone', stroke: 'art-key' } },
    { tag: 'rect', attrs: { x: '656', y: '494', width: '80', height: '8' }, paint: { fill: 'art-key' } },
    { tag: 'path', attrs: { d: 'M662 424 Q656 470 680 492 H712 Q736 470 730 424Z', 'stroke-width': '2.6' }, paint: { fill: 'none', stroke: 'art-key' } },
    { tag: 'ellipse', attrs: { cx: '696', cy: '424', rx: '36', ry: '8', 'stroke-width': '2.6' }, paint: { fill: 'art-room-2', stroke: 'art-key' } },
    {
      tag: 'g', attrs: { transform: 'rotate(-14 690 414)' }, children: [{
        tag: 'rect', attrs: { x: '680', y: '398', width: '20', height: '26', 'stroke-width': '1.5' },
        paint: { fill: 'art-paper', stroke: 'art-key' },
      }],
    },
    {
      tag: 'g', attrs: { transform: 'rotate(12 708 412)' }, children: [{
        tag: 'rect', attrs: { x: '700', y: '398', width: '18', height: '24', 'stroke-width': '1.5' },
        paint: { fill: 'art-paper', stroke: 'art-key' },
      }],
    },
    { tag: 'rect', attrs: { x: '652', y: '356', width: '94', height: '52', 'stroke-width': '2' }, paint: { fill: 'art-sheet', stroke: 'art-key' } },
    { tag: 'path', attrs: { d: 'M662 370 H736 M662 380 H726 M662 390 H712', 'stroke-width': '1.4', opacity: '.7' }, paint: { stroke: 'art-key' } },
    // THE WRIT (7 units) cannot fit its plate at 16; omit this decorative label.
  );
  gules.push(
    { tag: 'path', attrs: { d: 'M528 344 L520 330 H536Z' }, paint: { fill: 'art-gules' } },
    { tag: 'path', attrs: { d: 'M662 424 Q656 470 680 492 H712 Q736 470 730 424Z' }, paint: { fill: 'art-gules' } },
    { tag: 'path', attrs: { d: 'M662 424 Q656 470 680 492 H712 Q736 470 730 424Z' }, paint: { fill: 'url(#htGu)' } },
    { tag: 'circle', attrs: { cx: '736', cy: '404', r: '10' }, paint: { fill: 'art-gules' } },
    { tag: 'path', attrs: { d: 'M730 412 l-4 14 l6 -4 l4 6 l2 -14' }, paint: { fill: 'art-gules' } },
  );
  return [
    { tag: 'g', attrs: {}, cls: ['ink-k'], children: key },
    { tag: 'g', attrs: {}, cls: ['ink-g'], children: gules },
    { tag: 'g', attrs: {}, cls: ['ink-o'], children: or },
    { tag: 'g', attrs: {}, cls: ['ink-a'], children: azure },
  ];
}
