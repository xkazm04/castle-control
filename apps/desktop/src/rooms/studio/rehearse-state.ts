import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { matchedTurns, nextSeed, parseRehearsalSetup, rehearsalDefaults, runRehearsal } from './rehearsal.js';
import type { Rehearsal, RehearsalField, RehearsalTurn } from './rehearsal.js';
import { balanceReport } from './rehearsal-verdict.js';
import type { BalanceReport } from './rehearsal-verdict.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import { boardForSize, mapSizes } from './session.js';

export type RehearseInputs = Readonly<Record<RehearsalField, string>>;
export type PastRun = Readonly<{
  id: number; seed: string; viewers: number; turns: number; verdict: string; kind: BalanceReport['kind'];
  columns: number; rows: number; tiles: number; board: StudioBoard;
}>;
export type SizeChoice = Readonly<{ id: string; label: string; board: StudioBoard }>;
export type SizeRow = Readonly<{
  id: string; label: string; columns: number; rows: number; tiles: number; verdict: string; kind: BalanceReport['kind'];
  leader: string; percent: number; last_change: number; lead_changes: number; board: StudioBoard;
}>;
export type SizeCompare = Readonly<{ seed: string; viewers: number; turns: number; rows: readonly SizeRow[] }>;
/** The room's own S / M / L boards, in order, for the one-press size comparison. */
export const sizeChoices: readonly SizeChoice[] = Object.freeze(mapSizes.map(item => Object.freeze({
  id: item.id, label: item.label, board: boardForSize(item.id) })));

/** Session-only state of the Rehearse view. Nothing here is stored, sent or counted. */
export type RehearseState = Readonly<{
  inputs: RehearseInputs; error: Readonly<{ field: RehearsalField; message: string }> | null;
  run: Rehearsal | null; run_id: number; turn: number; playing: boolean;
  replay: Readonly<{ seed: string; matched: number; of: number }> | null;
  past: readonly PastRun[]; selected: string; sizes: SizeCompare | null;
}>;
export type RehearseAction =
  | { type: 'input'; field: RehearsalField; value: string }
  | { type: 'start' | 'again'; board: StudioBoard; reduced_motion: boolean }
  | { type: 'step'; board: StudioBoard }
  | { type: 'replay'; reduced_motion: boolean }
  | { type: 'tick' | 'pause' | 'resume' | 'reset' | 'clear_past' | 'clear_sizes' }
  | { type: 'compare_sizes'; sizes: readonly SizeChoice[] }
  | { type: 'select'; id: string };

export const maxPastRuns = 3;
export function createRehearseState(): RehearseState {
  const { seed, viewers, turns } = rehearsalDefaults;
  return { inputs: { seed, viewers: String(viewers), turns: String(turns) }, error: null, run: null, run_id: 0,
    turn: 0, playing: false, replay: null, past: [], selected: '', sizes: null };
}

/** Records a finished run once, so replaying a seed never adds a duplicate comparison. */
function settle(state: RehearseState): RehearseState {
  const run = state.run;
  if (!run || state.turn < run.turns.length || state.past.some(past => past.id === state.run_id)) return state;
  const geometry = boardGeometry(run.start);
  const entry: PastRun = Object.freeze({ id: state.run_id, seed: run.setup.seed, viewers: run.setup.viewers,
    turns: run.setup.turns, verdict: balanceReport(run).verdict, kind: balanceReport(run).kind, columns: geometry.columns,
    rows: geometry.rows, tiles: geometry.tiles.length, board: run.turns.at(-1)?.board ?? run.start });
  return { ...state, past: [...state.past, entry].slice(-maxPastRuns) };
}

function begin(state: RehearseState, board: StudioBoard, reduced_motion: boolean, inputs = state.inputs): RehearseState {
  const parsed = parseRehearsalSetup(inputs);
  if (!parsed.ok) return { ...state, inputs, error: { field: parsed.error.field, message: parsed.error.message }, playing: false };
  const run = runRehearsal(board, parsed.setup);
  if (!run.ok) return { ...state, inputs, error: { field: run.error.field, message: run.error.message }, playing: false };
  const last = run.rehearsal.turns.length;
  return settle({ ...state, inputs, error: null, run: run.rehearsal, run_id: state.run_id + 1, replay: null, selected: '',
    turn: reduced_motion ? last : 0, playing: !reduced_motion });
}

