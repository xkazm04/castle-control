import { expect, test } from 'vitest';
import { hexSeed } from '@castle-control/keep-art';
import { band, claimPaints, curve, cycleHex, draw, initialClaims, readLine, tallyHex } from './toys.ts';

test('simulated draw golden: lanterns is decided by FNV-1a before animation', () => {
  expect(draw('lanterns')).toEqual({ seed: 'lanterns', index: 8, winner: 'cindergate44',
    proof: 'FNV-1a("lanterns") = 7e90abd4 → lot 09 of 12' });
  expect(draw('  LANTERNS  ')).toEqual(draw('lanterns'));
  expect(draw(' \t\n')).toEqual({ refusal: 'Type a seed word first.' });
});

test('draw is deterministic and only truncates the seed in the proof', () => {
  for (const seed of ['lanterns', 'banner', '🕯️', 'a'.repeat(40)]) expect(draw(seed)).toEqual(draw(seed));
  const result = draw('a'.repeat(40));
  if ('refusal' in result) throw new Error('Missing simulated draw');
  expect(result.seed).toHaveLength(40);
  expect(result.proof).toContain(`("${'a'.repeat(16)}")`);
});

test.each(['https://sample.test/path', 'http://sample.test', 'www.sample.test', 'example.com', 'EXAMPLE.NET', 'site.org', 'site.gg', 'site.tv', 'site.io'])('simulated line holds link %s', (line) => {
  expect(readLine(line)).toEqual({ verdict: 'HELD', reason: 'Sample rule: links wait for a moderator’s review.' });
});

test.each(['free followers', 'BUY VIEWS', 'a scam here', 'cheap viewers'])('simulated line holds blocked term %s', (line) => {
  expect(readLine(line)).toEqual({ verdict: 'HELD', reason: 'Sample rule: blocked term, quoted for human review.' });
});

test('simulated shouting includes exactly 70% and needs six letters; repetition needs six characters', () => {
  expect(readLine('ABCDEFGhij').verdict).toBe('HELD');
  expect(readLine('ABCDEFghij').verdict).toBe('PASS');
  expect(readLine('ABCDE').verdict).toBe('PASS');
  expect(readLine('ABCDEF').reason).toContain('shouting');
  expect(readLine('aaaaaa').reason).toContain('repeated characters');
  expect(readLine('aaaaa').verdict).toBe('PASS');
  expect(readLine('hello keep')).toEqual({ verdict: 'PASS', reason: 'No sample rule matched. It would pass to chat.' });
  expect(readLine('  ')).toEqual({ verdict: 'HELD', reason: 'Type a line first.' });
});

test('sample rules preserve links, blocked terms, shouting, repetition precedence', () => {
  expect(readLine('SCAM AAAAAA example.com').reason).toContain('links');
  expect(readLine('SCAM AAAAAA').reason).toContain('blocked term');
  expect(readLine('AAAAAA').reason).toContain('shouting');
});

test.each([
  [0, 0, 'band 0–10 → 0–25%'], [10, 25, 'band 0–10 → 0–25%'],
  [18, 39, 'band 10–30 → 25–60%'], [30, 60, 'band 10–30 → 25–60%'],
  [100, 100, 'band 30–100 → 60–100%'], [120, 100, 'band 100+ → 100%'],
] as const)('kindling at %s is %s percent, %s', (n, percent, label) => {
  expect(curve(n)).toBe(percent); expect(band(n)).toBe(label);
});

test('sample hex cycle, tally and initial seed mapping match the drawing paints', () => {
  expect([cycleHex(0), cycleHex(1), cycleHex(2), cycleHex(3)]).toEqual([1, 2, 3, 0]);
  expect(tallyHex([0, 1, 1, 2, 3, 3, 3])).toEqual([2, 1, 3]);
  const claims = initialClaims();
  expect(claims).toHaveLength(45);
  expect(claims).toEqual(hexSeed.map((c) => [0, 2, 3, 1][c]));
  expect(claims.slice(0, 6)).toEqual([0, 2, 2, 3, 0, 1]);
  expect(claimPaints).toEqual(['art-paper', 'art-gules', 'art-azure', 'art-or']);
  claims[0] = 1; expect(initialClaims()[0]).toBe(0);
});
