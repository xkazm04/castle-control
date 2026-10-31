import { styles } from '../../demo/model.js';
import type { DemoStyle } from '../../demo/model.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { fixtureHouses, fixtureTiles } from './fixture.js';
import type { HexTile } from './fixture.js';

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
export function createStudioSession(): StudioSession {
  return { design: { size: 'm', anchor: 'centre', colour: 'gules', art_style: 'heraldic', reveal_ms: 300 },
    selected: 'A1', reveal_input: '300', reveal_run: 0 };
}

export function tilesForSize(size: MapSize): readonly HexTile[] {
  if (size === 'm') return fixtureTiles;
  const dimensions = mapSizes.find(item => item.id === size) ?? mapSizes[1];
  return Array.from({ length: dimensions.columns * dimensions.rows }, (_, index) => {
    const column = index % dimensions.columns; const row = Math.floor(index / dimensions.columns);
    const existing = fixtureTiles.find(tile => tile.column === column && tile.row === row);
    if (existing) return existing;
    const owner = fixtureHouses[(column + row) % 4];
    return { id: `${String.fromCharCode(65 + column)}${row + 1}`, column, row, ...(owner ? { owner } : {}) };
  });
}

export function updateStudioSession(state: StudioSession, field: SessionField, value = ''): StudioSession {
  if (field === 'reset') return createStudioSession();
  if (field === 'replay') return { ...state, reveal_run: state.reveal_run + 1 };
  const tiles = tilesForSize(state.design.size);
  if (field === 'tile' || field === 'banner') {
    const selected = tiles.find(tile => field === 'tile' ? tile.id === value : (tile.owner ?? 'unclaimed') === value);
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
    const choice = mapSizes.find(item => item.id === value);
    if (!choice) return state;
    const nextTiles = tilesForSize(choice.id);
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
