import { expect, test } from 'vitest';
import { boardGeometry, parseStudioBoard } from './board.js';
import { STUDIO_SAMPLE_BOARD, fixtureTiles } from './fixture.js';

function grid(columns: number, rows: number) {
  return { title: 'Test map', sides: [{ id: 'north', label: 'Northern lights', short: 'N', ink: 'azure' }],
    tiles: Array.from({ length: columns * rows }, (_, index) => {
      const row = Math.floor(index / columns);
      return { q: index % columns - Math.floor(row / 2), r: row, side: 'north' };
    }) };
}

test('sample board preserves all original display ids, territories and counts in a frozen snapshot', () => {
  const result = parseStudioBoard(STUDIO_SAMPLE_BOARD);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  const geometry = boardGeometry(result.board);
  expect(geometry.tiles).toHaveLength(54);
  const rows = ['QQQQ.TTTT', 'QQQQ.TTTT', 'QQQ...TTT', 'QQ.SSS.TT', 'Q.SSSSS.T', '.SSSSSSS.'];
  const owners: Readonly<Record<string, string>> = { Q: 'House Quill', T: 'House Tallow', S: 'House Sable' };
  const expected = rows.flatMap((row, r) => Array.from(row, (mark, column) => ({
    id: `${String.fromCharCode(65 + column)}${r + 1}`, column, row: r,
    ...(owners[mark] ? { owner: owners[mark] } : {}),
  })));
  expect(fixtureTiles).toEqual(expected);
  expect(geometry.tiles.map(tile => ({ id: tile.id, column: tile.column, row: tile.row,
    ...(tile.side ? { owner: tile.side.label } : {}) }))).toEqual(expected);
  expect(geometry.sides.map(side => side.count)).toEqual([14, 14, 15]);
  expect(geometry.unclaimed).toBe(11);
  for (const value of [result.board, result.board.sides, result.board.tiles,
    ...result.board.sides, ...result.board.tiles]) expect(Object.isFrozen(value)).toBe(true);
});

test('closed board door refuses invalid data without ever returning a partial board', () => {
  const valid = grid(3, 2);
  const invalid: unknown[] = [
    { ...valid, tiles: [...valid.tiles, valid.tiles[0]] },
    { ...valid, tiles: [{ q: 0, r: 0, side: 'unknown' }] },
    { ...valid, colour: '#f00' },
    { ...valid, sides: [{ ...valid.sides[0], ink: '#ff0000' }] },
    { ...valid, sides: [{ ...valid.sides[0], ink: 'vert' }] },
    { ...valid, tiles: [] }, { ...valid, sides: [...valid.sides, valid.sides[0]] },
    grid(201, 1), { ...valid, title: ' ' },
    ...['label', 'short', 'id'].map(key => ({ ...valid, sides: [{ ...valid.sides[0], [key]: ' ' }] })),
    { ...valid, tiles: [{ q: .5, r: 0 }] }, { ...valid, tiles: [{ q: Infinity, r: 0 }] },
    { ...valid, tiles: [{ q: 0, r: 0, side: undefined }] },
    { ...valid, tiles: [{ q: 0, r: 0, colour: '#f00' }] },
    { ...valid, sides: [{ ...valid.sides[0], colour: '#f00' }] },
    { ...valid, tiles: Array.from({ length: 2 }) },
    { ...valid, sides: Array.from({ length: 2 }) }, undefined, null, [],
  ];
  for (const value of invalid) {
    const result = parseStudioBoard(value);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('board');
    if (!result.ok) expect(result.error.code).toBe('invalid_board');
  }
});

test('geometry uses axial pointy-top centres and full hex extents, including corrected 3 by 2 case', () => {
  for (const [input, width, height] of [[STUDIO_SAMPLE_BOARD, 9.5, 9.5], [grid(3, 2), 3.5, 3.5]] as const) {
    const result = parseStudioBoard(input);
    if (!result.ok) throw new Error(result.error.message);
    const geometry = boardGeometry(result.board);
    expect(geometry.width).toBe(width); expect(geometry.height).toBe(height);
    for (const tile of geometry.tiles) {
      expect(tile.centre.x).toBeGreaterThanOrEqual(.5);
      expect(tile.centre.x).toBeLessThanOrEqual(width - .5);
      expect(tile.centre.y).toBeGreaterThanOrEqual(1);
      expect(tile.centre.y).toBeLessThanOrEqual(height - 1);
    }
  }
  const sample = boardGeometry(STUDIO_SAMPLE_BOARD);
  // Preserve today's conservative container fit as derived rounding, not fixed grid dimensions.
  expect(sample.fit_width).toBe(16.46); expect(sample.fit_height).toBe(9.52);
  expect(sample.tiles.find(tile => tile.id === 'D4')).toMatchObject({ column: 3, column_label: 'D', row: 3 });
});

test('all four inks are accepted; input is copied, omitted side stays absent, and signed sparse maps normalise', () => {
  for (const ink of ['gules', 'or', 'azure', 'key']) {
    const input = { title: 'Sparse map', sides: [{ id: 'side', label: 'Any name', short: 'X', ink }],
      tiles: [{ q: -3, r: -3, side: 'side' }, { q: -1, r: -1 }] };
    const result = parseStudioBoard(input);
    if (!result.ok) throw new Error(result.error.message);
    input.sides[0]!.label = 'Changed input';
    expect(result.board.sides[0]?.label).toBe('Any name');
    expect(result.board.tiles[1]).not.toHaveProperty('side');
    const geometry = boardGeometry(result.board);
    expect(geometry.tiles.map(tile => tile.id)).toEqual(['A1', 'D3']);
    expect(geometry.columns).toBe(4); expect(geometry.rows).toBe(3);
    expect(geometry.sides[0]?.count).toBe(1); expect(geometry.unclaimed).toBe(1);
  }
});

test('sample fit and every tile rectangle equal the original C board at both limiting axes', () => {
  const geometry = boardGeometry(STUDIO_SAMPLE_BOARD);
  for (const [container_width, container_height] of [[720, 520], [660, 600], [300, 240]] as const) {
    const old_radius = Math.min((container_width - 6) / 16.46, (container_height - 6) / 9.52);
    const radius = Math.min((container_width - 6) / geometry.fit_width, (container_height - 6) / geometry.fit_height);
    expect(radius).toBe(old_radius);
    const hex_width = radius * 1.7320508;
    expect(geometry.width * hex_width).toBe(9.5 * hex_width);
    expect(geometry.height * radius).toBe(9.5 * radius);
    for (const tile of geometry.tiles) {
      expect((tile.centre.x - .5) * hex_width).toBe((tile.column + tile.row % 2 * .5) * hex_width);
      expect((tile.centre.y - 1) * radius).toBeCloseTo(tile.row * old_radius * 1.5, 12);
    }
  }
});
