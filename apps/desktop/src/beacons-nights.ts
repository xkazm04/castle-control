import type { Offering } from './beacons-fixture.js';
import { fixtureOfferings } from './beacons-fixture.js';

/** Generated, fictional nights for tuning only. Seeded, so every run is identical.
 * No handle, amount or time here was recorded from a real channel. */
export type NightId = 'sample' | 'gift_wave' | 'raid_spike' | 'sub_train';
export type SampleNight = Readonly<{ id: NightId; name: string; gloss: string; offerings: readonly Offering[] }>;

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const heads = ['ash', 'bone', 'candle', 'dusk', 'ember', 'fog', 'grave', 'hollow', 'ink', 'lantern', 'moth', 'rook', 'sable'];
const tails = ['bard', 'clerk', 'crow', 'elk', 'fox', 'hare', 'mage', 'monk', 'newt', 'owl', 'page', 'scribe', 'wisp'];

function night(seed: number, build: (add: (t: number, kind: Offering['kind'], amount: number) => void, random: () => number) => void) {
  const random = seeded(seed);
  const offerings: Offering[] = [];
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T;
  build((t, kind, amount) => {
    const at = Math.max(1, Math.min(2879, Math.round(t)));
    offerings.push({ t: at, kind, amount, login: `${pick(heads)}${pick(tails)}${Math.floor(random() * 90) + 10}` });
  }, random);
  return Object.freeze(offerings.sort((a, b) => a.t - b.t).map(item => Object.freeze(item)));
}

// Chatter that the preview model does not count still shows on the timeline.
function chatter(add: (t: number, kind: Offering['kind'], amount: number) => void, random: () => number, every: number) {
  for (let t = 20; t < 2860; t += every * (0.6 + random() * 0.8)) {
    add(t, random() < 0.5 ? 'bits' : 'points', random() < 0.5 ? 100 * (1 + Math.floor(random() * 5)) : 500 * (1 + Math.floor(random() * 4)));
  }
}

const gift_wave = night(31, (add, random) => {
  chatter(add, random, 150);
  for (let t = 90; t < 2860; t += 200 + random() * 160) add(t, 'sub', 1);
  add(12 * 60 + 5, 'gift', 20);
  // The wave: gift bombs from minute 26 to 36, densest around minute 31.
  for (let t = 26 * 60; t < 36 * 60; t += 9 + Math.abs(t - 31 * 60) / 9 + random() * 8) {
    add(t, 'gift', [5, 10, 10, 20, 25][Math.floor(random() * 5)] ?? 5);
  }
});

const raid_spike = night(47, (add, random) => {
  chatter(add, random, 120);
  for (let t = 150; t < 2860; t += 300 + random() * 240) add(t, 'sub', 1);
  // A raid lands at minute 20: a rush of new subs and two gift bombs inside two minutes.
  for (let index = 0; index < 28; index++) add(20 * 60 + index * 4 + random() * 3, 'sub', 1);
  add(20 * 60 + 40, 'gift', 20); add(21 * 60 + 15, 'gift', 10);
});

const sub_train = night(59, (add, random) => {
  chatter(add, random, 240);
  // A steady train: one sub every 40-60 s, all night.
  for (let t = 30; t < 2860; t += 40 + random() * 20) add(t, 'sub', 1);
});

export const sampleNights: readonly SampleNight[] = Object.freeze([
  { id: 'sample', name: 'Sample night', gloss: 'the illustrative timeline below, replayed', offerings: fixtureOfferings },
  { id: 'gift_wave', name: 'Gift wave', gloss: 'a 20-gift bomb at minute 12, then a gift wave from minute 26 to 36', offerings: gift_wave },
  { id: 'raid_spike', name: 'Raid spike', gloss: 'quiet, then a raid rush of subs at minute 20', offerings: raid_spike },
  { id: 'sub_train', name: 'Sub train', gloss: 'one sub every 40–60 s, all night', offerings: sub_train },
]);

export function sampleNight(id: NightId): SampleNight {
  const found = sampleNights.find(item => item.id === id) ?? sampleNights[0];
  if (!found) throw new Error('Missing generated night');
  return found;
}
