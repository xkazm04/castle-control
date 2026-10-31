/** Room-local display data. Tile fields mirror the renderer's axial HexTile,
 * excluding image_path; this adds no dependency or transport identifier. */
export const studioInks = Object.freeze(['gules', 'or', 'azure', 'key'] as const);
export type StudioInk = typeof studioInks[number];
export type StudioSide = Readonly<{ id: string; label: string; short: string; ink: StudioInk }>;
export type StudioTile = Readonly<{ q: number; r: number; side?: string }>;
export type StudioBoard = Readonly<{
  title: string; sides: readonly StudioSide[]; tiles: readonly StudioTile[];
}>;
export type StudioBoardResult = Readonly<
  { ok: true; board: StudioBoard } | { ok: false; error: Readonly<{ code: 'invalid_board'; message: string }> }
>;

function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain record');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new Error('Unknown board field');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Board labels and ids must not be blank');
  return value;
}

function coordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Coordinates must be safe integers');
  return value;
}

/** The single boundary: copy, validate closed fields and freeze every record.
 * Failure never exposes a partly parsed board or forwards input into CSS. */
export function parseStudioBoard(value: unknown): StudioBoardResult {
  try {
    const fields = record(value, ['title', 'sides', 'tiles']);
    const title = text(fields.title);
    if (!Array.isArray(fields.sides)) throw new Error('Expected a sides array');
    const side_ids = new Set<string>();
    const sides = Array.from(fields.sides, (value: unknown): StudioSide => {
      const side = record(value, ['id', 'label', 'short', 'ink']);
      const id = text(side.id); const label = text(side.label); const short = text(side.short);
      const ink = studioInks.find(ink => ink === side.ink);
      if (!ink) throw new Error('Unknown ink token');
      if (side_ids.has(id)) throw new Error('Duplicate side id');
      side_ids.add(id);
      return Object.freeze({ id, label, short, ink });
    });
    if (!Array.isArray(fields.tiles) || fields.tiles.length < 1 || fields.tiles.length > 200) {
      throw new Error('A board needs 1 to 200 tiles');
    }
    const locations = new Set<string>();
    const tiles = Array.from(fields.tiles, (value: unknown): StudioTile => {
      const tile = record(value, ['q', 'r', 'side']);
      const q = coordinate(tile.q); const r = coordinate(tile.r);
      const key = `${q},${r}`;
      if (locations.has(key)) throw new Error('Duplicate tile coordinates');
      locations.add(key);
      if (!Object.hasOwn(tile, 'side')) return Object.freeze({ q, r });
      const side = text(tile.side);
      if (!side_ids.has(side)) throw new Error('Tile side is not declared');
      return Object.freeze({ q, r, side });
    });
    return Object.freeze({ ok: true, board: Object.freeze({ title,
      sides: Object.freeze(sides), tiles: Object.freeze(tiles) }) });
  } catch (error) {
    return Object.freeze({ ok: false, error: Object.freeze({ code: 'invalid_board',
      message: error instanceof Error ? error.message : 'Invalid studio board' }) });
  }
}

export type BoardTile = Readonly<{
  q: number; r: number; id: string; column: number; column_label: string; row: number;
  centre: Readonly<{ x: number; y: number }>; side?: StudioSide;
}>;
export type BoardGeometry = Readonly<{
  width: number; height: number; fit_width: number; fit_height: number; columns: number; rows: number;
  tiles: readonly BoardTile[]; sides: readonly Readonly<StudioSide & { count: number }>[]; unclaimed: number;
}>;

function columnLabel(column: number): string {
  let label = '';
  for (let value = column + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + (value - 1) % 26) + label;
  }
  return label;
}

/** Pointy-top axial centres: sqrt(3)*(q+r/2), 1.5*r at radius 1.
 * x is expressed in hex widths, y in radii. Normalise whole hex bounds, not
 * just centres. Offset columns/rows are labels only, never placement inputs. */
export function boardGeometry(board: StudioBoard): BoardGeometry {
  const min_x = Math.min(...board.tiles.map(tile => tile.q + tile.r / 2));
  const min_r = Math.min(...board.tiles.map(tile => tile.r));
  const offset = (tile: StudioTile) => tile.q + Math.floor(tile.r / 2);
  const min_column = Math.min(...board.tiles.map(offset));
  const side_by_id = new Map(board.sides.map(side => [side.id, side]));
  const counts = new Map<string, number>(); let unclaimed = 0;
  const tiles = board.tiles.map(tile => {
    const side = tile.side === undefined ? undefined : side_by_id.get(tile.side);
    if (side) counts.set(side.id, (counts.get(side.id) ?? 0) + 1);
    else unclaimed += 1;
    const column = offset(tile) - min_column; const row = tile.r - min_r;
    const column_label = columnLabel(column);
    return Object.freeze({ q: tile.q, r: tile.r, column, column_label, row, id: `${column_label}${row + 1}`,
      centre: Object.freeze({ x: tile.q + tile.r / 2 - min_x + .5, y: 1.5 * row + 1 }),
      ...(side ? { side } : {}) });
  });
  const width = Math.max(...tiles.map(tile => tile.centre.x)) + .5;
  const height = Math.max(...tiles.map(tile => tile.centre.y)) + 1;
  return Object.freeze({ width, height,
    // Preserve the C port's conservative sample fit at subpixel precision.
    fit_width: Math.ceil(width * Math.sqrt(3) * 100) / 100, fit_height: height + .02,
    columns: Math.max(...tiles.map(tile => tile.column)) + 1, rows: Math.max(...tiles.map(tile => tile.row)) + 1,
    tiles: Object.freeze(tiles), sides: Object.freeze(board.sides.map(side =>
      Object.freeze({ ...side, count: counts.get(side.id) ?? 0 }))), unclaimed });
}
