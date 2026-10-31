import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardGeometry, parseStudioBoard } from './board.js';
import type { StudioBoard } from './board.js';
import { boardForSize } from './session.js';
import { matchedTurns, nextSeed, parseRehearsalSetup, rehearsalDefaults, runRehearsal } from './rehearsal.js';
import type { Rehearsal, RehearsalSetup } from './rehearsal.js';
import { balanceReport } from './rehearsal-verdict.js';

function play(board: StudioBoard = STUDIO_SAMPLE_BOARD, setup: RehearsalSetup = rehearsalDefaults): Rehearsal {
  const run = runRehearsal(board, setup);
  if (!run.ok) throw new Error(run.error.message);
  return run.rehearsal;
}

test('the same board, seed and viewer count always play the same round', () => {
  const first = play(); const again = play();
  expect(again.turns.map(turn => turn.signature)).toEqual(first.turns.map(turn => turn.signature));
  expect(again.turns.map(turn => turn.actions)).toEqual(first.turns.map(turn => turn.actions));
  expect(again.turns.map(turn => turn.changes)).toEqual(first.turns.map(turn => turn.changes));
  expect(matchedTurns(first, again)).toBe(first.turns.length);
  const other = play(STUDIO_SAMPLE_BOARD, { ...rehearsalDefaults, seed: '2042' });
  expect(matchedTurns(first, other)).toBeLessThan(first.turns.length);
  const crowd = play(STUDIO_SAMPLE_BOARD, { ...rehearsalDefaults, viewers: 300 });
  expect(matchedTurns(first, crowd)).toBeLessThan(first.turns.length);
});

