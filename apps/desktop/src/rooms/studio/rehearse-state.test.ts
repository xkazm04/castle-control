import { expect, test } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardForSize } from './session.js';
import { parseStudioBoard } from './board.js';
import { rehearsalDefaults, runRehearsal } from './rehearsal.js';
import { balanceReport } from './rehearsal-verdict.js';
import { crowdLevels, createRehearseState, maxPastRuns, reduceRehearse, rehearseView, sizeChoices, turnLine } from './rehearse-state.js';
import { startBoard } from './rehearse-paint.js';
import type { RehearseAction, RehearseState } from './rehearse-state.js';

const board = STUDIO_SAMPLE_BOARD;
const apply = (...actions: RehearseAction[]): RehearseState => actions.reduce(reduceRehearse, createRehearseState());
const ticks = (count: number): RehearseAction[] => Array.from({ length: count }, () => ({ type: 'tick' }));
const start: RehearseAction = { type: 'start', board, reduced_motion: false };

test('a fresh state holds the room defaults as text and no run', () => {
  const state = createRehearseState();
  expect(state.inputs).toEqual({ seed: '2041', viewers: '120', turns: '8' });
  expect(state.run).toBeNull(); expect(state.turn).toBe(0); expect(state.playing).toBe(false); expect(state.past).toEqual([]);
});

test('starting plays from turn zero on the clock, one tick per turn, and records the finished run once', () => {
  let state = apply(start);
  expect(state.run?.turns).toHaveLength(8); expect(state.turn).toBe(0); expect(state.playing).toBe(true);
  expect(rehearseView(state, board).shown).toBe(board);
  state = [...ticks(7)].reduce(reduceRehearse, state);
  expect(state.turn).toBe(7); expect(state.playing).toBe(true); expect(state.past).toHaveLength(0);
  state = reduceRehearse(state, { type: 'tick' });
  expect(state.turn).toBe(8); expect(state.playing).toBe(false); expect(state.past).toHaveLength(1);
  expect(reduceRehearse(state, { type: 'tick' })).toBe(state);
  expect(state.past[0]).toMatchObject({ seed: '2041', viewers: 120, turns: 8, columns: 9, rows: 6, tiles: 54 });
  expect(state.past[0]?.verdict).toBe(rehearseView(state, board).report?.verdict);
});

test('invalid settings never start a round and name the field to fix', () => {
  for (const [field, value] of [['viewers', '9'], ['viewers', 'many'], ['turns', '1'], ['turns', '99'], ['seed', '  ']] as const) {
    const state = apply({ type: 'input', field, value }, start);
    expect(state.run).toBeNull(); expect(state.playing).toBe(false);
    expect(state.error?.field).toBe(field); expect(state.error?.message).toMatch(/Enter a/);
    expect(reduceRehearse(state, { type: 'input', field, value: '50' }).error).toBeNull();
  }
});

test('step, pause and resume move one turn at a time and stop the clock', () => {
  let state = apply({ type: 'step', board });
  expect(state.turn).toBe(1); expect(state.playing).toBe(false); expect(state.run).not.toBeNull();
  state = reduceRehearse(state, { type: 'resume' });
  expect(state.playing).toBe(true);
  state = reduceRehearse(state, { type: 'pause' });
  expect(state.playing).toBe(false);
  state = reduceRehearse(reduceRehearse(state, { type: 'step', board }), { type: 'step', board });
  expect(state.turn).toBe(3);
  for (let index = 0; index < 10; index += 1) state = reduceRehearse(state, { type: 'step', board });
  expect(state.turn).toBe(8); expect(state.past).toHaveLength(1);
  expect(reduceRehearse(state, { type: 'resume' }).playing).toBe(false);
});

test('reduced motion jumps straight to the end state, with the run recorded', () => {
  const state = apply({ type: 'start', board, reduced_motion: true });
  expect(state.turn).toBe(8); expect(state.playing).toBe(false); expect(state.past).toHaveLength(1);
  expect(rehearseView(state, board).done).toBe(true);
  const again = reduceRehearse(state, { type: 'again', board, reduced_motion: true });
  expect(again.turn).toBe(8); expect(again.playing).toBe(false);
});

test('reset clears the round and keeps the settings and the comparison', () => {
  const state = reduceRehearse(apply({ type: 'input', field: 'viewers', value: '60' }, { type: 'start', board, reduced_motion: true }), { type: 'reset' });
  expect(state.run).toBeNull(); expect(state.turn).toBe(0); expect(state.inputs.viewers).toBe('60'); expect(state.past).toHaveLength(1);
  expect(rehearseView(state, board).shown).toBe(board);
});

