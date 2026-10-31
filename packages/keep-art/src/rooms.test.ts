import { expect, test } from 'vitest';
import {
  artHooks, beaconsRoom, gatehouseRoom, heraldRoom, heraldSample, hexPaints, hexSeed,
  keepArt, keepRoomsArt, lotHandles, lotsRoom, stewardRoom, studioRoom,
} from './index.js';
import type { ArtNode } from './types.js';

function walk(node: ArtNode): ArtNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

test('default art assembles all six rooms in winner order with a stable node count', () => {
  const allRooms = keepRoomsArt();
  expect(allRooms).toEqual([
    ...heraldRoom(), ...gatehouseRoom(), ...lotsRoom(),
    ...studioRoom(), ...beaconsRoom(), ...stewardRoom(),
  ]);
  expect(keepArt()).toEqual(keepArt(allRooms));
  expect(walk(keepArt(allRooms))).toHaveLength(415);
  expect(walk(keepArt([]))).toHaveLength(149);
  expect([
    heraldRoom(), gatehouseRoom(), lotsRoom(), studioRoom(), beaconsRoom(), stewardRoom(),
  ].map((room) => room.map((node) => node.cls))).toEqual([
    [['ink-k'], ['ink-g'], ['ink-a'], ['ink-o']],
    [['ink-k'], ['ink-a'], ['ink-g']],
    [['ink-k'], ['ink-g'], ['ink-o'], ['ink-a']],
    [['ink-k'], ['ink-a'], ['ink-o'], ['ink-g']],
    [['ink-o'], ['ink-k'], ['ink-g'], ['ink-a']],
    [['ink-o'], ['ink-k'], ['ink-g']],
  ]);
});

test('room builds are deterministic and return independent trees', () => {
  const first = keepRoomsArt().flatMap(walk);
  const second = keepRoomsArt().flatMap(walk);
  expect(first).toEqual(second);
  for (const [index, node] of first.entries()) expect(node).not.toBe(second[index]);
});

test('public wheel hook retains twelve indexed ticket rectangles and its style attribute', () => {
  expect(artHooks.lotWheel).toBe('lotWheel');
  expect(artHooks.ticketAttribute).toBe('data-tk');
  const wheels = walk(keepArt()).filter((node) => node.id === 'lotWheel');
  expect(wheels).toHaveLength(1);
  const wheel = wheels[0];
  if (!wheel) throw new Error('Missing lot wheel');
  expect(wheel.tag).toBe('g');
  expect(wheel.attrs).toEqual({ style: 'transform-box:view-box' });
  const tickets = walk(wheel).filter((node) => Object.hasOwn(node.attrs, 'data-tk'));
  expect(tickets).toHaveLength(12);
  expect(tickets.map((node) => [node.tag, node.attrs['data-tk']])).toEqual(
    Array.from({ length: 12 }, (_, index) => ['rect', String(index)]),
  );
  expect(walk(wheel).filter((node) => node.tag === 'text')).toHaveLength(0);
});

test('public hex hooks retain all forty-five seed colours, indices and role paints', () => {
  expect([artHooks.hexes, artHooks.hex, artHooks.hexIndexAttribute, artHooks.hexColourAttribute])
    .toEqual(['hexes', 'hex', 'data-i', 'data-c']);
  expect(hexSeed).toEqual([
    0, 1, 1, 2, 0, 3, 3, 1, 2, 1, 0, 2, 2, 3, 1, 0, 3, 3, 2, 2, 0, 1, 1,
    3, 0, 0, 1, 3, 1, 1, 0, 2, 2, 3, 1, 0, 0, 3, 2, 2, 1, 0, 1, 2, 3,
  ]);
  expect(hexPaints).toEqual(['art-paper', 'art-azure', 'art-or', 'art-gules']);
  const groups = walk(keepArt()).filter((node) => node.id === 'hexes');
  expect(groups).toHaveLength(1);
  expect(groups[0]?.tag).toBe('g');
  expect(groups[0]?.cls).toEqual(['hexes']);
  const hexes = walk(keepArt()).filter((node) => node.cls?.includes('hex'));
  expect(hexes).toHaveLength(45);
  expect(groups[0]?.children).toEqual(hexes);
  for (const [index, node] of hexes.entries()) {
    const colour = hexSeed[index];
    if (colour === undefined) throw new Error('Missing test seed');
    expect(node.tag).toBe('polygon');
    expect(node.attrs['data-i']).toBe(String(index));
    expect(node.attrs['data-c']).toBe(String(colour));
    expect(node.paint).toEqual({ fill: hexPaints[colour], stroke: 'art-key' });
  }
});