test('one snapshot per turn, each a validated frozen board, and the input board is untouched', () => {
  const before = JSON.stringify(STUDIO_SAMPLE_BOARD);
  const round = play();
  expect(round.turns).toHaveLength(rehearsalDefaults.turns);
  expect(round.turns.map(turn => turn.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  for (const turn of round.turns) {
    const reparsed = parseStudioBoard(JSON.parse(JSON.stringify(turn.board)));
    expect(reparsed.ok).toBe(true);
    expect(Object.isFrozen(turn.board)).toBe(true); expect(Object.isFrozen(turn.board.tiles)).toBe(true);
    expect(turn.board.tiles.map(tile => [tile.q, tile.r])).toEqual(STUDIO_SAMPLE_BOARD.tiles.map(tile => [tile.q, tile.r]));
    expect(turn.board.sides).toBe(STUDIO_SAMPLE_BOARD.sides);
  }
  expect(JSON.stringify(STUDIO_SAMPLE_BOARD)).toBe(before);
  expect(round.start).toBe(STUDIO_SAMPLE_BOARD);
});

test('only tiles that were picked in a turn can change owner in that turn', () => {
  for (const [size, viewers] of [['s', 30], ['m', 120], ['l', 300]] as const) {
    for (const seed of ['1', '2', '2041', 'a seed']) {
      const board = boardForSize(size); const round = play(board, { seed, viewers, turns: 12 });
      const geometry = boardGeometry(board);
      let previous = board;
      for (const turn of round.turns) {
        const picked = new Set(turn.picks.map(pick => pick.id));
        const changed = geometry.tiles.filter((tile, index) => turn.board.tiles[index]?.side !== previous.tiles[index]?.side)
          .map(tile => tile.id);
        expect(changed.sort()).toEqual(turn.changes.map(change => change.id).sort());
        for (const id of changed) expect(picked.has(id)).toBe(true);
        expect(turn.board.tiles.filter((tile, index) => tile.side === previous.tiles[index]?.side)).toHaveLength(board.tiles.length - changed.length);
        expect(Object.values(turn.took).reduce((sum, count) => sum + count, 0)).toBe(changed.length);
        previous = turn.board;
      }
    }
  }
});

test('simulated viewers emit only the closed join_side and pick_tile shapes, by value', () => {
  const round = play(STUDIO_SAMPLE_BOARD, { seed: '7', viewers: 60, turns: 4 });
  const sides = new Set(STUDIO_SAMPLE_BOARD.sides.map(side => side.id));
  const tiles = new Set(STUDIO_SAMPLE_BOARD.tiles.map(tile => `${tile.q},${tile.r}`));
  for (const turn of round.turns) {
    expect(turn.actions.filter(action => action.kind === 'join_side')).toHaveLength(60);
    let joined = false;
    for (const action of turn.actions) {
      if (action.kind === 'join_side') {
        expect(Object.keys(action).sort()).toEqual(['kind', 'side']); expect(sides.has(action.side)).toBe(true); joined = true;
      } else {
        expect(Object.keys(action).sort()).toEqual(['kind', 'q', 'r']); expect(tiles.has(`${action.q},${action.r}`)).toBe(true);
        expect(joined).toBe(true); // a pick always follows its viewer's join
      }
    }
    const picks = turn.actions.filter(action => action.kind === 'pick_tile').length;
    expect(turn.picks.reduce((sum, pick) => sum + Object.values(pick.by).reduce((a, b) => a + b, 0), 0)).toBe(picks);
  }
  // Mirror, not import: the room adds no dependency, wire identifier, clock or randomness.
  for (const file of ['rehearsal.ts', 'rehearsal-verdict.ts', 'rehearse-state.ts']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now|fetch\(|WebSocket|@castle-control\/(renderer|contract)/);
  }
});

test('ties between houses are settled by the seeded coin: both houses win some, and each seed always settles the same way', () => {
  const board = parseStudioBoard({ title: 'Coin', sides: [
    { id: 'a', label: 'House A', short: 'A', ink: 'gules' }, { id: 'b', label: 'House B', short: 'B', ink: 'azure' },
  ], tiles: [{ q: 0, r: 0, side: 'a' }, { q: 1, r: 0 }, { q: 2, r: 0, side: 'b' }] });
  if (!board.ok) throw new Error(board.error.message);
  const winners = new Set<string>();
  for (let seed = 1; seed <= 40; seed += 1) {
    const turn = play(board.board, { seed: String(seed), viewers: 10, turns: 2 }).turns[0];
    const middle = turn?.board.tiles[1]?.side;
    if (middle) winners.add(middle);
    expect(play(board.board, { seed: String(seed), viewers: 10, turns: 2 }).turns[0]?.board.tiles[1]?.side).toBe(middle);
  }
  expect([...winners].sort()).toEqual(['a', 'b']);
});

test('a board with fewer than two houses is refused, not simulated', () => {
  const solo = parseStudioBoard({ title: 'Solo', sides: [{ id: 'a', label: 'A', short: 'A', ink: 'key' }], tiles: [{ q: 0, r: 0 }] });
  if (!solo.ok) throw new Error(solo.error.message);
  const run = runRehearsal(solo.board, rehearsalDefaults);
  expect(run.ok).toBe(false);
  if (!run.ok) expect(run.error.code).toBe('invalid_rehearsal');
});

test('houses with no land muster on unclaimed tiles and an all-claimed board never runs out of moves', () => {
  const bare = parseStudioBoard({ title: 'Bare', sides: STUDIO_SAMPLE_BOARD.sides, tiles: STUDIO_SAMPLE_BOARD.tiles.map(tile => ({ q: tile.q, r: tile.r })) });
  if (!bare.ok) throw new Error(bare.error.message);
  const round = play(bare.board, { seed: '3', viewers: 90, turns: 6 });
  expect(round.turns[0]?.changes.length).toBeGreaterThan(0);
  const full = parseStudioBoard({ title: 'Full', sides: STUDIO_SAMPLE_BOARD.sides, tiles: STUDIO_SAMPLE_BOARD.tiles.map((tile, index) => ({ q: tile.q, r: tile.r, side: STUDIO_SAMPLE_BOARD.sides[index % 3]?.id })) });
  if (!full.ok) throw new Error(full.error.message);
  expect(play(full.board, { seed: '3', viewers: 90, turns: 6 }).turns).toHaveLength(6);
});

test('rounds are not boring: verdicts vary with the seed, and the crowd size changes the story', () => {
  const kinds = (size: 's' | 'm' | 'l', viewers: number) => {
    const found = new Map<string, number>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const kind = balanceReport(play(boardForSize(size), { seed: String(seed), viewers, turns: 8 })).kind;
      found.set(kind, (found.get(kind) ?? 0) + 1);
    }
    return found;
  };
  expect(kinds('m', 120).size).toBeGreaterThanOrEqual(3);
  expect(kinds('m', 30).get('stalemate') ?? 0).toBeGreaterThan(0);
  expect(kinds('m', 300).get('runaway') ?? 0).toBeGreaterThan(kinds('m', 30).get('runaway') ?? 0);
  expect(kinds('m', 120).get('runaway') ?? 0).toBeLessThan(24);
});

test('the setup door takes whole numbers inside the limits and a short seed, and nothing else', () => {
  expect(parseRehearsalSetup(rehearsalDefaults)).toEqual({ ok: true, setup: rehearsalDefaults });
  const typed = parseRehearsalSetup({ seed: '  abc ', viewers: '300', turns: ' 12 ' });
  expect(typed.ok && typed.setup).toEqual({ seed: 'abc', viewers: 300, turns: 12 });
  expect(typed.ok && Object.isFrozen(typed.setup)).toBe(true);
  for (const [value, field] of [
    [{ seed: '', viewers: 120, turns: 8 }, 'seed'], [{ seed: ' ', viewers: 120, turns: 8 }, 'seed'],
    [{ seed: 'x'.repeat(25), viewers: 120, turns: 8 }, 'seed'], [{ seed: 7, viewers: 120, turns: 8 }, 'seed'],
    [{ seed: 'a', viewers: 9, turns: 8 }, 'viewers'], [{ seed: 'a', viewers: 1001, turns: 8 }, 'viewers'],
    [{ seed: 'a', viewers: 1.5, turns: 8 }, 'viewers'], [{ seed: 'a', viewers: '12abc', turns: 8 }, 'viewers'],
    [{ seed: 'a', viewers: '', turns: 8 }, 'viewers'], [{ seed: 'a', viewers: -30, turns: 8 }, 'viewers'],
    [{ seed: 'a', viewers: Number.NaN, turns: 8 }, 'viewers'], [{ seed: 'a', viewers: 120, turns: 1 }, 'turns'],
    [{ seed: 'a', viewers: 120, turns: 25 }, 'turns'], [{ seed: 'a', viewers: 120 }, 'turns'],
    [{ seed: 'a', viewers: 120, turns: 8, bits: 5 }, 'seed'], [null, 'seed'], [[], 'seed'], ['a', 'seed'],
  ] as const) {
    const result = parseRehearsalSetup(value);
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.error.field).toBe(field); expect(result.error.code).toBe('invalid_rehearsal'); }
  }
});

test('Rehearse again draws a fresh seed from the last one without a clock, and it passes the door', () => {
  expect(nextSeed('2041')).toBe(nextSeed('2041'));
  expect(nextSeed('2041')).not.toBe('2041');
  expect(nextSeed(nextSeed('2041'))).not.toBe(nextSeed('2041'));
  expect(nextSeed('x')).toMatch(/^[1-9]\d{3}$/);
  expect(parseRehearsalSetup({ ...rehearsalDefaults, seed: nextSeed('x') }).ok).toBe(true);
});
