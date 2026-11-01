/// <reference types="node" />
import { expect, test } from 'vitest';
import { arms, BACKING_PATH, blazon, chargePath, divisionPath, SHIELD_PATH } from './arms.js';
import { fnv, rng } from './random.js';
import { SAMPLE } from './sample.js';

// Independent winner maths; the winner file is evidence, never an import.
function winnerHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
test.each(SAMPLE.bracket.items)('arms match winner hash bits for $title', ({ title }) => {
  const h = winnerHash(title.trim().toLowerCase());
  const colour = ['gules', 'azure', 'sable', 'vert', 'gules', 'azure'][h % 6];
  const metal = ['or', 'argent', 'or'][(h >>> 5) % 3];
  const division = ['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'chief'][(h >>> 9) % 8];
  const charge = ['tower', 'mullet', 'crescent', 'key', 'crown', 'roundel', 'lozenge', 'cross', 'bell', 'flame'][(h >>> 14) % 10];
  const swap = ((h >>> 20) & 1) === 1;
  const field = swap ? metal : colour;
  const second = swap ? colour : metal;
  expect(arms(title)).toEqual({ field, second, division, charge, charge_ink: second, backing: division !== 'plain' });
  expect(arms(title)).toEqual(arms(` ${title.toUpperCase()} `));
  expect(blazon(title)).toBe(`${field} ${division === 'plain' ? '' : `and ${second} ${division}, `}a ${charge}`);
});

test('shield, backing, division and charge paths keep winner geometry', () => {
  expect(SHIELD_PATH).toBe('M6 6H94V58C94 86 74 104 50 114C26 104 6 86 6 58Z');
  expect(BACKING_PATH).toBe('M50 38a20 20 0 1 1 -0.1 0Z');
  expect(divisionPath('plain')).toBe('');
  expect(divisionPath('pale')).toBe('M50 0H100V120H50Z');
  expect(divisionPath('fess')).toBe('M0 58H100V120H0Z');
  expect(divisionPath('bend')).toBe('M0 0H22L100 92V120H78L0 28Z');
  expect(divisionPath('chevron')).toBe('M0 92L50 44L100 92V120L50 72L0 120Z');
  expect(divisionPath('quarterly')).toBe('M50 0H100V58H50ZM0 58H50V120H0Z');
  expect(divisionPath('saltire')).toBe('M0 0H16L50 40L84 0H100V14L62 58L100 102V120H84L50 76L16 120H0V102L38 58L0 14Z');
  expect(divisionPath('chief')).toBe('M0 0H100V30H0Z');
  expect(chargePath('tower')).toBe('M36 40h6v6h5v-6h6v6h5v-6h6v38H36ZM46 78v-10a4 4 0 0 1 8 0v10Z');
  expect(chargePath('mullet')).toBe('M50.0 39.0L54.7 51.5L68.1 52.1L57.6 60.5L61.2 73.4L50.0 66.0L38.8 73.4L42.4 60.5L31.9 52.1L45.3 51.5Z');
  expect(chargePath('crescent')).toBe('M42 38a20 20 0 1 0 22 34a16 16 0 1 1 -22 -34Z');
  expect(chargePath('key')).toBe('M50 36a9 9 0 1 1 -0.1 0ZM50 41a4 4 0 1 0 0.1 0ZM47 53h6v26h7v5h-7v4h-6Z');
  expect(chargePath('crown')).toBe('M32 72L34 46L42 58L50 42L58 58L66 46L68 72Z');
  expect(chargePath('roundel')).toBe('M50 40a18 18 0 1 1 -0.1 0Z');
  expect(chargePath('lozenge')).toBe('M50 36L66 58L50 80L34 58Z');
  expect(chargePath('cross')).toBe('M45 38h10v15h15v10H55v19H45V63H30V53h15Z');
  expect(chargePath('bell')).toBe('M50 38c-10 0-14 8-14 18v10l-5 6h38l-5-6V56c0-10-4-18-14-18ZM45 75h10a5 5 0 0 1-10 0Z');
  expect(chargePath('flame')).toBe('M50 36c4 10 14 14 14 26a14 14 0 0 1-28 0c0-7 4-10 6-14c1 6 4 8 6 8c-2-8 0-14 2-20Z');
});

test('FNV hashes UTF-16 code units and rng preserves winner arithmetic', () => {
  for (const value of ['', 'SAMPLE', 'Wyrmlight', 'Český 🏰']) expect(fnv(value)).toBe(winnerHash(value));
  for (const seed of [0, 1, -1, 0xffffffff, fnv('SAMPLE')]) {
    let a = seed >>> 0;
    const next = rng(seed);
    for (let i = 0; i < 100; i++) {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      expect(next()).toBe(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
  }
});
