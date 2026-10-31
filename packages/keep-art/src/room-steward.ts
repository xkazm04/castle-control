import type { ArtNode } from './types.js';

// Geometry and plate order from .port/winner/keep-art.js stewardRoom().
export function stewardRoom(): readonly ArtNode[] {
  return [
    {
      tag: 'g', attrs: {}, cls: ['ink-o'], children: [
        { tag: 'rect', attrs: { x: '906', y: '390', width: '88', height: '50', opacity: '.25' }, paint: { fill: 'art-or' } },
        { tag: 'path', attrs: { d: 'M1056 450 q-5 -8 0 -16 q5 8 0 16z' }, paint: { fill: 'art-or' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-k'], children: [
        { tag: 'rect', attrs: { x: '874', y: '474', width: '196', height: '12', 'stroke-width': '2.5' }, paint: { fill: 'art-wood', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M886 486 V540 M1058 486 V540', 'stroke-width': '5' }, paint: { stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '900', y: '384', width: '100', height: '62', 'stroke-width': '2', 'stroke-dasharray': '6 4' }, paint: { fill: 'none', stroke: 'art-key' } },
        {
          tag: 'text', attrs: {
            x: '950', y: '420', 'text-anchor': 'middle',
            'font-family': 'Bahnschrift,Arial Narrow,sans-serif', 'font-weight': '700',
            'font-size': '16', 'letter-spacing': '1.6',
          }, paint: { fill: 'art-key' }, text: 'DRAFT',
        },
        { tag: 'rect', attrs: { x: '920', y: '460', width: '46', height: '14', 'stroke-width': '1.5', transform: 'rotate(-4 943 467)' }, paint: { fill: 'art-sheet', stroke: 'art-key' } },
        { tag: 'path', attrs: { d: 'M1010 474 h16 v-10 h-16z' }, paint: { fill: 'art-key' } },
        { tag: 'path', attrs: { d: 'M1018 464 L1040 420', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '1052', y: '452', width: '8', height: '22', 'stroke-width': '1.5' }, paint: { fill: 'art-sheet', stroke: 'art-key' } },
        {
          tag: 'text', attrs: {
            x: '856', y: '376', 'font-family': 'Bahnschrift,Arial Narrow,sans-serif',
            'font-weight': '700', 'font-size': '16', 'letter-spacing': '1.6',
          }, paint: { fill: 'art-key' }, text: 'THE STEWARD’S STUDY',
        },
        { tag: 'path', attrs: { d: 'M1066 380 V450 M1094 380 V450 M1066 400 H1094 M1066 424 H1094', 'stroke-width': '2' }, paint: { stroke: 'art-key' } },
        { tag: 'rect', attrs: { x: '1075', y: '386', width: '5', height: '14' }, paint: { fill: 'art-key' } },
        { tag: 'rect', attrs: { x: '1070', y: '408', width: '6', height: '16' }, paint: { fill: 'art-key' } },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-g'], children: [
        { tag: 'path', attrs: { d: 'M1040 420 q8 -14 2 -26 q-12 10 -6 26z' }, paint: { fill: 'art-gules' } },
        { tag: 'rect', attrs: { x: '1069', y: '386', width: '5', height: '14' }, paint: { fill: 'art-gules' } },
        { tag: 'rect', attrs: { x: '1080', y: '406', width: '5', height: '18' }, paint: { fill: 'art-gules' } },
      ],
    },
  ];
}
