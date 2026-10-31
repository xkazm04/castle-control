import { fnv1a, hex8, hexPaints, hexSeed, lotHandles } from '@castle-control/keep-art';

export type Draw = Readonly<{ seed: string; index: number; winner: string; proof: string }>;

export function draw(input: string): Draw | { refusal: string } {
  const seed = input.trim().toLowerCase();
  if (!seed) return { refusal: 'Type a seed word first.' };
  const hash = fnv1a(seed), index = hash % 12;
  return { seed, index, winner: lotHandles[index]!,
    proof: `FNV-1a("${seed.slice(0, 16)}") = ${hex8(hash)} → lot ${String(index + 1).padStart(2, '0')} of 12` };
}

export function readLine(input: string): { verdict: 'PASS' | 'HELD'; reason: string } {
  const text = input.trim();
  let reason: string | undefined;
  const letters = text.replace(/[^a-z]/gi, '');
  const capitals = text.replace(/[^A-Z]/g, '').length;
  if (!text) reason = 'Type a line first.';
  else if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gg|tv|io)\b)/i.test(text)) {
    reason = 'Sample rule: links wait for a moderator’s review.';
  } else if (/\b(free followers|buy views|scam|cheap viewers)\b/i.test(text)) {
    reason = 'Sample rule: blocked term, quoted for human review.';
  } else if (letters.length >= 6 && capitals / letters.length >= .7) {
    reason = 'Sample rule: shouting (mostly capitals) is held, not banned.';
  } else if (/(.)\1{5,}/.test(text)) reason = 'Sample rule: repeated characters are held for review.';
  return reason === undefined
    ? { verdict: 'PASS', reason: 'No sample rule matched. It would pass to chat.' }
    : { verdict: 'HELD', reason };
}

export function curve(n: number): number {
  if (n <= 10) return n / 10 * 25;
  if (n <= 30) return 25 + (n - 10) / 20 * 35;
  if (n <= 100) return 60 + (n - 30) / 70 * 40;
  return 100;
}

export function band(n: number): string {
  return n <= 10 ? 'band 0–10 → 0–25%' : n <= 30 ? 'band 10–30 → 25–60%'
    : n <= 100 ? 'band 30–100 → 60–100%' : 'band 100+ → 100%';
}

export type Claim = 0 | 1 | 2 | 3;
export const houses = ['open ground', 'House Gules', 'House Azure', 'House Or'] as const;
const seedClaims = [0, 2, 3, 1] as const;
export const claimPaints = [hexPaints[0], hexPaints[3], hexPaints[1], hexPaints[2]] as const;
export function initialClaims(): Claim[] { return hexSeed.map((colour) => seedClaims[colour]); }
export function cycleHex(claim: Claim): Claim { return ([1, 2, 3, 0] as const)[claim]; }
export function tallyHex(claims: readonly Claim[]): readonly [number, number, number] {
  return [1, 2, 3].map((house) => claims.filter((claim) => claim === house).length) as [number, number, number];
}
