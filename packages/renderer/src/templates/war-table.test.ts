import { describe, expect, it } from 'vitest';
import { buildWarTableScene, parseWarTable, WAR_TABLE_TEMPLATE } from './war-table.ts';
import * as warTable from './war-table.ts';

it('renders a transparent fitted map at panel and video sizes with safe selected feedback', () => {
  expect(typeof warTable.renderWarTableSvg).toBe('function');
  for (const [width, height] of [[318, 318], [1920, 1080], [1280, 720]] as const) {
    const markup = warTable.renderWarTableSvg(WAR_TABLE_TEMPLATE, { width, height, selected: { q: 1, r: 0 } });
    expect(markup).toContain(`width="${width}" height="${height}"`);
    expect(markup).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(markup).toContain('background:transparent');
    expect(markup.match(/data-tile=/g)).toHaveLength(7);
    expect(markup.match(/data-piece=/g)).toHaveLength(2);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain('SIMULATED');
    expect(markup).not.toMatch(/<rect|<script|<image|foreignObject|NaN|Infinity/);
  }
});

it('fits every polygon and piece inside all requested viewports and honours corner anchoring', () => {
  for (const [width, height] of [[318, 318], [1920, 1080], [1280, 720]] as const) {
    for (const anchor of ['top_left', 'centre', 'bottom_right'] as const) {
      const layout = warTable.layoutWarTableOutput(WAR_TABLE_TEMPLATE, { width, height, anchor });
      for (const point of [...layout.tiles.flatMap(tile => tile.corners), ...layout.pieces.map(piece => piece.centre)]) {
        expect(point.x).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(point.x).toBeLessThanOrEqual(width - 12 + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(point.y).toBeLessThanOrEqual(height - 12 + 1e-6);
      }
      if (anchor === 'top_left') expect(Math.min(...layout.tiles.flatMap(tile => tile.corners.map(p => p.x)))).toBeCloseTo(12);
      if (anchor === 'bottom_right') expect(Math.max(...layout.tiles.flatMap(tile => tile.corners.map(p => p.x)))).toBeCloseTo(width - 12);
    }
  }
  expect(warTable.renderWarTableSvg(WAR_TABLE_TEMPLATE))
    .toBe(warTable.renderWarTableSvg(WAR_TABLE_TEMPLATE, { width: 318, height: 318, anchor: 'centre' }));
});

it('refuses malformed output options and escapes map labels without executing or fetching them', () => {
  for (const options of [{ width: 0 }, { height: Infinity }, { width: 1.5 }, { width: 16385 },
    { anchor: 'elsewhere' }, { selected: { q: .5, r: 0 } }, { script: 'no' }]) {
    expect(() => warTable.renderWarTableSvg(WAR_TABLE_TEMPLATE, options)).toThrow();
  }
  const markup = warTable.renderWarTableSvg({ tiles: [{ q: 0, r: 0, side: '<script>' }],
    pieces: [{ id: '" scout', q: 0, r: 0 }] });
  expect(markup).toContain('&lt;script&gt;');
  expect(markup).toContain('&quot; scout');
  expect(markup).not.toContain('<script>');
});

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
