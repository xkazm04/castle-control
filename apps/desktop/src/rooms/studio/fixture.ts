import { boardGeometry, parseStudioBoard } from './board.js';

/** Invented sample territory, not votes, identities or Twitch Extension state. */
const territoryRows = [
  'QQQQ.TTTT',
  'QQQQ.TTTT',
  'QQQ...TTT',
  'QQ.SSS.TT',
  'Q.SSSSS.T',
  '.SSSSSSS.',
] as const;
const sides = [
  { id: 'quill', label: 'House Quill', short: 'Quill', ink: 'gules' },
  { id: 'tallow', label: 'House Tallow', short: 'Tallow', ink: 'or' },
  { id: 'sable', label: 'House Sable', short: 'Sable', ink: 'azure' },
] as const;
const owners: Readonly<Record<string, string>> = { Q: 'quill', T: 'tallow', S: 'sable' };
const sample = parseStudioBoard({ title: 'The war table', sides,
  tiles: territoryRows.flatMap((row, r) => Array.from(row, (mark, column) => ({
    q: column - Math.floor(r / 2), r, ...(owners[mark] ? { side: owners[mark] } : {}),
  }))),
});
if (!sample.ok) throw new Error(sample.error.message);
export const STUDIO_SAMPLE_BOARD = sample.board;

/** Compatibility projections for the local journey's inventory checks.
 * The parsed axial board is the source of truth, including ownership labels. */
export type House = string;
export type HexTile = Readonly<{ id: string; column: number; row: number; owner?: House }>;
export const fixtureHouses = Object.freeze(STUDIO_SAMPLE_BOARD.sides.map(side => side.label));
export const fixtureTiles: readonly HexTile[] = Object.freeze(boardGeometry(STUDIO_SAMPLE_BOARD).tiles.map(tile =>
  Object.freeze({ id: tile.id, column: tile.column, row: tile.row, ...(tile.side ? { owner: tile.side.label } : {}) })));
