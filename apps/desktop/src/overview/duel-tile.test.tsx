import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { duelCard, DuelTile, sampleDuelCard } from './duel-tile.jsx';
import { StreamScene } from './scene.jsx';
import type { DuelPicture } from '../rooms/studio/duel-model.js';

const picture = (over: Pick<Partial<DuelPicture>, 'phase' | 'counts'> = {}): DuelPicture => ({
  source: 'fixture', simulated: true, demo: false, phase: 'live', title: 'SIMULATED mill question', round: 0, index: 0, match: 1, matches: 3,
  left: { id: 'a', title: 'Raze the mill', seed: 1 }, right: { id: 'b', title: 'Borrow the mill', seed: 4 },
  counts: [3, 1], window_ms: 15_000, elapsed_ms: 0, speed: 1,
  rounds: [[{ a: 'a', b: 'b', winner: null }, { a: 'c', b: 'd', winner: null }], [{ a: null, b: null, winner: null }]], entrants: {}, can_undo: false,
  ...over,
});

test('before the Map Room mounts the tile shows the sample match with illustrative shares, SIMULATED', () => {
  expect(duelCard(undefined)).toBe(sampleDuelCard);
  const html = renderToStaticMarkup(<DuelTile card={sampleDuelCard} />);
  for (const text of ['Semifinal', 'Raze the mill', 'Borrow the mill', '58%', '42%', 'Simulated', 'Illustrative shares']) expect(html).toContain(text);
});

test('a running duel reads its own pair and tally; an empty one says so', () => {
  expect(duelCard(picture())).toEqual({ round: 'Semifinal', left: 'Raze the mill', right: 'Borrow the mill', share: 0.75, simulated: true, illustrative: false });
  expect(duelCard(picture({ counts: [0, 0] }))?.share).toBe(0.5);
  expect(duelCard(picture({ phase: 'empty' }))).toBeUndefined();
  expect(renderToStaticMarkup(<DuelTile card={null} />)).toContain('No duel running');
  expect(renderToStaticMarkup(<DuelTile card={duelCard(picture()) ?? null} />)).not.toContain('Illustrative shares');
});

test('the overview preview frames the Map Room as a chat duel, never the hex war table', () => {
  const html = renderToStaticMarkup(<StreamScene mode="preview" proposals={[]} sample />);
  expect(html).toContain('<b>Chat duel</b>'); expect(html).toContain('overview-duel');
  expect(html).not.toMatch(/war table|Illustrative layout/i);
});
