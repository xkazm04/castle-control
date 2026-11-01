export function decide(counted: readonly [number, number], seed_a: number, seed_b: number): {
  side: 0 | 1; how: 'tally' | 'tie';
} {
  if (counted[0] !== counted[1]) return { side: counted[0] > counted[1] ? 0 : 1, how: 'tally' };
  return { side: seed_a <= seed_b ? 0 : 1, how: 'tie' };
}
