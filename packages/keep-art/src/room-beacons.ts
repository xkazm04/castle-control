import { artHooks } from './art-hooks.js';
import type { ArtNode } from './types.js';

// Path formulas from .port/winner/keep-art.js flame(), including numeric formatting.
export function flame(cx: number, base: number, h: number, w: number): readonly ArtNode[] {
  return [
    {
      tag: 'path', cls: [artHooks.flame], attrs: {
        d: `M${cx} ${base} C ${cx - w} ${base - h * .2}, ${cx - w * .9} ${base - h * .6}, ${cx - w * .2} ${base - h} C ${cx - w * .1} ${base - h * .7}, ${cx + w * .3} ${base - h * .75}, ${cx + w * .3} ${base - h * .95} C ${cx + w} ${base - h * .55}, ${cx + w * .9} ${base - h * .2}, ${cx} ${base}Z`,
      }, paint: { fill: 'art-or' },
    },
    {
      tag: 'path', cls: [artHooks.flame, artHooks.f2], attrs: {
        d: `M${cx} ${base} C ${cx - w * .55} ${base - h * .15}, ${cx - w * .45} ${base - h * .45}, ${cx} ${base - h * .68} C ${cx + w * .45} ${base - h * .45}, ${cx + w * .55} ${base - h * .15}, ${cx} ${base}Z`,
      }, paint: { fill: 'art-gules' },
    },
  ];
}

// Geometry and plate order from .port/winner/keep-art.js beaconsRoom().
export function beaconsRoom(): readonly ArtNode[] {
  const or: ArtNode[] = [
    { tag: 'circle', attrs: { cx: '970', cy: '70', r: '90' }, paint: { fill: 'url(#warm)' } },
    { tag: 'circle', attrs: { cx: '970', cy: '64', r: '64', opacity: '.7' }, paint: { fill: 'url(#htOrS)' } },
    { tag: 'g', attrs: {}, children: flame(970, 98, 86, 30) },
  ];
  for (let index = 0; index < 7; index += 1) {
    or.push({
      tag: 'circle', cls: [artHooks.ember], attrs: {
        cx: String(952 + index * 6), cy: '40', r: String(1.6 + (index % 3) * .6),
        style: `animation-delay:${(index * .5).toFixed(1)}s;--dx:${(index % 2 ? 1 : -1) * (8 + index * 3)}px`,
      }, paint: { fill: index % 2 ? 'art-or' : 'art-gules' },
    });
  }
  or.push(
    { tag: 'circle', attrs: { cx: '970', cy: '268', r: '70' }, paint: { fill: 'url(#warm)' } },
    { tag: 'g', attrs: {}, id: artHooks.altarFlame, cls: [artHooks.altarFlame], children: flame(970, 290, 64, 24) },
    { tag: 'rect', attrs: { x: '856', y: '186', width: '66', height: '52', 'stroke-width': '7' }, paint: { fill: 'none', stroke: 'art-or' } },
    { tag: 'path', attrs: { d: 'M1022 234 L1036 214 L1046 226 L1058 206 L1080 234Z' }, paint: { fill: 'art-or' } },
  );
  return [
    { tag: 'g', attrs: {}, cls: ['ink-o'], children: or },
    {
      tag: 'g', attrs: {}, cls: ['ink-k'], children: [
        { tag: 'path', attrs: { d: 'M940 98 H1000 L990 116 H950Z' }, paint: { fill: 'art-key' } },
        { tag: 'path', attrs: { d: 'M962 116 V138 M978 116 V138', 'stroke-width': '4' }, paint: { stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M934 290 H1006 L994 308 H946Z' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '954', y: '308', width: '32', height: '18' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '852.5', y: '182.5', width: '73', height: '59', 'stroke-width': '1.6' }, paint: { fill: 'none', stroke: 'art-key' } },
        { tag: 'circle', attrs: { cx: '889', cy: '206', r: '8' }, paint: { fill: 'art-key' } },
        { tag: 'path', attrs: { d: 'M873 234 Q889 214 905 234Z' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '1018', y: '186', width: '66', height: '52', 'stroke-width': '2' }, paint: { fill: 'art-paper', stroke: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-g'], children: [{
        tag: 'rect', attrs: {
          x: '1018', y: '186', width: '66', height: '52', 'stroke-width': '2',
          'stroke-dasharray': '5 4', transform: 'translate(4 4)',
        }, paint: { fill: 'none', stroke: 'art-gules' },
      }],
    },
    { tag: 'g', attrs: {}, cls: ['ink-a'], children: [] },
  ];
}