test('Rehearse again draws a fresh seed and a different round', () => {
  const first = apply({ type: 'start', board, reduced_motion: true });
  const again = reduceRehearse(first, { type: 'again', board, reduced_motion: true });
  expect(again.inputs.seed).not.toBe('2041'); expect(again.run?.setup.seed).toBe(again.inputs.seed);
  expect(again.run?.turns.map(turn => turn.signature)).not.toEqual(first.run?.turns.map(turn => turn.signature));
  expect(again.past).toHaveLength(2);
});

test('replaying a seed re-runs it on the same board, reports a full match, and adds no duplicate run', () => {
  const finished = apply({ type: 'start', board, reduced_motion: true });
  const replayed = reduceRehearse(finished, { type: 'replay', reduced_motion: false });
  expect(replayed.replay).toEqual({ seed: '2041', matched: 8, of: 8 });
  expect(replayed.turn).toBe(0); expect(replayed.playing).toBe(true);
  expect(replayed.past).toHaveLength(1);
  expect(reduceRehearse(createRehearseState(), { type: 'replay', reduced_motion: false }).run).toBeNull();
  // Replay uses the board the round was played on, even if the table has moved on.
  const small = boardForSize('s');
  const other = reduceRehearse(apply({ type: 'start', board: small, reduced_motion: true }), { type: 'replay', reduced_motion: true });
  expect(other.run?.start).toBe(small); expect(other.replay?.matched).toBe(8);
});

test('the comparison keeps the last three finished runs and can be cleared', () => {
  let state = apply({ type: 'start', board, reduced_motion: true });
  for (let index = 0; index < 4; index += 1) state = reduceRehearse(state, { type: 'again', board, reduced_motion: true });
  expect(state.past).toHaveLength(maxPastRuns);
  expect(new Set(state.past.map(run => run.id)).size).toBe(maxPastRuns);
  expect(state.past.map(run => run.id)).toEqual([...state.past.map(run => run.id)].sort((a, b) => a - b));
  expect(reduceRehearse(state, { type: 'clear_past' }).past).toEqual([]);
  const sizes = apply({ type: 'start', board: boardForSize('s'), reduced_motion: true }, { type: 'start', board: boardForSize('l'), reduced_motion: true });
  expect(sizes.past.map(run => [run.columns, run.rows, run.tiles])).toEqual([[6, 4, 24], [12, 8, 96]]);
});

test('the view shows each turn snapshot and outlines exactly the tiles that changed owner', () => {
  const state = apply(start, ...ticks(3));
  const view = rehearseView(state, board);
  const turn = state.run?.turns[2];
  expect(view.shown).toBe(turn?.board); expect(view.turn).toBe(turn); expect([...view.flipped].sort()).toEqual((turn?.changes.map(change => change.id) ?? []).sort());
  expect(view.done).toBe(false); expect(view.report?.through).toBe(3);
  expect(rehearseView(apply(start, ...ticks(2)), board).phase).not.toBe(view.phase); // consecutive turns alternate, so a tile can re-animate
  expect(rehearseView(createRehearseState(), board).report).toBeUndefined();
});

test('turn lines read like the log: the biggest taker first, quiet turns said plainly', () => {
  const state = apply({ type: 'start', board, reduced_motion: true });
  const run = state.run;
  if (!run) throw new Error('no run');
  for (const turn of run.turns) {
    const line = turnLine(run, turn);
    expect(line).toMatch(new RegExp(`^Turn ${turn.turn}: (no tile changed owner|(\\w+ took \\d+)(, \\w+ took \\d+)*)$`));
    const counts = [...line.matchAll(/took (\d+)/g)].map(match => Number(match[1]));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(turn.changes.length);
  }
  expect(run.turns.some(turn => turn.changes.length > 0)).toBe(true);
});

test('selecting a tile is only inspection: it never touches the round', () => {
  const state = apply({ type: 'start', board, reduced_motion: true });
  const chosen = reduceRehearse(state, { type: 'select', id: 'C3' });
  expect(chosen.selected).toBe('C3'); expect(chosen.run).toBe(state.run); expect(chosen.turn).toBe(state.turn);
});

