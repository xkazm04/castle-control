import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardGeometry } from './board.js';
import { rehearsalDefaults, runRehearsal } from './rehearsal.js';
import { TerritoryStrip, territorySeries, tickTurns } from './rehearse-strip.jsx';

const board = STUDIO_SAMPLE_BOARD;
const play = (turns = 8) => {
  const run = runRehearsal(board, { ...rehearsalDefaults, turns });
  if (!run.ok) throw new Error('rehearsal failed');
  return run.rehearsal;
};

test('the series has the start plus one column per turn, and every column accounts for every tile', () => {
  const run = play();
  const series = territorySeries(run);
  expect(series.columns.map(column => column.turn)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(series.total).toBe(54); expect(series.sides.map(side => side.short)).toEqual(['Quill', 'Tallow', 'Sable']);
  for (const column of series.columns) expect(column.held.reduce((sum, held) => sum + held, column.unclaimed), `turn ${column.turn}`).toBe(54);
  expect(series.columns[0]?.held).toEqual(boardGeometry(board).sides.map(side => side.count));
  const last = run.turns.at(-1);
  expect(series.columns.at(-1)?.held).toEqual(board.sides.map(side => last?.held[side.id]));
  expect(series.columns.at(-1)?.unclaimed).toBe(last?.unclaimed);
});

test('turn numbers are printed on the first, the last and a few columns between, whatever the length of the round', () => {
  expect([...tickTurns(8)]).toEqual([0, 2, 4, 6, 8]);
  expect([...tickTurns(24)]).toEqual([0, 6, 12, 18, 24]);
  expect([...tickTurns(2)]).toEqual([0, 1, 2]);
  expect(tickTurns(5).has(5)).toBe(true); expect(tickTurns(5).has(0)).toBe(true);
});

test('the strip fills in as turns are shown, and the numbers are there as a table, with a legend and a tooltip on every segment', () => {
  const run = play();
  const none = renderToStaticMarkup(<TerritoryStrip run={run} shown={0} />);
  expect(none.match(/data-shown="true"/g)).toHaveLength(1); expect(none.match(/data-shown="false"/g)).toHaveLength(8);
  expect(none).toContain('Territory by turn'); expect(none).toContain('turn 0 of 8');
  const three = renderToStaticMarkup(<TerritoryStrip run={run} shown={3} />);
  expect(three.match(/data-shown="true"/g)).toHaveLength(4); expect(three).toContain('data-now="true"');
  expect(three.match(/<tbody><tr>/g)).toHaveLength(1); expect(three.match(/<tr>/g)).toHaveLength(1 + 4);
  expect(three).toContain('<th scope="row">Start</th>'); expect(three).toContain('<th scope="row">Turn 3</th>');
  expect(three).not.toContain('<th scope="row">Turn 4</th>');
  for (const name of ['Quill', 'Tallow', 'Sable', 'Unclaimed']) expect(three).toContain(`</i>${name}</li>`);
  expect(three).toMatch(/title="Turn 3: (Quill|Tallow|Sable|Unclaimed) \d+ tiles? · \d+%"/);
  expect(three).toMatch(/title="Start: Quill 14 tiles · 26%"/);
  // The bars are a picture of the table, so a screen reader meets the table once.
  expect(three).toMatch(/<ol class="studio-strip-bars" aria-hidden="true">/); expect(three).toMatch(/<ul class="studio-strip-key" aria-hidden="true">/);
  expect(three).not.toContain('—');
});

test('segments are sized by tiles held, so the columns stack to the whole board', () => {
  const run = play();
  const html = renderToStaticMarkup(<TerritoryStrip run={run} shown={8} />);
  const columns = html.split('<li data-shown="true"').slice(1);
  expect(columns).toHaveLength(9);
  for (const [turn, column] of columns.entries()) {
    const grown = [...column.matchAll(/flex-grow:(\d+)/g)].map(match => Number(match[1]));
    expect(grown.reduce((sum, value) => sum + value, 0), `turn ${turn}`).toBe(54);
  }
});
