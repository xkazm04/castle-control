import { expect, test } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import type { Rehearsal, RehearsalTurn, TilePicks } from './rehearsal.js';
import { balanceReport } from './rehearsal-verdict.js';

type Spec = Readonly<{ held: readonly [number, number, number]; changed?: readonly string[]; picks?: readonly TilePicks[] }>;
type HouseId = 'quill' | 'tallow' | 'sable';
const pick = (id: string, by: Partial<Record<HouseId, number>>): TilePicks =>
  ({ id, q: 0, r: 0, by: { quill: by.quill ?? 0, tallow: by.tallow ?? 0, sable: by.sable ?? 0 } });

/** Hand-built rounds over the sample board: the verdict reads only held counts, changes and picks. */
function round(specs: readonly Spec[]): Rehearsal {
  const turns = specs.map((spec, index): RehearsalTurn => ({
    turn: index + 1, actions: [], picks: spec.picks ?? [],
    changes: (spec.changed ?? []).map(id => ({ id, to: 'sable' })), took: { quill: 0, tallow: 0, sable: 0 },
    held: { quill: spec.held[0], tallow: spec.held[1], sable: spec.held[2] },
    unclaimed: 54 - spec.held[0] - spec.held[1] - spec.held[2], board: STUDIO_SAMPLE_BOARD, signature: String(index),
  }));
  return { setup: { seed: 'x', viewers: 120, turns: specs.length }, start: STUDIO_SAMPLE_BOARD, turns };
}
const still = (held: Spec['held'], count: number): Spec[] => Array.from({ length: count }, () => ({ held }));

test('a house over half the board is a runaway, in the words a streamer can say aloud', () => {
  const report = balanceReport(round([{ held: [11, 10, 33], changed: ['A1'] }, ...still([11, 10, 33], 7)]));
  expect(report.verdict).toBe('House Sable holds 61%, runaway');
  expect(report.kind).toBe('runaway');
  expect(report.leader.id).toBe('sable');
  expect(report.shares.map(share => share.percent)).toEqual([61, 20, 19]);
  expect(report.margin).toBe(41);
  expect(report.reading).toMatch(/snowballs/);
});

test('a board that stops changing is a stalemate by the turn it last changed', () => {
  const report = balanceReport(round([
    { held: [18, 17, 16], changed: ['A1'] }, { held: [18, 18, 16], changed: ['B1'] }, { held: [19, 18, 16], changed: ['C1'] },
    { held: [19, 18, 17], changed: ['D1'] }, { held: [19, 19, 17], changed: ['E1'] }, ...still([19, 19, 17], 3),
  ]));
  expect(report.verdict).toBe('Stalemate by turn 5');
  expect(report.kind).toBe('stalemate'); expect(report.last_change).toBe(5);
  expect(balanceReport(round(still([18, 18, 18], 8))).verdict).toBe('Stalemate: no tile ever changed owner');
  // One quiet turn is not yet a stalemate.
  expect(balanceReport(round([{ held: [18, 18, 18], changed: ['A1'] }, ...still([18, 18, 18], 1)])).kind).not.toBe('stalemate');
});

test('close shares are a tight race and a clear but unfinished lead is contested', () => {
  const tight = balanceReport(round(Array.from({ length: 4 }, (_, index) => ({ held: [19, 18, 17] as const, changed: [`A${index}`] }))));
  expect(tight.verdict).toBe('Tight race: Quill 35%, Tallow 33%, Sable 31%');
  expect(tight.kind).toBe('tight');
  const contested = balanceReport(round(Array.from({ length: 4 }, (_, index) => ({ held: [25, 15, 14] as const, changed: [`A${index}`] }))));
  expect(contested.verdict).toBe('House Quill leads with 46%, still contested');
  expect(contested.kind).toBe('contested');
});

test('shares count every tile, so unclaimed land shows and the percentages need not reach 100', () => {
  const report = balanceReport(round([{ held: [10, 10, 10], changed: ['A1'] }, { held: [10, 10, 10], changed: ['A2'] }]));
  expect(report.total).toBe(54); expect(report.unclaimed).toBe(24); expect(report.unclaimed_percent).toBe(44);
  expect(report.shares.reduce((sum, share) => sum + share.percent, 0) + report.unclaimed_percent).toBeGreaterThanOrEqual(99);
});

test('lead changes count only a new sole leader, and ties never count as a change', () => {
  const report = balanceReport(round([
    { held: [14, 14, 15], changed: ['A1'] }, { held: [16, 14, 15], changed: ['A2'] }, { held: [16, 16, 15], changed: ['A3'] },
    { held: [16, 14, 17], changed: ['A4'] },
  ]));
  expect(report.lead_changes).toBe(2); // sable -> quill -> (tie, ignored) -> sable
});

test('chokepoints are tiles picked by two houses in two or more turns', () => {
  const fight = pick('D4', { sable: 2, quill: 2 });
  const report = balanceReport(round([
    { held: [14, 14, 15], changed: ['A1'], picks: [fight, pick('A1', { quill: 3 })] },
    { held: [14, 14, 16], changed: ['A2'], picks: [fight, pick('E2', { sable: 1, tallow: 1 })] },
    { held: [14, 14, 16], picks: [pick('E2', { tallow: 2 }), pick('D4', { sable: 1 })] },
  ]));
  expect(report.chokepoints).toBe(1);
});

test('a partial report reads only the turns shown, and turn zero is the starting territory', () => {
  const full = round([{ held: [14, 14, 16], changed: ['A1'] }, { held: [12, 14, 28], changed: ['A2'] }]);
  expect(balanceReport(full, 1).shares.map(share => share.held)).toEqual([16, 14, 14]);
  expect(balanceReport(full, 1).through).toBe(1); expect(balanceReport(full, 1).of).toBe(2);
  const start = balanceReport(full, 0);
  expect(start.shares.map(share => share.held)).toEqual([15, 14, 14]);
  expect(start.last_change).toBe(0); expect(start.lead_changes).toBe(0);
});
