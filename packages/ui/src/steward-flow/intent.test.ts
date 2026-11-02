import { expect, test } from 'vitest';
import { defineFlow } from './flow.js';
import { matchIntent, normalize, phraseScore } from './intent.js';
import { awayChips, chamberChips } from './registry.js';
import type { ChamberSteward, StewardRegistry } from './registry.js';

const flow = (id: string, chamber: 'keep' | 'lottery' | 'moderator', title: string, intents: string[], chip?: string) => defineFlow({
  id, chamber, title, intents, ...(chip ? { chip } : {}), initial: () => ({}), steps: [], seal: () => ({ say: 'ok' }),
});
const empty: ChamberSteward = { name: 'nowhere', greeting: 'hi', flows: [] };
const registry: StewardRegistry = {
  keep: { name: 'the Keep', greeting: 'Good evening.', flows: [flow('theme', 'keep', "Pick tonight's theme", ['theme', 'tonight'], "Pick tonight's theme")],
    catch_up: () => ({ say: 'All quiet.' }) },
  lottery: { name: 'the Lot Chamber', greeting: 'Lots.', keywords: ['raffle', 'lottery'],
    flows: [flow('draw', 'lottery', 'Set up a draw', ['draw', 'giveaway'], 'Set up a draw')],
    demo: flow('lottery-demo', 'lottery', 'Lottery demo', []), catch_up: () => ({ say: 'No draw.' }) },
  moderator: { name: 'the Gatehouse', greeting: 'Gate.', keywords: ['ban', 'vote', 'timeout'], flows: [flow('rule', 'moderator', 'Add a rule', ['rule', 'block word'])] },
  visuals: { ...empty, name: 'the Beacons', keywords: ['beacon'] },
  studio: { ...empty, name: 'the Map Room', keywords: ['duel', 'bracket'] },
  stream: empty, rehearsal: empty,
};

test('normalize and phrase scoring tolerate case, punctuation and plurals', () => {
  expect(normalize("  Set up a DRAW, please! ")).toEqual(['set', 'up', 'a', 'draw', 'please']);
  expect(phraseScore(normalize('two giveaways tonight'), 'giveaway')).toBe(1);
  expect(phraseScore(normalize('drawing room'), 'draw')).toBe(1);
  expect(phraseScore(normalize('withdrawal'), 'draw')).toBe(0);
  expect(phraseScore(normalize('word block'), 'block word')).toBe(0);
  expect(phraseScore(normalize('block that word'), 'block word')).toBe(2);
});

test('flows match by intent, chip or title; the current chamber wins ties', () => {
  expect(matchIntent('start a giveaway', registry, 'lottery')).toMatchObject({ kind: 'flow', chamber: 'lottery', flow: 'draw' });
  expect(matchIntent('start a giveaway', registry, 'keep')).toMatchObject({ kind: 'flow', chamber: 'lottery', flow: 'draw' });
  expect(matchIntent("pick tonight's theme", registry, 'keep')).toMatchObject({ kind: 'flow', flow: 'theme' });
  expect(matchIntent('please block this word', registry, 'keep')).toMatchObject({ kind: 'flow', chamber: 'moderator', flow: 'rule' });
});

test('demo and catch-up phrases come first; demo falls back to a chamber named in the text', () => {
  expect(matchIntent('play demo', registry, 'lottery')).toMatchObject({ kind: 'demo', chamber: 'lottery' });
  expect(matchIntent('demo the raffle', registry, 'keep')).toMatchObject({ kind: 'demo', chamber: 'lottery' });
  expect(matchIntent('Catch me up', registry, 'keep')).toMatchObject({ kind: 'catch_up', chamber: 'keep' });
  expect(matchIntent('what did I miss?', registry, 'lottery')).toMatchObject({ kind: 'catch_up', chamber: 'lottery' });
});

test('chamber keywords point at a chamber; nonsense matches nothing', () => {
  expect(matchIntent('ban that troll', registry, 'keep')).toMatchObject({ kind: 'chamber', chamber: 'moderator' });
  expect(matchIntent('start a duel', registry, 'keep')).toMatchObject({ kind: 'chamber', chamber: 'studio' });
  expect(matchIntent('hello there', registry, 'keep')).toBeNull();
  expect(matchIntent('   ', registry, 'keep')).toBeNull();
});

test('quick chips: chamber flows, then Play demo, then Catch me up, capped', () => {
  expect(chamberChips('lottery', registry.lottery).map(chip => chip.label)).toEqual(['Set up a draw', 'Play demo', 'Catch me up']);
  expect(chamberChips('lottery', registry.lottery, 2).map(chip => chip.label)).toEqual(['Play demo', 'Catch me up']);
  expect(chamberChips('stream', registry.stream)).toEqual([]);
});

test('away chips lead with navigation and drop the other chamber\'s catch-up', () => {
  expect(awayChips('lottery', registry.lottery).map(chip => chip.label)).toEqual(['Go to Lot Chamber', 'Set up a draw', 'Play demo']);
  expect(awayChips('lottery', registry.lottery)[0]?.action).toEqual({ kind: 'go', chamber: 'lottery' });
});

test('"how does the giveaway work" opens the named chamber\'s demo, even from another chamber', () => {
  expect(matchIntent('how does the raffle work', registry, 'moderator')).toMatchObject({ kind: 'demo', chamber: 'lottery' });
  expect(matchIntent('how does it work', registry, 'lottery')).toMatchObject({ kind: 'demo', chamber: 'lottery' });
});

test('a chamber hint answers a phrase no flow covers, in plain words', () => {
  const hinted: StewardRegistry = { ...registry, moderator: { ...registry.moderator, hints: [{ phrases: ['ban'], say: 'Bans start from a held line.' }] } };
  expect(matchIntent('ban someone', hinted, 'lottery')).toMatchObject({ kind: 'chamber', chamber: 'moderator', hint: 'Bans start from a held line.' });
});
