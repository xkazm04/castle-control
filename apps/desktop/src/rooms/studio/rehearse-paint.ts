import { boardGeometry, parseStudioBoard } from './board.js';
import type { StudioBoard } from './board.js';

/** Rehearsal-only edits to the starting territory, kept as a small overlay on one base board:
 * tile id -> house id, with '' meaning unclaimed. Only tiles that differ from the base are kept,
 * so painting a tile back to what it was removes the edit. The room's own table is never touched. */
export type StartEdits = Readonly<{ base: StudioBoard; by: Readonly<Record<string, string>> }>;

const original = (base: StudioBoard, id: string): string | undefined => {
  const tile = boardGeometry(base).tiles.find(item => item.id === id);
  return tile ? tile.side?.id ?? '' : undefined;
};

/** Paints one tile with a house ('' clears it). An unknown tile or house, or a paint that changes
 * nothing, returns `edits` itself, so callers can tell by identity that nothing happened. */
export function paintEdits(edits: StartEdits | null, base: StudioBoard, id: string, side: string): StartEdits | null {
  const was = original(base, id);
  if (was === undefined || (side !== '' && !base.sides.some(house => house.id === side))) return edits;
  const mine = edits && edits.base === base ? edits : null;
  const now = mine?.by[id] ?? was;
  if (now === side) return edits;
  const by = { ...mine?.by };
  if (side === was) delete by[id]; else by[id] = side;
  return Object.keys(by).length === 0 ? null : Object.freeze({ base, by: Object.freeze(by) });
}

/** The board a rehearsal starts from: the base with the edits applied, re-parsed by the same
 * door as every other board. If that ever failed, the untouched base is the safe answer. */
export function startBoard(base: StudioBoard, edits: StartEdits | null): StudioBoard {
  if (!edits || edits.base !== base || Object.keys(edits.by).length === 0) return base;
  const geometry = boardGeometry(base);
  const parsed = parseStudioBoard({ title: base.title, sides: base.sides, tiles: base.tiles.map((tile, index) => {
    const side = edits.by[geometry.tiles[index]?.id ?? ''] ?? tile.side ?? '';
    return side === '' ? { q: tile.q, r: tile.r } : { q: tile.q, r: tile.r, side };
  }) });
  return parsed.ok ? parsed.board : base;
}

/** How many tiles differ from the base board. */
export function repainted(edits: StartEdits | null, base: StudioBoard): number {
  return edits && edits.base === base ? Object.keys(edits.by).length : 0;
}