/** Same seed, crowd and turns on every size: the only difference is the board the session produced. */
function compareSizes(state: RehearseState, choices: readonly SizeChoice[]): RehearseState {
  const parsed = parseRehearsalSetup(state.inputs);
  if (!parsed.ok) return { ...state, error: { field: parsed.error.field, message: parsed.error.message } };
  const rows: SizeRow[] = [];
  for (const choice of choices) {
    const run = runRehearsal(choice.board, parsed.setup);
    if (!run.ok) return { ...state, error: { field: run.error.field, message: run.error.message } };
    const report = balanceReport(run.rehearsal);
    const geometry = boardGeometry(choice.board);
    rows.push(Object.freeze({ id: choice.id, label: choice.label, columns: geometry.columns, rows: geometry.rows,
      tiles: geometry.tiles.length, verdict: report.verdict, kind: report.kind, leader: report.leader.short,
      percent: report.leader.percent, last_change: report.last_change, lead_changes: report.lead_changes,
      board: run.rehearsal.turns.at(-1)?.board ?? choice.board }));
  }
  const { seed, viewers, turns } = parsed.setup;
  return { ...state, error: null, sizes: Object.freeze({ seed, viewers, turns, rows: Object.freeze(rows) }) };
}

export function reduceRehearse(state: RehearseState, action: RehearseAction): RehearseState {
  const last = state.run?.turns.length ?? 0;
  switch (action.type) {
    case 'input': return { ...state, inputs: { ...state.inputs, [action.field]: action.value }, error: null };
    case 'start': return begin(state, action.board, action.reduced_motion);
    case 'again': return begin(state, action.board, action.reduced_motion,
      { ...state.inputs, seed: nextSeed(state.run?.setup.seed ?? state.inputs.seed) });
    case 'step': {
      const base = state.run ? state : begin(state, action.board, false);
      if (!base.run || base.error) return base;
      return settle({ ...base, turn: Math.min(base.run.turns.length, base.turn + 1), playing: false });
    }
    case 'tick': {
      if (!state.playing || !state.run) return state;
      const turn = Math.min(last, state.turn + 1);
      return settle({ ...state, turn, playing: turn < last });
    }
    case 'pause': return { ...state, playing: false };
    case 'resume': return state.run && state.turn < last ? { ...state, playing: true } : state;
    case 'reset': return { ...state, error: null, run: null, turn: 0, playing: false, replay: null, selected: '' };
    case 'replay': {
      const first = state.run;
      if (!first) return state;
      const again = runRehearsal(first.start, first.setup);
      if (!again.ok) return state;
      return settle({ ...state, run: again.rehearsal, error: null, selected: '',
        replay: { seed: first.setup.seed, matched: matchedTurns(first, again.rehearsal), of: first.turns.length },
        turn: action.reduced_motion ? last : 0, playing: !action.reduced_motion });
    }
    case 'compare_sizes': return compareSizes(state, action.sizes);
    case 'clear_sizes': return { ...state, sizes: null };
    case 'select': return { ...state, selected: action.id };
    case 'clear_past': return { ...state, past: [] };
  }
}

export type RehearseView = Readonly<{
  shown: StudioBoard; turn: RehearsalTurn | undefined; flipped: ReadonlySet<string>; phase: 0 | 1;
  of: number; done: boolean; report: BalanceReport | undefined; /* live: through the shown turn */
}>;
/** What the table shows: the starting board at turn 0, else that turn's snapshot. */
export function rehearseView(state: RehearseState, board: StudioBoard): RehearseView {
  const run = state.run;
  const turn = run && state.turn > 0 ? run.turns[state.turn - 1] : undefined;
  const of = run?.turns.length ?? 0;
  const done = !!run && state.turn >= of;
  return { shown: turn?.board ?? run?.start ?? board, turn, of, done,
    flipped: new Set(turn?.changes.map(change => change.id)), phase: state.turn % 2 === 0 ? 0 : 1,
    report: run && state.turn > 0 ? balanceReport(run, state.turn) : undefined };
}

/** The line announced and logged for a turn, e.g. "Turn 3: Sable took 4, Quill 2". */
export function turnLine(run: Rehearsal, turn: RehearsalTurn): string {
  const took = run.start.sides.map(side => ({ side, count: turn.took[side.id] ?? 0 }))
    .filter(entry => entry.count > 0).sort((a, b) => b.count - a.count)
    .map(entry => copy.took(entry.side.short, entry.count));
  return copy.turn_line(turn.turn, took);
}