test('Compare sizes plays S, M and L with the same seed, crowd and turns, and matches a lone run of each', () => {
  const compared = reduceRehearse(createRehearseState(), { type: 'compare_sizes', sizes: sizeChoices });
  expect(compared.sizes?.rows.map(row => [row.id, row.columns, row.rows, row.tiles])).toEqual([['s', 6, 4, 24], ['m', 9, 6, 54], ['l', 12, 8, 96]]);
  expect(compared.sizes).toMatchObject({ seed: '2041', viewers: 120, turns: 8 });
  for (const row of compared.sizes?.rows ?? []) {
    const choice = sizeChoices.find(item => item.id === row.id);
    const lone = choice && runRehearsal(choice.board, rehearsalDefaults);
    if (!lone || !lone.ok) throw new Error('lone run failed');
    const report = balanceReport(lone.rehearsal);
    expect(row).toMatchObject({ verdict: report.verdict, kind: report.kind, percent: report.leader.percent, last_change: report.last_change,
      lead_changes: report.lead_changes, leader: report.leader.short });
    expect(row.board).toEqual(lone.rehearsal.turns.at(-1)?.board);
    expect(row.board.tiles).toHaveLength(row.tiles);
  }
  // The comparison is its own thing: it never starts, ends or records a round.
  expect(compared.run).toBeNull(); expect(compared.past).toEqual([]); expect(compared.playing).toBe(false);
  expect(reduceRehearse(compared, { type: 'reset' }).sizes).toBe(compared.sizes);
  expect(reduceRehearse(compared, { type: 'clear_sizes' }).sizes).toBeNull();
  expect(reduceRehearse(createRehearseState(), { type: 'compare_sizes', sizes: sizeChoices }).sizes?.rows.map(row => row.verdict))
    .toEqual(compared.sizes?.rows.map(row => row.verdict));
});

test('Compare sizes follows the settings, and bad settings never compare', () => {
  const crowd = reduceRehearse(apply({ type: 'input', field: 'viewers', value: '30' }), { type: 'compare_sizes', sizes: sizeChoices });
  expect(crowd.sizes?.viewers).toBe(30);
  const bad = reduceRehearse(apply({ type: 'input', field: 'turns', value: '0' }), { type: 'compare_sizes', sizes: sizeChoices });
  expect(bad.sizes).toBeNull(); expect(bad.error?.field).toBe('turns');
  const solo = parseStudioBoard({ title: 'Solo', sides: board.sides.slice(0, 1), tiles: [{ q: 0, r: 0 }] });
  if (!solo.ok) throw new Error(solo.error.message);
  const refused = reduceRehearse(createRehearseState(), { type: 'compare_sizes', sizes: [{ id: 'x', label: 'X', board: solo.board }] });
  expect(refused.sizes).toBeNull(); expect(refused.error?.message).toMatch(/at least two houses/);
});

const paint = (id: string): RehearseAction => ({ type: 'paint', board, id });

test('painting needs a brush, repaints the start only, and ends the round and the crowd table on the old start', () => {
  const idle = createRehearseState();
  expect(reduceRehearse(idle, paint('D1'))).toBe(idle);
  const played = apply({ type: 'start', board, reduced_motion: true }, { type: 'compare_crowds', board });
  expect(played.run).not.toBeNull(); expect(played.crowds).not.toBeNull();
  const painted = [{ type: 'brush', side: 'sable' }, paint('D1')].reduce<RehearseState>((state, action) => reduceRehearse(state, action as RehearseAction), played);
  expect(painted.edits?.by).toEqual({ D1: 'sable' }); expect(painted.last_paint).toEqual({ id: 'D1', side: 'sable' });
  expect(painted.run).toBeNull(); expect(painted.turn).toBe(0); expect(painted.playing).toBe(false); expect(painted.crowds).toBeNull();
  expect(painted.past).toEqual(played.past); expect(painted.inputs).toEqual(played.inputs);
  expect(startBoard(board, painted.edits).tiles.filter((tile, index) => tile.side !== board.tiles[index]?.side)).toHaveLength(1);
  // Painting the same thing again is not an event.
  expect(reduceRehearse(painted, paint('D1'))).toBe(painted);
  expect(reduceRehearse(painted, { type: 'brush', side: null }).edits).toBe(painted.edits);
  expect(reduceRehearse(painted, { type: 'brush', side: null }).brush).toBeNull();
});

test('restoring the sample drops every edit, and a run started on a redrawn start remembers how many tiles were repainted', () => {
  let state = [{ type: 'brush', side: 'tallow' }, paint('A1'), paint('A2'), { type: 'brush', side: '' }, paint('B1')]
    .reduce<RehearseState>((acc, action) => reduceRehearse(acc, action as RehearseAction), createRehearseState());
  expect(Object.keys(state.edits?.by ?? {})).toEqual(['A1', 'A2', 'B1']);
  const mine = startBoard(board, state.edits);
  state = reduceRehearse(state, { type: 'start', board: mine, reduced_motion: true });
  expect(state.run?.start).toBe(mine); expect(state.past[0]).toMatchObject({ edited: 3 });
  state = reduceRehearse(state, { type: 'restore_start' });
  expect(state.edits).toBeNull(); expect(state.run).toBeNull(); expect(state.past).toHaveLength(1);
  expect(reduceRehearse(state, { type: 'restore_start' })).toBe(state);
  expect(reduceRehearse(state, { type: 'start', board, reduced_motion: true }).past.at(-1)).toMatchObject({ edited: 0 });
});

