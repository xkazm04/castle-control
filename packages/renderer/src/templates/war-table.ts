import { finite, integer, list, localImage, optionalSide, record, text } from './validation.ts';
import { escapeMarkup, outputDimensions } from '../viewer/markup.ts';

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

export interface WarTableOutputOptions {
  readonly width?: number;
  readonly height?: number;
  readonly anchor?: 'centre' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  readonly selected?: Readonly<{ q: number; r: number }>;
}

function outputOptions(value: unknown) {
  const fields = record(value, ['width', 'height', 'anchor', 'selected'], 'war-table output');
  const dimensions = outputDimensions({ ...(Object.hasOwn(fields, 'width') ? { width: fields.width } : {}),
    ...(Object.hasOwn(fields, 'height') ? { height: fields.height } : {}) });
  const anchor = Object.hasOwn(fields, 'anchor') ? fields.anchor : 'centre';
  if (anchor !== 'centre' && anchor !== 'top_left' && anchor !== 'top_right'
    && anchor !== 'bottom_left' && anchor !== 'bottom_right') throw new Error('invalid output anchor');
  let selected: Readonly<{ q: number; r: number }> | undefined;
  if (Object.hasOwn(fields, 'selected')) {
    const tile = record(fields.selected, ['q', 'r'], 'selected tile');
    selected = { q: integer(tile.q, 'q'), r: integer(tile.r, 'r') };
  }
  return { ...dimensions, anchor, ...(selected ? { selected } : {}) };
}

/** Fits axial geometry with a 12-unit safe margin. The existing scene API is unchanged. */
export function layoutWarTableOutput(value: unknown, options: unknown = {}): WarTableScene & {
  readonly width: number; readonly height: number;
} {
  const { width, height, anchor } = outputOptions(options);
  const scene = buildWarTableScene(value, 20);
  const corners = scene.tiles.flatMap(tile => tile.corners);
  const left = Math.min(...corners.map(p => p.x)); const top = Math.min(...corners.map(p => p.y));
  const span_x = Math.max(...corners.map(p => p.x)) - left;
  const span_y = Math.max(...corners.map(p => p.y)) - top;
  if (span_x <= 0 || span_y <= 0) throw new Error('war-table output has no renderable area');
  const scale = Math.min((width - 24) / span_x, (height - 24) / span_y);
  const x = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : .5;
  const y = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : .5;
  const transform = (p: HexPoint) => point(12 + (width - 24 - span_x * scale) * x + (p.x - left) * scale,
    12 + (height - 24 - span_y * scale) * y + (p.y - top) * scale);
  return Object.freeze({ width, height, hex_size: scene.hex_size * scale,
    tiles: Object.freeze(scene.tiles.map(tile => Object.freeze({ ...tile, centre: transform(tile.centre),
      corners: Object.freeze(tile.corners.map(transform)) }))),
    pieces: Object.freeze(scene.pieces.map(piece => Object.freeze({ ...piece, centre: transform(piece.centre) }))),
  });
}

/** Static local preview, no executable design data, remote loads or authoritative actions. */
export function renderWarTableSvg(value: unknown, options: unknown = {}): string {
  const settings = outputOptions(options);
  const scene = layoutWarTableOutput(value, options);
  const tiles = scene.tiles.map(tile => {
    const selected = settings.selected?.q === tile.q && settings.selected.r === tile.r;
    const points = tile.corners.map(p => `${p.x},${p.y}`).join(' ');
    const label = escapeMarkup(`Tile ${tile.q},${tile.r}${tile.side ? ` · ${tile.side}` : ''}`);
    return `<g data-tile="${tile.q},${tile.r}" aria-pressed="${selected}"><title>${label}</title>`
      + `<polygon points="${points}" fill="var(--${tile.side ? 'azure' : 'paper-2'})" `
      + `stroke="var(--${selected ? 'gules' : 'ink'})" stroke-width="${selected ? 3 : 1}"/></g>`;
  }).join('');
  const pieces = scene.pieces.map(piece => `<g data-piece="${escapeMarkup(piece.id)}"><title>${escapeMarkup(piece.id)}</title>`
    + `<circle cx="${piece.centre.x}" cy="${piece.centre.y}" r="${scene.hex_size * .25}" fill="var(--or)"/></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" `
    + `viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="SIMULATED war-table preview" `
    + 'style="background:transparent;max-width:100%;font-family:var(--font-ui);color:var(--ink)">'
    + `<title>SIMULATED · local war table</title>${tiles}${pieces}`
    + '<text x="12" y="16" fill="currentColor" style="font-size:var(--text-small)">SIMULATED</text></svg>';
}
