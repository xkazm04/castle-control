import { describe, expect, it } from 'vitest';
import { buildWarTableScene, parseWarTable, WAR_TABLE_TEMPLATE } from './war-table.ts';

describe('war-table renderer-local data (simulated)', () => {
  it('lays out pointy-top axial hexes and pieces deterministically without changing input', () => {
    const data = { tiles: [{ q: 0, r: 0, side: 'simulated_north' }, { q: 1, r: -1 }],
      pieces: [{ id: 'simulated_scout', q: 1, r: -1, image_path: './assets/scout.svg' }] };
    const before = structuredClone(data);
    const scene = buildWarTableScene(data, 20);
    expect(scene).toEqual(buildWarTableScene(data, 20));
    expect(data).toEqual(before);
    expect(scene.tiles[0]?.centre).toEqual({ x: 0, y: 0 });
    expect(scene.tiles[1]?.centre.x).toBeCloseTo(10 * Math.sqrt(3));
    expect(scene.tiles[1]?.centre.y).toBe(-30);
    expect(scene.pieces[0]?.centre).toEqual(scene.tiles[1]?.centre);
    expect(scene.pieces[0]?.image_path).toBe('./assets/scout.svg');
    expect(scene.tiles[0]?.side).toBe('simulated_north');
    expect(scene.tiles[1]).not.toHaveProperty('side');
    for (const tile of scene.tiles) {
      expect(tile.corners).toHaveLength(6);
      for (const corner of tile.corners) {
        expect(Math.hypot(corner.x - tile.centre.x, corner.y - tile.centre.y)).toBeCloseTo(20);
      }
      expect(Object.isFrozen(tile.corners)).toBe(true);
    }
    expect(Object.isFrozen(scene)).toBe(true);
    expect(buildWarTableScene(WAR_TABLE_TEMPLATE, 10).tiles.length).toBeGreaterThan(0);
    expect(Object.isFrozen(WAR_TABLE_TEMPLATE.tiles[0])).toBe(true);
  });

  it('refuses an empty map, duplicate coordinates, missing piece tile and duplicate piece ids', () => {
    expect(() => buildWarTableScene({ tiles: [], pieces: [] }, 10)).toThrow(/empty/i);
    expect(() => parseWarTable({ tiles: [{ q: 0, r: 0 }, { q: 0, r: 0 }], pieces: [] }))
      .toThrow(/duplicate tile/i);
    expect(() => buildWarTableScene({ tiles: [{ q: 0, r: 0 }], pieces: [
      { id: 'simulated_piece', q: 2, r: 1 },
    ] }, 10)).toThrow(/missing tile/i);
    expect(() => parseWarTable({ tiles: [{ q: 0, r: 0 }], pieces: [
      { id: 'simulated_piece', q: 0, r: 0 }, { id: 'simulated_piece', q: 0, r: 0 },
    ] })).toThrow(/duplicate piece/i);
  });

  it('rejects invalid geometry and malformed records before rendering', () => {
    for (const size of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
      expect(() => buildWarTableScene(WAR_TABLE_TEMPLATE, size)).toThrow();
    }
    for (const q of [0.5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseWarTable({ tiles: [{ q, r: 0 }], pieces: [] })).toThrow();
    }
    for (const value of [null, [], {}, { tiles: 'map', pieces: [] }]) {
      expect(() => parseWarTable(value)).toThrow();
    }
  });

  it('denies unknown fields including Bits pricing at every record level', () => {
    for (const key of ['bits', 'cost', 'unexpected']) {
      expect(() => buildWarTableScene({ ...WAR_TABLE_TEMPLATE, [key]: 1 }, 10)).toThrow(/unknown/i);
      expect(() => parseWarTable({ tiles: [{ q: 0, r: 0, [key]: 1 }], pieces: [] }))
        .toThrow(/unknown/i);
      expect(() => parseWarTable({ tiles: [{ q: 0, r: 0 }], pieces: [
        { id: 'simulated_piece', q: 0, r: 0, [key]: 1 },
      ] })).toThrow(/unknown/i);
    }
  });

  it('permits only local relative images on both tiles and pieces', () => {
    for (const image_path of ['https://host/a.png', 'http://host/a.png', 'data:image/png,x',
      'javascript:alert(1)', '//host/a.png', '/absolute.png', '../escape.png',
      'assets/../escape.png', 'C:/asset.png', 'assets\\asset.png', '%2e%2e/a.png', '', undefined]) {
      expect(() => parseWarTable({ tiles: [{ q: 0, r: 0, image_path }], pieces: [] })).toThrow();
      expect(() => parseWarTable({ tiles: [{ q: 0, r: 0 }], pieces: [
        { id: 'simulated_piece', q: 0, r: 0, image_path },
      ] })).toThrow();
    }
    const data = parseWarTable({ tiles: [{ q: 0, r: 0, image_path: 'assets/tile.png' }], pieces: [] });
    expect(data.tiles[0]?.image_path).toBe('assets/tile.png');
  });
});
