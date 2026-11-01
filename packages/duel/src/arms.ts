/** Heraldic data from .port/winner/duel-engine.js, contest cc-t2-duel A/1. */
import { fnv } from './random.js';

export type Ink = 'gules' | 'azure' | 'or' | 'sable' | 'argent' | 'vert';
const COLOURS = ['gules', 'azure', 'sable', 'vert', 'gules', 'azure'] as const;
const METALS = ['or', 'argent', 'or'] as const;
const DIVISIONS = ['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'chief'] as const;
const CHARGES = ['tower', 'mullet', 'crescent', 'key', 'crown', 'roundel', 'lozenge', 'cross', 'bell', 'flame'] as const;
export type Division = typeof DIVISIONS[number];
export type Charge = typeof CHARGES[number];
export interface Arms {
  readonly field: Ink;
  readonly second: Ink;
  readonly division: Division;
  readonly charge: Charge;
  readonly charge_ink: Ink;
  readonly backing: boolean;
}

export function arms(title: string): Arms {
  const h = fnv(title.trim().toLowerCase());
  const colour = COLOURS[h % COLOURS.length]!;
  const metal = METALS[(h >>> 5) % METALS.length]!;
  const division = DIVISIONS[(h >>> 9) % DIVISIONS.length]!;
  const charge = CHARGES[(h >>> 14) % CHARGES.length]!;
  const swap = ((h >>> 20) & 1) === 1;
  const field = swap ? metal : colour;
  const second = swap ? colour : metal;
  return { field, second, division, charge, charge_ink: second, backing: division !== 'plain' };
}

export const SHIELD_PATH = 'M6 6H94V58C94 86 74 104 50 114C26 104 6 86 6 58Z';
export const BACKING_PATH = 'M50 38a20 20 0 1 1 -0.1 0Z';
export function chargePath(kind: Charge): string {
  switch (kind) {
    case 'tower': return 'M36 40h6v6h5v-6h6v6h5v-6h6v38H36ZM46 78v-10a4 4 0 0 1 8 0v10Z';
    case 'mullet': {
      let path = '';
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 ? 8 : 19;
        path += (i ? 'L' : 'M') + (50 + radius * Math.cos(angle)).toFixed(1) + ' ' + (58 + radius * Math.sin(angle)).toFixed(1);
      }
      return path + 'Z';
    }
    case 'crescent': return 'M42 38a20 20 0 1 0 22 34a16 16 0 1 1 -22 -34Z';
    case 'key': return 'M50 36a9 9 0 1 1 -0.1 0ZM50 41a4 4 0 1 0 0.1 0ZM47 53h6v26h7v5h-7v4h-6Z';
    case 'crown': return 'M32 72L34 46L42 58L50 42L58 58L66 46L68 72Z';
    case 'roundel': return 'M50 40a18 18 0 1 1 -0.1 0Z';
    case 'lozenge': return 'M50 36L66 58L50 80L34 58Z';
    case 'cross': return 'M45 38h10v15h15v10H55v19H45V63H30V53h15Z';
    case 'bell': return 'M50 38c-10 0-14 8-14 18v10l-5 6h38l-5-6V56c0-10-4-18-14-18ZM45 75h10a5 5 0 0 1-10 0Z';
    case 'flame': return 'M50 36c4 10 14 14 14 26a14 14 0 0 1-28 0c0-7 4-10 6-14c1 6 4 8 6 8c-2-8 0-14 2-20Z';
  }
}
export function divisionPath(kind: Division): string {
  switch (kind) {
    case 'pale': return 'M50 0H100V120H50Z';
    case 'fess': return 'M0 58H100V120H0Z';
    case 'bend': return 'M0 0H22L100 92V120H78L0 28Z';
    case 'chevron': return 'M0 92L50 44L100 92V120L50 72L0 120Z';
    case 'quarterly': return 'M50 0H100V58H50ZM0 58H50V120H0Z';
    case 'saltire': return 'M0 0H16L50 40L84 0H100V14L62 58L100 102V120H84L50 76L16 120H0V102L38 58L0 14Z';
    case 'chief': return 'M0 0H100V30H0Z';
    case 'plain': return '';
  }
}
export function blazon(title: string): string {
  const a = arms(title);
  return `${a.field} ${a.division === 'plain' ? '' : `and ${a.second} ${a.division}, `}a ${a.charge}`.replace(/\s+/g, ' ');
}
