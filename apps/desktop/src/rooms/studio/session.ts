import { styles } from '../../demo/model.js';
import type { DemoStyle } from '../../demo/model.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { STUDIO_SAMPLE_BOARD, fixtureTiles } from './fixture.js';
import type { HexTile } from './fixture.js';
import { boardGeometry, parseStudioBoard } from './board.js';
import type { StudioBoard } from './board.js';

export const mapSizes = [
  { id: 's', label: 'S · 6 × 4', columns: 6, rows: 4 },
  { id: 'm', label: 'M · 9 × 6', columns: 9, rows: 6 },
  { id: 'l', label: 'L · 12 × 8', columns: 12, rows: 8 },
] as const;
export const mapAnchors = [
  { id: 'top_left', label: 'Top left' }, { id: 'top_right', label: 'Top right' },
  { id: 'centre', label: 'Centre' },
  { id: 'bottom_left', label: 'Bottom left' }, { id: 'bottom_right', label: 'Bottom right' },
] as const;
export const mapColours = [
  { id: 'gules', label: 'Gules · red' }, { id: 'azure', label: 'Azure · blue' },
  { id: 'or', label: 'Or · gold' }, { id: 'key', label: 'Key · black' },
] as const;
export type MapSize = typeof mapSizes[number]['id'];
export type MapDesign = Readonly<{
  size: MapSize; anchor: typeof mapAnchors[number]['id'];
  colour: typeof mapColours[number]['id']; art_style: DemoStyle; reveal_ms: number;
}>;
export type StudioSession = Readonly<{
  design: MapDesign; selected: string; reveal_input: string; reveal_run: number; error?: string;
}>;
export type SessionField = keyof MapDesign | 'tile' | 'banner' | 'reset' | 'replay';

/** Local simulated design only. There is no persistence, RPC or stage transition. */
export function createStudioSession(board: StudioBoard = STUDIO_SAMPLE_BOARD): StudioSession {
  const first = boardGeometry(board).tiles[0];
  if (!first) throw new Error('Parsed studio board has no tiles');
  return { design: { size: 'm', anchor: 'centre', colour: 'gules', art_style: 'heraldic', reveal_ms: 300 },
    selected: first.id, reveal_input: '300', reveal_run: 0 };
}

function sizedBoard(size: MapSize): StudioBoard {
  if (size === 'm') return STUDIO_SAMPLE_BOARD;
  const dimensions = mapSizes.find(item => item.id === size) ?? mapSizes[1];
  const sample = boardGeometry(STUDIO_SAMPLE_BOARD);
  const tiles = Array.from({ length: dimensions.columns * dimensions.rows }, (_, index) => {
    const column = index % dimensions.columns; const row = Math.floor(index / dimensions.columns);
    const existing = sample.tiles.find(tile => tile.column === column && tile.row === row);
    const side = existing ? existing.side : STUDIO_SAMPLE_BOARD.sides[(column + row) % 4];
    return { q: column - Math.floor(row / 2), r: row, ...(side ? { side: side.id } : {}) };
  });
  const result = parseStudioBoard({ title: STUDIO_SAMPLE_BOARD.title, sides: STUDIO_SAMPLE_BOARD.sides, tiles });
  if (!result.ok) throw new Error(result.error.message);
  return result.board;
}

const sizeBoards = { s: sizedBoard('s'), m: STUDIO_SAMPLE_BOARD, l: sizedBoard('l') };
export function boardForSize(size: MapSize): StudioBoard { return sizeBoards[size]; }

/** Compatibility inventory only; rendering and selection consume the board. */
export function tilesForSize(size: MapSize): readonly HexTile[] {
  if (size === 'm') return fixtureTiles;
  return Object.freeze(boardGeometry(boardForSize(size)).tiles.map(tile => Object.freeze({
    id: tile.id, column: tile.column, row: tile.row, ...(tile.side ? { owner: tile.side.label } : {}),
  })));
}

export function updateStudioSession(state: StudioSession, field: SessionField, value = '', board?: StudioBoard): StudioSession {
  if (field === 'reset') return createStudioSession(board);
  if (field === 'replay') return { ...state, reveal_run: state.reveal_run + 1 };
  const tiles = boardGeometry(board ?? boardForSize(state.design.size)).tiles;
  if (field === 'tile' || field === 'banner') {
    const selected = tiles.find(tile => field === 'tile' ? tile.id === value : (tile.side?.id ?? '') === value);
    return selected ? { ...state, selected: selected.id } : state;
  }
  if (field === 'reveal_ms') {
    const duration = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(duration) || duration > 60000) {
      return { ...state, reveal_input: value, error: copy.reveal_error };
    }
    return { design: { ...state.design, reveal_ms: duration }, selected: state.selected,
      reveal_input: value, reveal_run: state.reveal_run };
  }
  if (field === 'size') {
    if (board) return state; // A supplied board owns its dimensions; the fixture size picker cannot replace it.
    const choice = mapSizes.find(item => item.id === value);
    if (!choice) return state;
    const nextTiles = boardGeometry(boardForSize(choice.id)).tiles;
    return { ...state, design: { ...state.design, size: choice.id },
      selected: nextTiles.some(tile => tile.id === state.selected) ? state.selected : 'A1' };
  }
  if (field === 'anchor') {
    const choice = mapAnchors.find(item => item.id === value);
    return choice ? { ...state, design: { ...state.design, anchor: choice.id } } : state;
  }
  if (field === 'colour') {
    const choice = mapColours.find(item => item.id === value);
    return choice ? { ...state, design: { ...state.design, colour: choice.id } } : state;
  }
  const choice = styles.find(item => item.id === value);
  return choice ? { ...state, design: { ...state.design, art_style: choice.id } } : state;
}