test('Compare crowds plays the board at 30, 120 and 300 viewers with the seed and turns on the form, each equal to a lone run', () => {
  expect(crowdLevels).toEqual([30, 120, 300]);
  const compared = reduceRehearse(createRehearseState(), { type: 'compare_crowds', board });
  expect(compared.crowds?.lines.map(line => line.viewers)).toEqual([30, 120, 300]);
  expect(compared.crowds).toMatchObject({ seed: '2041', turns: 8, columns: 9, rows: 6, tiles: 54, edited: 0 });
  for (const line of compared.crowds?.lines ?? []) {
    const lone = runRehearsal(board, { ...rehearsalDefaults, viewers: line.viewers });
    if (!lone.ok) throw new Error('lone run failed');
    const report = balanceReport(lone.rehearsal);
    expect(line).toMatchObject({ verdict: report.verdict, kind: report.kind, percent: report.leader.percent, last_change: report.last_change });
    expect(line.board).toEqual(lone.rehearsal.turns.at(-1)?.board);
  }
  // The crowd changes the story, which is the whole point of the table.
  expect(new Set(compared.crowds?.lines.map(line => line.verdict)).size).toBeGreaterThan(1);
  expect(compared.run).toBeNull(); expect(compared.past).toEqual([]);
  expect(compared.inputs.viewers).toBe('120');
  expect(reduceRehearse(compared, { type: 'reset' }).crowds).toBe(compared.crowds);
  expect(reduceRehearse(compared, { type: 'clear_crowds' }).crowds).toBeNull();
  const again = reduceRehearse(createRehearseState(), { type: 'compare_crowds', board });
  expect(again.crowds?.lines.map(line => line.verdict)).toEqual(compared.crowds?.lines.map(line => line.verdict));
});

test('Compare crowds follows seed and turns, refuses bad settings, and says when the start was redrawn', () => {
  const other = reduceRehearse(apply({ type: 'input', field: 'seed', value: '77' }, { type: 'input', field: 'turns', value: '5' }), { type: 'compare_crowds', board });
  expect(other.crowds).toMatchObject({ seed: '77', turns: 5 });
  for (const [field, value] of [['seed', ' '], ['turns', '1']] as const) {
    const bad = reduceRehearse(apply({ type: 'input', field, value }), { type: 'compare_crowds', board });
    expect(bad.crowds).toBeNull(); expect(bad.error?.field).toBe(field);
  }
  const drawn = [{ type: 'brush', side: 'sable' }, paint('D1'), paint('E1')]
    .reduce<RehearseState>((acc, action) => reduceRehearse(acc, action as RehearseAction), createRehearseState());
  const compared = reduceRehearse(drawn, { type: 'compare_crowds', board: startBoard(board, drawn.edits) });
  expect(compared.crowds?.edited).toBe(2);
  const solo = parseStudioBoard({ title: 'Solo', sides: board.sides.slice(0, 1), tiles: [{ q: 0, r: 0 }] });
  if (!solo.ok) throw new Error(solo.error.message);
  const refused = reduceRehearse(createRehearseState(), { type: 'compare_crowds', board: solo.board });
  expect(refused.crowds).toBeNull(); expect(refused.error?.message).toMatch(/at least two houses/);
});

test('a size choice that carries a redrawn start is marked in the size comparison', () => {
  const choices = sizeChoices.map(choice => (choice.id === 'm' ? { ...choice, edited: true } : choice));
  const compared = reduceRehearse(createRehearseState(), { type: 'compare_sizes', sizes: choices });
  expect(compared.sizes?.rows.map(row => [row.id, row.edited])).toEqual([['s', false], ['m', true], ['l', false]]);
});

test('choosing a brush pauses a round that is playing, and closing the palette leaves it as it is', () => {
  const playing = apply(start, ...ticks(2));
  expect(playing.playing).toBe(true);
  const painting = reduceRehearse(playing, { type: 'brush', side: 'sable' });
  expect(painting.playing).toBe(false); expect(painting.turn).toBe(2); expect(painting.run).toBe(playing.run);
  const resumed = reduceRehearse(painting, { type: 'resume' });
  expect(resumed.playing).toBe(true);
  expect(reduceRehearse(resumed, { type: 'brush', side: null }).playing).toBe(true);
});
