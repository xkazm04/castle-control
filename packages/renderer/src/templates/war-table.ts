import { finite, integer, list, localImage, optionalSide, record, text } from './validation.ts';

export interface HexTile {
  readonly q: number;
  readonly r: number;
  readonly side?: string;
  readonly image_path?: string;
}

export interface HexPiece extends HexTile { readonly id: string }
export interface WarTableData {
  readonly tiles: readonly HexTile[];
  readonly pieces: readonly HexPiece[];
}
export interface HexPoint { readonly x: number; readonly y: number }
export interface WarTableScene {
  readonly hex_size: number;
  readonly tiles: readonly (HexTile & {
    readonly centre: HexPoint;
    readonly corners: readonly HexPoint[];
  })[];
  readonly pieces: readonly (HexPiece & { readonly centre: HexPoint })[];
}

function location(tile: HexTile): string { return `${tile.q},${tile.r}`; }

function parseTile(value: unknown, piece: boolean): HexTile & { readonly id?: string } {
  const fields = record(value, piece ? ['id', 'q', 'r', 'side', 'image_path']
    : ['q', 'r', 'side', 'image_path'], piece ? 'piece' : 'tile');
  return Object.freeze({
    q: integer(fields.q, 'q'), r: integer(fields.r, 'r'),
    ...optionalSide(fields), ...localImage(fields),
    ...(piece ? { id: text(fields.id, 'piece id') } : {}),
  });
}

export function parseWarTable(value: unknown): WarTableData {
  const fields = record(value, ['tiles', 'pieces'], 'war-table');
  const tiles = list(fields.tiles, 'tiles').map((tile) => parseTile(tile, false));
  if (tiles.length === 0) throw new Error('war-table refuses an empty map');
  const locations = new Set<string>();
  for (const tile of tiles) {
    const key = location(tile);
    if (locations.has(key)) throw new Error('war-table: duplicate tile');
    locations.add(key);
  }
  const ids = new Set<string>();
  const pieces = list(fields.pieces, 'pieces').map((value) => {
    const piece = parseTile(value, true);
    const id = text(piece.id, 'piece id');
    if (!locations.has(location(piece))) throw new Error('piece is on a missing tile');
    if (ids.has(id)) throw new Error('war-table: duplicate piece id');
    ids.add(id);
    return Object.freeze({ ...piece, id });
  });
  return Object.freeze({ tiles: Object.freeze(tiles), pieces: Object.freeze(pieces) });
}

function point(x: number, y: number): HexPoint {
  return Object.freeze({ x: finite(x, 'hex x'), y: finite(y, 'hex y') });
}

/** Pointy-top hexes: size is the centre-to-corner radius in logical pixels. */
export function buildWarTableScene(value: unknown, hex_size: number): WarTableScene {
  const data = parseWarTable(value);
  if (finite(hex_size, 'hex_size') <= 0) throw new Error('hex_size must be positive');
  const tiles = Object.freeze(data.tiles.map((tile) => {
    const centre = point(hex_size * Math.sqrt(3) * (tile.q + tile.r / 2), hex_size * 1.5 * tile.r);
    const corners = Object.freeze(Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 180 * (60 * index - 30);
      return point(centre.x + hex_size * Math.cos(angle), centre.y + hex_size * Math.sin(angle));
    }));
    return Object.freeze({ ...tile, centre, corners });
  }));
  const centres = new Map(tiles.map((tile) => [location(tile), tile.centre]));
  const pieces = Object.freeze(data.pieces.map((piece) => {
    const centre = centres.get(location(piece));
    if (!centre) throw new Error('piece is on a missing tile');
    return Object.freeze({ ...piece, centre });
  }));
  return Object.freeze({ hex_size, tiles, pieces });
}

/** Original, simulated template data. No show logic or executable per-channel code. */
export const WAR_TABLE_TEMPLATE: WarTableData = parseWarTable({
  tiles: [
    { q: 0, r: 0 }, { q: 1, r: 0, side: 'north' }, { q: 0, r: 1 },
    { q: -1, r: 1 }, { q: -1, r: 0, side: 'south' }, { q: 0, r: -1 }, { q: 1, r: -1 },
  ],
  pieces: [
    { id: 'simulated_north_scout', q: 1, r: 0, side: 'north' },
    { id: 'simulated_south_scout', q: -1, r: 0, side: 'south' },
  ],
});
