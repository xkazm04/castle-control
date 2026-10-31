import { keepRooms } from './geometry.ts';
import type { Rect, RoomId } from './geometry.ts';
import { merlons, rectAttrs, wavy } from './shapes.ts';
import type { ArtNode, ArtPaint } from './types.ts';

export { defs } from './art-defs.ts';

function rect(rect: Rect, fill: ArtPaint): ArtNode {
  return { tag: 'rect', attrs: rectAttrs(rect), paint: { fill } };
}

function stoneBlock(bounds: Rect): readonly ArtNode[] {
  return [rect(bounds, 'art-stone'), rect(bounds, 'url(#htStone)'), rect(bounds, 'url(#htStone2)')];
}

function roomFloor(bounds: Rect): readonly ArtNode[] {
  const floor = { x: bounds.x, y: bounds.y + bounds.h - 14, w: bounds.w, h: 14 };
  return [rect(floor, 'art-floor'), rect(floor, 'url(#boards)')];
}

// Paths, geometry and plate order extracted from .port/winner/keep-art.js.
export function sky(): readonly ArtNode[] {
  return [
    {
      tag: 'g', attrs: {}, cls: ['ink-o'], children: [
        { tag: 'circle', attrs: { cx: '985', cy: '150', r: '250' }, paint: { fill: 'url(#sun)' } },
        {
          tag: 'circle', attrs: { cx: '985', cy: '150', r: '128', opacity: '.55' },
          paint: { fill: 'url(#htOr)' },
        },
      ],
    },
    {
      tag: 'g', attrs: {}, cls: ['ink-a'], children: [
        {
          tag: 'path', attrs: {
            d: 'M-120 520 C 60 430, 170 470, 300 440 S 560 400, 700 450 S 960 410, 1100 440 S 1280 430, 1340 470 V560 H-120Z',
          }, paint: { fill: 'url(#htAzL)' },
        },
        {
          tag: 'g', attrs: {}, cls: ['cloud'], children: [
            {
              tag: 'ellipse', attrs: { cx: '190', cy: '80', rx: '120', ry: '26' },
              paint: { fill: 'url(#htAzL)' },
            },
            {
              tag: 'ellipse', attrs: { cx: '250', cy: '66', rx: '70', ry: '22' },
              paint: { fill: 'url(#htAzL)' },
            },
          ],
        },
        {
          tag: 'g', attrs: {}, cls: ['cloud', 'c2'], children: [
            {
              tag: 'ellipse', attrs: { cx: '1110', cy: '300', rx: '110', ry: '20' },
              paint: { fill: 'url(#htAzL)' },
            },
            {
              tag: 'ellipse', attrs: { cx: '1060', cy: '288', rx: '56', ry: '16' },
              paint: { fill: 'url(#htAzL)' },
            },
          ],
        },
        {
          tag: 'g', attrs: {}, cls: ['cloud'], children: [{
            tag: 'ellipse', attrs: { cx: '640', cy: '20', rx: '90', ry: '14' },
            paint: { fill: 'url(#htAzL)' },
          }],
        },
      ],
    },
  ];
}

