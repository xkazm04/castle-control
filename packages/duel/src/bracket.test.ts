/// <reference types="node" />
import { expect, test } from 'vitest';
import {
  currentMatch, finalOrder, matchNumber, pick, plannedRounds, roundName,
  startBracket, totalMatches, totalRounds,
} from './bracket.js';
import { SAMPLE } from './sample.js';

const seeds = SAMPLE.bracket.items.map((item) => item.id);

test.each(Array.from({ length: 128 }, (_, n) => n))('8 seeds, outcome %i: all seven picks are sound', (outcome) => {
  let bracket = startBracket(seeds)!;
  expect(totalRounds(bracket)).toBe(3);
  expect(totalMatches(bracket)).toBe(7);
  expect(bracket.rounds[0]!.map((match) => [seeds.indexOf(match.a) + 1, seeds.indexOf(match.b) + 1]))
    .toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
  expect(plannedRounds(bracket).map((round) => round.length)).toEqual([4, 2, 1]);
  expect(finalOrder(bracket)).toBeNull();
  for (let i = 0; i < 7; i++) {
    const cur = currentMatch(bracket)!;
    expect(cur).not.toBeNull();
    expect(matchNumber(bracket)).toBe(i + 1);
    expect(['Quarterfinal', 'Semifinal', 'Final']).toContain(roundName(bracket, cur.round));
    if ([cur.match.a, cur.match.b].includes(seeds[0]!) && [cur.match.a, cur.match.b].includes(seeds[1]!)) {
      expect(cur.round).toBe(2);
    }
    const before = structuredClone(bracket);
    const previous = bracket;
    bracket = pick(bracket, (outcome >>> i) & 1 ? cur.match.b : cur.match.a);
    expect(previous).toEqual(before);
  }
  expect(currentMatch(bracket)).toBeNull();
  expect(bracket.rounds.flat()).toHaveLength(7);
  const order = finalOrder(bracket)!;
  expect(seeds).toContain(order[0]);
  expect(order).toHaveLength(8);
  expect([...order].sort()).toEqual([...seeds].sort());
  expect(pick(bracket, seeds[0]!)).toBe(bracket);
});

test.each([[4, 4], [2, 2], [3, 2]] as const)('%i entrants use a %i-seed bracket', (n, size) => {
  let bracket = startBracket(seeds.slice(0, n))!;
  expect(bracket.seeds).toEqual(seeds.slice(0, size));
  expect(pick(bracket, SAMPLE.chat.items[0]!.id)).toBe(bracket);
  for (let i = 1; i < size; i++) {
    expect(matchNumber(bracket)).toBe(i);
    bracket = pick(bracket, currentMatch(bracket)!.match.a);
  }
  expect(finalOrder(bracket)).toEqual(seeds.slice(0, size));
  expect(plannedRounds(bracket).map((round) => round.length)).toEqual(size === 4 ? [2, 1] : [1]);
});

test('too few seeds cannot start, and the finished order breaks elimination ties by seed', () => {
  expect(startBracket([])).toBeNull();
  expect(startBracket(seeds.slice(0, 1))).toBeNull();
  let bracket = startBracket(seeds)!;
  while (currentMatch(bracket)) bracket = pick(bracket, currentMatch(bracket)!.match.a);
  expect(finalOrder(bracket)).toEqual(seeds);
  expect(startBracket([...seeds, ...SAMPLE.chat.items.map((item) => item.id)])!.seeds).toEqual(seeds);
});

test('planned tree carries recorded winners into future slots without changing the bracket', () => {
  const initial = startBracket(seeds)!;
  const one = pick(initial, seeds[0]!);
  const tree = plannedRounds(one);
  expect(tree[0]).toBe(one.rounds[0]);
  expect(tree[1]![0]).toEqual({ a: seeds[0], b: null, winner: null, planned: true });
  expect(tree[2]![0]).toEqual({ a: null, b: null, winner: null, planned: true });
  expect(initial.rounds[0]![0]!.winner).toBeNull();
});
