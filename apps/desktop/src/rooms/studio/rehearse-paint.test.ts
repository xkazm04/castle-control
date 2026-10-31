import { expect, test } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardForSize } from './session.js';
import { boardGeometry, parseStudioBoard } from './board.js';
import { rehearsalDefaults, runRehearsal } from './rehearsal.js';
import { paintEdits, repainted, startBoard } from './rehearse-paint.js';

const board = STUDIO_SAMPLE_BOARD;
const ids = boardGeometry(board).tiles;
const sideOf = (id: string) => ids.find(tile => tile.id === id)?.side?.id ?? '';

test('painting one tile changes only that tile of the start board, and the board is a freshly parsed, frozen one', () => {
  const edits = paintEdits(null, board, 'D1', 'sable');
  const painted = startBoard(board, edits);
  expect(painted).not.toBe(board); expect(Object.isFrozen(painted)).toBe(true); expect(Object.isFrozen(painted.tiles)).toBe(true);
  expect(sideOf('D1')).toBe('quill');
  const changed = board.tiles.flatMap((tile, index) => (painted.tiles[index]?.side !== tile.side ? [ids[index]?.id] : []));
  expect(changed).toEqual(['D1']);
  expect(painted.tiles.map(tile => [tile.q, tile.r])).toEqual(board.tiles.map(tile => [tile.q, tile.r]));
  expect(painted.sides).toEqual(board.sides); expect(painted.title).toBe(board.title);
  expect(boardGeometry(painted).tiles.find(tile => tile.id === 'D1')?.side?.id).toBe('sable');
  expect(parseStudioBoard(painted).ok).toBe(true);
  expect(repainted(edits, board)).toBe(1);
});

test('a tile can be cleared to unclaimed, and painting a tile back to what it was removes the edit', () => {
  const cleared = paintEdits(null, board, 'A1', '');
  expect(startBoard(board, cleared).tiles[0]).toEqual({ q: board.tiles[0]?.q, r: board.tiles[0]?.r });
  expect('side' in (startBoard(board, cleared).tiles[0] ?? {})).toBe(false);
  expect(repainted(cleared, board)).toBe(1);
  const back = paintEdits(cleared, board, 'A1', 'quill');
  expect(back).toBeNull(); expect(startBoard(board, back)).toBe(board); expect(repainted(back, board)).toBe(0);
  const two = paintEdits(paintEdits(null, board, 'A1', 'sable'), board, 'B1', '');
  expect(repainted(two, board)).toBe(2);
  expect(repainted(paintEdits(two, board, 'A1', 'quill'), board)).toBe(1);
});

test('a paint that changes nothing, or names an unknown tile or house, returns the same edits', () => {
  const edits = paintEdits(null, board, 'D1', 'sable');
  expect(paintEdits(edits, board, 'D1', 'sable')).toBe(edits);
  expect(paintEdits(edits, board, 'Z99', 'sable')).toBe(edits);
  expect(paintEdits(edits, board, 'D1', 'house-of-nobody')).toBe(edits);
  expect(paintEdits(null, board, 'A1', 'quill')).toBeNull();
  expect(paintEdits(null, board, 'A1', 'nobody')).toBeNull();
});

test('edits belong to the board they were made on: another board ignores them and starts fresh', () => {
  const edits = paintEdits(null, board, 'D1', 'sable');
  const small = boardForSize('s');
  expect(startBoard(small, edits)).toBe(small); expect(repainted(edits, small)).toBe(0);
  const fresh = paintEdits(edits, small, 'A1', '');
  expect(fresh?.base).toBe(small); expect(Object.keys(fresh?.by ?? {})).toEqual(['A1']);
});

test('a rehearsal plays the redrawn start: same seed, same round, and the verdict follows the board', () => {
  let edits = null as ReturnType<typeof paintEdits>;
  for (const id of ['D1', 'E1', 'F1', 'D2', 'E2']) edits = paintEdits(edits, board, id, 'sable');
  const painted = startBoard(board, edits);
  const first = runRehearsal(painted, rehearsalDefaults); const again = runRehearsal(painted, rehearsalDefaults);
  const plain = runRehearsal(board, rehearsalDefaults);
  if (!first.ok || !again.ok || !plain.ok) throw new Error('rehearsal failed');
  expect(first.rehearsal.turns.map(turn => turn.signature)).toEqual(again.rehearsal.turns.map(turn => turn.signature));
  expect(first.rehearsal.start).toBe(painted);
  expect(first.rehearsal.turns.map(turn => turn.signature)).not.toEqual(plain.rehearsal.turns.map(turn => turn.signature));
  // Only picked tiles ever change owner, on the redrawn board as on any other.
  let owner = painted.tiles.map(tile => tile.side ?? '');
  for (const turn of first.rehearsal.turns) {
    const picked = new Set(turn.picks.map(pick => pick.id));
    const now = turn.board.tiles.map(tile => tile.side ?? '');
    boardGeometry(painted).tiles.forEach((tile, index) => { if (now[index] !== owner[index]) expect(picked.has(tile.id)).toBe(true); });
    owner = now;
  }
});

test('a board painted down to one house still rehearses and never crashes or invents tiles', () => {
  let edits = null as ReturnType<typeof paintEdits>;
  for (const tile of ids) edits = paintEdits(edits, board, tile.id, 'quill');
  const painted = startBoard(board, edits);
  expect(boardGeometry(painted).sides.map(side => side.count)).toEqual([54, 0, 0]);
  const run = runRehearsal(painted, rehearsalDefaults);
  if (!run.ok) throw new Error('rehearsal failed');
  expect(run.rehearsal.turns.every(turn => turn.changes.length === 0 && turn.board.tiles.length === 54)).toBe(true);
});
