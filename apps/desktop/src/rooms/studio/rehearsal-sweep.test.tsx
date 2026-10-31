import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { parseStudioBoard } from './board.js';
import { nextSeed, rehearsalDefaults, runRehearsal } from './rehearsal.js';
import { sweepBoard, sweepRounds, sweepSeeds } from './rehearsal-sweep.js';
import { balanceReport } from './rehearsal-verdict.js';
import { CrowdTable, SizeTable } from './rehearse-side.jsx';
import { createRehearseState, reduceRehearse, sizeChoices } from './rehearse-state.js';

const board = STUDIO_SAMPLE_BOARD;
const sweep = (viewers: number) => {
  const found = sweepBoard(board, { ...rehearsalDefaults, viewers });
  if (!found) throw new Error('no sweep');
  return found;
};

test('a sweep starts with the setup seed and follows the same seed chain every time', () => {
  const seeds = sweepSeeds('2041');
  expect(seeds).toHaveLength(sweepRounds); expect(seeds[0]).toBe('2041'); expect(seeds[1]).toBe(nextSeed('2041'));
  expect(sweepSeeds('2041')).toEqual(seeds); expect(new Set(seeds).size).toBeGreaterThan(8);
  expect(sweepSeeds('7', 3)).toHaveLength(3);
});

test('a sweep counts how every round ended, most common first, and each count matches a lone round of that seed', () => {
  const found = sweep(120);
  expect(found.rounds).toBe(12);
  expect(found.kinds.reduce((sum, entry) => sum + entry.count, 0)).toBe(12);
  expect(found.kinds.map(entry => entry.count)).toEqual([...found.kinds.map(entry => entry.count)].sort((a, b) => b - a));
  const alone = new Map<string, number>();
  for (const seed of sweepSeeds('2041')) {
    const run = runRehearsal(board, { ...rehearsalDefaults, seed });
    if (!run.ok) throw new Error('lone run failed');
    const { kind } = balanceReport(run.rehearsal); alone.set(kind, (alone.get(kind) ?? 0) + 1);
  }
  expect(Object.fromEntries(found.kinds.map(entry => [entry.kind, entry.count]))).toEqual(Object.fromEntries(alone));
  expect(sweep(120)).toEqual(found);
});

test('the crowd changes the story on the sample board: 30 viewers mostly stall and 300 mostly run away', () => {
  expect(sweep(30).kinds[0]?.kind).toBe('stalemate');
  expect(sweep(300).kinds[0]?.kind).toBe('runaway');
  expect(sweep(120).kinds.length).toBeGreaterThan(1);
});

test('a board that cannot be rehearsed has no sweep', () => {
  const solo = parseStudioBoard({ title: 'Solo', sides: board.sides.slice(0, 1), tiles: [{ q: 0, r: 0 }] });
  if (!solo.ok) throw new Error(solo.error.message);
  expect(sweepBoard(solo.board, rehearsalDefaults)).toBeUndefined();
});

test('every comparison row carries its sweep, and the tables print it as one plain line', () => {
  const compared = reduceRehearse(reduceRehearse(createRehearseState(), { type: 'compare_crowds', board }), { type: 'compare_sizes', sizes: sizeChoices });
  const crowds = compared.crowds; const sizes = compared.sizes;
  if (!crowds || !sizes) throw new Error('no comparison');
  for (const line of crowds.lines) expect(line.sweep).toEqual(sweep(line.viewers));
  for (const row of sizes.rows) {
    const choice = sizeChoices.find(item => item.id === row.id);
    expect(row.sweep).toEqual(choice && sweepBoard(choice.board, rehearsalDefaults));
  }
  const crowdHtml = renderToStaticMarkup(<CrowdTable crowds={crowds} viewers={120} on_clear={vi.fn()} />);
  const sizeHtml = renderToStaticMarkup(<SizeTable sizes={sizes} current="m" on_clear={vi.fn()} />);
  expect(crowdHtml.match(/class="studio-spread"/g)).toHaveLength(3); expect(sizeHtml.match(/class="studio-spread"/g)).toHaveLength(3);
  for (const line of crowds.lines) {
    expect(crowdHtml).toContain(`Across 12 seeds: ${line.sweep.kinds.map(entry => `${entry.count}\u00a0${entry.kind}`).join(', ')}`);
  }
  expect(crowdHtml).toContain('Across 12 seeds: 9\u00a0stalemate, 3\u00a0tight');
  expect(crowdHtml).not.toContain('—'); expect(sizeHtml).not.toContain('—');
});
