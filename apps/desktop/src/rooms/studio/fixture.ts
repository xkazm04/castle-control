/** Illustrative sample only. The reference sample.js supplies a 9×6 board and
 * these house names, but no tiles (keep/NOTES.md). These invented territories
 * are local design data, not votes, identities or a Twitch Extension state. */
export const fixtureHouses = ['House Quill', 'House Tallow', 'House Sable'] as const;
export type House = typeof fixtureHouses[number];
export type HexTile = { id: string; column: number; row: number; owner?: House };
const territoryRows = [
  'QQQQ.TTTT',
  'QQQQ.TTTT',
  'QQQ...TTT',
  'QQ.SSS.TT',
  'Q.SSSSS.T',
  '.SSSSSSS.',
] as const;
const owners: Readonly<Record<string, House>> = { Q: 'House Quill', T: 'House Tallow', S: 'House Sable' };
export const fixtureTiles: readonly HexTile[] = Object.freeze(territoryRows.flatMap((row, rowIndex) =>
  Array.from(row, (mark, column) => Object.freeze({ id: `${String.fromCharCode(65 + column)}${rowIndex + 1}`,
    column, row: rowIndex, ...(owners[mark] ? { owner: owners[mark] } : {}) }))));