test('altar and ambient hooks retain their exact classes, styles and clipping ancestor', () => {
  expect([artHooks.altarFlame, artHooks.flame, artHooks.f2, artHooks.ember, artHooks.chatroll])
    .toEqual(['altarFlame', 'flame', 'f2', 'ember', 'chatroll']);
  const nodes = walk(keepArt());
  const altars = nodes.filter((node) => node.id === 'altarFlame');
  expect(altars).toHaveLength(1);
  expect(nodes.filter((node) => node.cls?.includes('altarFlame'))).toEqual(altars);
  expect(altars[0]?.tag).toBe('g');
  expect(altars[0]?.cls).toEqual(['altarFlame']);
  expect(altars[0]?.children?.map((node) => node.cls)).toEqual([['flame'], ['flame', 'f2']]);
  expect(nodes.filter((node) => node.cls?.includes('flame'))).toHaveLength(4);
  expect(nodes.filter((node) => node.cls?.includes('f2'))).toHaveLength(2);
  const embers = nodes.filter((node) => node.cls?.includes('ember'));
  expect(embers).toHaveLength(7);
  expect(embers.map((node) => node.attrs['style'])).toEqual([
    'animation-delay:0.0s;--dx:-8px', 'animation-delay:0.5s;--dx:11px',
    'animation-delay:1.0s;--dx:-14px', 'animation-delay:1.5s;--dx:17px',
    'animation-delay:2.0s;--dx:-20px', 'animation-delay:2.5s;--dx:23px',
    'animation-delay:3.0s;--dx:-26px',
  ]);
  const rolls = nodes.filter((node) => node.cls?.includes('chatroll'));
  expect(rolls).toHaveLength(1);
  expect(nodes.find((node) => node.attrs['clip-path'] === 'url(#rollClip)')?.children).toEqual(rolls);
  const ids = nodes.flatMap((node) => node.id ?? []);
  expect(new Set(ids).size).toBe(ids.length);
});

test('all art text meets the sixteen-unit floor, keeps its anchor and uses key ink', () => {
  const texts = walk(keepArt(keepRoomsArt())).filter((node) => node.tag === 'text');
  expect(texts).toHaveLength(9);
  for (const node of texts) {
    expect(Number(node.attrs['font-size'])).toBeGreaterThanOrEqual(16);
    expect(node.paint?.fill).toBe('art-key');
    expect(node.attrs['font-family']).toBe('Bahnschrift,Arial Narrow,sans-serif');
    expect(node.attrs['font-weight']).toBe('700');
  }
  expect(texts.map((node) => [node.text, node.attrs['x'], node.attrs['y'], node.attrs['text-anchor']]))
    .toEqual([
      ['37', '153', '321', 'middle'], ['27', '205', '297', 'middle'],
      ['21', '257', '283', 'middle'], ['16', '309', '272', 'middle'],
      ['THE HERALD · SAMPLE', '118', '202', undefined], ['HELD', '283', '517', 'middle'],
      ['SAND TABLE · 9 × 5 HEX', '440', '122', undefined], ['DRAFT', '950', '420', 'middle'],
      ['THE STEWARD’S STUDY', '856', '376', undefined],
    ]);
});

test('simulated gate roll has twenty-four proportional marks and the four held ticks', () => {
  const roll = walk(keepArt()).find((node) => node.cls?.includes('chatroll'));
  const marks = roll?.children?.filter((node) => node.tag === 'path') ?? [];
  const ticks = roll?.children?.filter((node) => node.tag === 'rect') ?? [];
  expect(marks).toHaveLength(24);
  expect(marks.map((node) => node.attrs['d'])).toEqual(
    [93, 81, 75, 102, 75, 60, 99, 87, 60, 45, 72, 57, 93, 81, 75, 102, 75, 60, 99, 87, 60, 45, 72, 57]
      .map((width, index) => `M232 ${400 + index * 10} h${width}`),
  );
  expect(marks.filter((node) => node.paint?.stroke === 'art-key')).toHaveLength(20);
  expect(marks.filter((node) => node.paint?.stroke === 'art-gules-text')).toHaveLength(4);
  expect(ticks.map((node) => node.attrs)).toEqual([414, 434, 534, 554].map((y) => ({
    x: '229', y: String(y), width: '2', height: '7',
  })));
  expect(ticks.every((node) => node.paint?.fill === 'art-gules')).toBe(true);
});

test('sample toy data retains the winner values and order', () => {
  expect(lotHandles).toEqual([
    'sableclerk53', 'duskowl39', 'lanternmage47', 'ironquill12', 'mossbanner08', 'emberwick77',
    'saltgrinder21', 'hollowfen90', 'cindergate44', 'tallowcat66', 'rookhollow05', 'brindlefox31',
  ]);
  expect(heraldSample).toEqual([['Go left', 37], ['Hype', 27], ['Skip the boss', 21], ['Go right', 16]]);
});