export function structure(): readonly ArtNode[] {
  const floorOrder: readonly RoomId[] = ['lottery', 'moderator', 'visuals', 'herald', 'steward', 'studio'];
  const outlineOrder: readonly RoomId[] = ['studio', 'lottery', 'visuals', 'steward', 'herald'];
  const roof = 'M64 162 L230 34 L396 162Z';
  const key: ArtNode[] = [
    ...stoneBlock({ x: 80, y: 160, w: 300, h: 400 }),
    ...stoneBlock({ x: 398, y: 70, w: 404, h: 490 }),
    ...stoneBlock({ x: 820, y: 140, w: 300, h: 420 }),
    {
      tag: 'g', attrs: {}, paint: { fill: 'art-key' }, children: [
        ...merlons(398, 802, 46, 24, 30, 16), ...merlons(820, 1120, 116, 24, 26, 14.8),
      ],
    },
    rect({ x: 398, y: 68, w: 404, h: 4 }, 'art-key'),
    rect({ x: 820, y: 138, w: 300, h: 4 }, 'art-key'),
    ...Object.values(keepRooms).flatMap(({ rect: bounds }) => [
      rect(bounds, 'url(#roomLight)'), rect(bounds, 'url(#courses)'),
    ]),
    ...floorOrder.flatMap((id) => roomFloor(keepRooms[id].rect)),
    { tag: 'path', attrs: { d: 'M80 540 V452 Q98 426 116 452 V540Z' }, paint: { fill: 'art-void' } },
    {
      tag: 'g', attrs: { 'stroke-width': '3.5', 'stroke-linejoin': 'round' },
      paint: { fill: 'none', stroke: 'art-key' }, children: [
        {
          tag: 'path', attrs: {
            d: 'M80 560 V452 Q98 426 116 452 V540 H358 V360 H116 V340 H358 V180 H102 V340 H116 V360 H102',
          },
        },
        { tag: 'rect', attrs: rectAttrs({ x: 80, y: 160, w: 300, h: 400 }) },
        { tag: 'rect', attrs: rectAttrs({ x: 398, y: 70, w: 404, h: 490 }) },
        { tag: 'rect', attrs: rectAttrs({ x: 820, y: 140, w: 300, h: 420 }) },
      ],
    },
    {
      tag: 'g', attrs: { 'stroke-width': '2.5' }, paint: { fill: 'none', stroke: 'art-key' },
      children: outlineOrder.map((id) => ({ tag: 'rect', attrs: rectAttrs(keepRooms[id].rect) })),
    },
    {
      tag: 'path', attrs: { d: roof, 'stroke-width': '3.5', 'stroke-linejoin': 'round' },
      paint: { fill: 'none', stroke: 'art-key' },
    },
    { tag: 'path', attrs: { d: 'M230 34 V4', 'stroke-width': '3' }, paint: { stroke: 'art-key' } },
    { tag: 'path', attrs: { d: 'M600 46 V-14', 'stroke-width': '3' }, paint: { stroke: 'art-key' } },
    rect({ x: -200, y: 558, w: 1600, h: 6 }, 'art-key'),
    { tag: 'path', attrs: { d: 'M-200 564 H1400 V574 H-200Z' }, paint: { fill: 'url(#htStone)' } },
    {
      tag: 'path',
      attrs: { d: 'M80 556 L8 574 L8 584 L80 566Z', 'stroke-width': '3', 'stroke-linejoin': 'round' },
      paint: { fill: 'art-wood', stroke: 'art-key' },
    },
    {
      tag: 'path', attrs: { d: 'M86 448 L12 574', 'stroke-width': '2', 'stroke-dasharray': '4 3' },
      paint: { stroke: 'art-key' },
    },
  ];
  const azure: ArtNode[] = [
    { tag: 'path', attrs: { d: roof }, paint: { fill: 'art-azure' } },
    { tag: 'path', attrs: { d: roof, opacity: '.5' }, paint: { fill: 'url(#htGu)' } },
    {
      tag: 'path', attrs: { d: 'M150 162 L230 34 M310 162 L230 34', 'stroke-width': '2', opacity: '.6' },
      paint: { stroke: 'art-azure-text' },
    },
    { tag: 'path', attrs: { d: 'M440 76 h26 v18 l-13 -6 l-13 6z' }, paint: { fill: 'art-azure' } },
    { tag: 'path', attrs: { d: 'M734 76 h26 v18 l-13 -6 l-13 6z' }, paint: { fill: 'art-azure' } },
    {
      tag: 'rect', attrs: { ...rectAttrs({ x: -200, y: 574, w: 1600, h: 66 }), opacity: '.7' },
      paint: { fill: 'url(#htAz)' },
    },
    {
      tag: 'g', attrs: { 'stroke-width': '3' }, cls: ['wave'],
      paint: { stroke: 'art-azure', fill: 'none' }, children: [
        { tag: 'path', attrs: { d: wavy(-200, 1440, 592, 8, 40) } },
        { tag: 'path', attrs: { d: wavy(-180, 1440, 612, 8, 40), opacity: '.7' } },
        { tag: 'path', attrs: { d: wavy(-200, 1440, 630, 8, 40), opacity: '.45' } },
      ],
    },
  ];
  const gules: ArtNode[] = [
    { tag: 'path', attrs: { d: 'M232 6 L286 14 L270 22 L288 30 L232 30Z' }, paint: { fill: 'art-gules' } },
    {
      tag: 'path', attrs: {
        d: 'M602 -12 C 630 -20, 650 -4, 682 -12 L 672 4 L 684 18 C 652 26, 632 10, 602 18Z',
      }, paint: { fill: 'art-gules' },
    },
  ];
  return [
    {
      tag: 'g', attrs: { opacity: '.45' }, cls: ['ink-g'], children: [{
        tag: 'path', attrs: {
          d: 'M88 170 L238 44 L404 170 V172 H406 V80 H810 V150 H1128 V572 H88Z',
          transform: 'translate(10 6)',
        }, paint: { fill: 'url(#htShadow)' },
      }],
    },
    { tag: 'g', attrs: {}, cls: ['ink-k'], children: key },
    { tag: 'g', attrs: {}, cls: ['ink-a'], children: azure },
    { tag: 'g', attrs: {}, cls: ['ink-g'], children: gules },
    { tag: 'g', attrs: {}, cls: ['ink-o'], children: [] },
  ];
}

export function overlays(): readonly ArtNode[] {
  return Object.entries(keepRooms).flatMap(([id, { rect: bounds }]): ArtNode[] => {
    const room = id as RoomId;
    return [
      { tag: 'rect', attrs: rectAttrs(bounds), cls: ['litglow'], room, paint: { fill: 'url(#warm)' } },
      { tag: 'rect', attrs: rectAttrs(bounds), cls: ['dim'], room },
    ];
  });
}
