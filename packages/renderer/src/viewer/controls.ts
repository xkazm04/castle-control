import { integer, list, record, text } from '../templates/validation.ts';
import { tileLabel } from '../templates/war-table.ts';
import { escapeMarkup, outputDimensions } from './markup.ts';

/** Local UI intent only: no transport identifier, identity, tally or game outcome. */
export type ViewerAction =
  | Readonly<{ kind: 'vote'; option_index: number }>
  | Readonly<{ kind: 'pick_tile'; q: number; r: number }>
  | Readonly<{ kind: 'join_side'; side: string }>
  | Readonly<{ kind: 'reset' }>;

interface Tile { readonly q: number; readonly r: number }
export interface ViewerControlState {
  readonly controls: Readonly<{
    options: readonly string[]; tiles: readonly Tile[]; sides: readonly string[];
  }>;
  readonly selection: Readonly<{ option_index?: number; tile?: Tile; side?: string }>;
}

function parseTile(value: unknown): Tile {
  const fields = record(value, ['q', 'r'], 'tile');
  return Object.freeze({ q: integer(fields.q, 'q'), r: integer(fields.r, 'r') });
}

/** Snapshot host-provided local control choices; no executable or payment fields. */
export function createViewerControls(value: unknown): ViewerControlState {
  const fields = record(value, ['options', 'tiles', 'sides'], 'viewer controls');
  const controls = Object.freeze({
    options: Object.freeze(list(fields.options, 'options').map((item) => text(item, 'option'))),
    tiles: Object.freeze(list(fields.tiles, 'tiles').map(parseTile)),
    sides: Object.freeze(list(fields.sides, 'sides').map((item) => text(item, 'side'))),
  });
  return Object.freeze({ controls, selection: Object.freeze({}) });
}

/**
 * Closed action schema is the money guard. Every extra field is refused even
 * when its value is zero/undefined. There is no entry, ticket, paid weight,
 * random outcome or contribution action. Future actions must pass this door.
 */
function parseFreeAction(value: unknown): ViewerAction | undefined {
  try {
    const fields = record(value, ['kind', 'option_index', 'q', 'r', 'side'], 'viewer action');
    switch (fields.kind) {
      case 'vote':
        record(value, ['kind', 'option_index'], 'vote');
        return { kind: 'vote', option_index: integer(fields.option_index, 'option_index', 0) };
      case 'pick_tile':
        record(value, ['kind', 'q', 'r'], 'pick tile');
        return { kind: 'pick_tile', ...parseTile({ q: fields.q, r: fields.r }) };
      case 'join_side':
        record(value, ['kind', 'side'], 'join side');
        return { kind: 'join_side', side: text(fields.side, 'side') };
      case 'reset':
        record(value, ['kind'], 'reset');
        return { kind: 'reset' };
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

export function isFreeViewerAction(value: unknown): boolean {
  return parseFreeAction(value) !== undefined;
}

/**
 * Pure local selection reducer. The authenticated host separately accepts and
 * moderates submissions, enforces cadence and owns all authoritative outcomes.
 * Invalid/paid actions preserve the exact previous state, including on reset.
 */
export function reduceViewerControls(state: ViewerControlState, value: unknown): ViewerControlState {
  const action = parseFreeAction(value);
  if (!action) return state;
  let selection: ViewerControlState['selection'];
  switch (action.kind) {
    case 'vote':
      if (action.option_index >= state.controls.options.length) return state;
      selection = { ...state.selection, option_index: action.option_index };
      break;
    case 'pick_tile':
      if (!state.controls.tiles.some((tile) => tile.q === action.q && tile.r === action.r)) return state;
      selection = { ...state.selection, tile: Object.freeze({ q: action.q, r: action.r }) };
      break;
    case 'join_side':
      if (!state.controls.sides.includes(action.side)) return state;
      selection = { ...state.selection, side: action.side };
      break;
    case 'reset':
      selection = {};
  }
  return Object.freeze({ controls: state.controls, selection: Object.freeze(selection) });
}

/**
 * Static markup for the reviewed host to bind to the local reducer. This is not
 * an Extension connection or a submission; all three controls remain free.
 * A fixed-size transparent viewport scrolls its contents at narrow panel widths.
 */
export function renderViewerPanel(state: ViewerControlState, options: unknown = {}): string {
  const { width, height } = outputDimensions(options);
  // Revalidate the host's choices at the markup door, including unknown/payment fields.
  const { controls } = createViewerControls(state.controls);
  const button = (kind: string, label: string, selected: boolean, data: string) =>
    `<button type="button" data-viewer-choice="${kind}" ${data} aria-pressed="${selected}" `
    + `style="font:inherit;color:var(--${selected ? 'paper' : 'ink'});background:var(--${selected ? 'ink' : 'paper'});`
    + 'border:var(--rule-thin) solid var(--ink);padding:var(--space-8);overflow-wrap:anywhere">'
    + `${escapeMarkup(label)}${selected ? '<span aria-hidden="true"> · ✓ Selected</span>' : ''}</button>`;
  const votes = controls.options.map((label, index) => button('vote', label,
    state.selection.option_index === index, `data-option-index="${index}"`)).join('');
  const min_column = Math.min(...controls.tiles.map(tile => tile.q + Math.floor(tile.r / 2)));
  const min_r = Math.min(...controls.tiles.map(tile => tile.r));
  const tiles = controls.tiles.map(tile => button('pick_tile', `Tile ${tileLabel(tile, min_column, min_r)}`,
    state.selection.tile?.q === tile.q && state.selection.tile.r === tile.r,
    `data-q="${tile.q}" data-r="${tile.r}"`)).join('');
  const sides = controls.sides.map(side => button('join_side', side, state.selection.side === side,
    `data-side="${escapeMarkup(side)}"`)).join('');
  const group = (label: string, content: string) => content ? `<fieldset style="min-width:0;border:0;padding:var(--space-8);margin:0">`
    + `<legend>${label}</legend><div style="display:flex;flex-wrap:wrap;gap:var(--space-8)">${content}</div></fieldset>` : '';
  return `<section data-viewer-panel="simulated" data-output-width="${width}" data-output-height="${height}" `
    + `aria-label="SIMULATED viewer controls" style="width:${width}px;height:${height}px;max-width:100%;`
    + 'box-sizing:border-box;overflow:auto;background:transparent;font:var(--text-body)/1.4 var(--font-ui);color:var(--ink)">'
    + '<p>SIMULATED · local selections only; nothing is sent to Twitch.</p>'
    + (votes || tiles || sides ? group('Vote', votes) + group('Pick a tile', tiles) + group('Join a side', sides)
      : '<p role="status">No viewer controls configured</p>') + '</section>';
}
