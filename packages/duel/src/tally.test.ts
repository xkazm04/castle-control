import { expect, test } from 'vitest';
import { indexWindow, recentEvents, tallyAt, wouldFlip } from './ballots.js';
import type { Tally, WindowEvent } from './ballots.js';

function generatedEvent(index: number): WindowEvent {
  const details = { t_ms: Math.floor(index / 2) * 3, user_id: String(index + 1), text: '[generated]', cheer: index % 3 === 0 };
  const option = index % 2 === 0 ? 0 : 1;
  switch (index % 5) {
    case 0: return { ...details, option, status: 'counted', vote: { kind: 'vote', option_index: option } };
    case 1: return { ...details, option, status: 'barred' };
    case 2: return { ...details, option, status: 'held' };
    case 3: return { ...details, option, status: 'repeat' };
    default: return { ...details, status: 'chatter' };
  }
}

/** Independent linear oracle; no prefix counts or production tally helpers. */
function recount(events: readonly WindowEvent[], t_ms: number): Tally {
  const seen = events.filter((event) => event.t_ms <= t_ms);
  const counted: [number, number] = [0, 0];
  const barred: [number, number] = [0, 0];
  let held = 0, repeat = 0, chatter = 0, cheers_as_one = 0;
  for (const event of seen) {
    switch (event.status) {
      case 'counted': counted[event.option]++; if (event.cheer) cheers_as_one++; break;
      case 'barred': if (event.option !== undefined) barred[event.option]++; break;
      case 'held': held++; break;
      case 'repeat': repeat++; break;
      case 'chatter': chatter++; break;
    }
  }
  const total = counted[0] + counted[1];
  return { counted, barred, held, repeat, chatter, cheers_as_one, seen: seen.length, total,
    share: total ? counted[0] / total : 0.5, shadow: [counted[0] + barred[0], counted[1] + barred[1]] };
}

test('50,000 indexed events match a linear recount at 20 times with at most 17 probes', () => {
  const events = Array.from({ length: 50000 }, (_, index) => generatedEvent(index));
  const window = indexWindow(events);
  const times = [-1, 0, ...Array.from({ length: 16 }, (_, index) => Math.floor((index + 1) * 74997 / 17)), 74997, 80000];
  expect(times).toHaveLength(20);
  for (const t_ms of times) {
    const meter = { probes: 0 };
    expect(tallyAt(window, t_ms, meter)).toEqual(recount(events, t_ms));
    expect(meter.probes).toBeLessThanOrEqual(17);
    expect(meter.probes).toBeGreaterThan(0);
  }
});

test('an empty window is neutral and needs no comparisons', () => {
  const meter = { probes: 0 };
  expect(tallyAt(indexWindow([]), 0, meter)).toEqual(recount([], 0));
  expect(meter.probes).toBe(0);
});

test('queries return independent counts and include all events at the queried time', () => {
  const window = indexWindow([generatedEvent(1), generatedEvent(0), generatedEvent(2)]);
  const first = tallyAt(window, 0);
  expect(first.seen).toBe(2);
  first.counted[0] = 999;
  first.barred[1] = 999;
  first.shadow[0] = 999;
  expect(tallyAt(window, 0)).toEqual(recount(window.events, 0));
  expect(tallyAt(window, 3).seen).toBe(3);
});

test('wouldFlip also detects ties becoming leads and leads becoming ties', () => {
  const tally = recount([], 0);
  expect(wouldFlip(tally)).toBe(false);
  expect(wouldFlip({ ...tally, shadow: [1, 0] })).toBe(true);
  expect(wouldFlip({ ...tally, counted: [1, 0], shadow: [1, 1] })).toBe(true);
  expect(wouldFlip({ ...tally, counted: [1, 0], shadow: [2, 0] })).toBe(false);
});

test('recent events are at most five, newest first, including tied arrivals in reverse page order', () => {
  const events = Array.from({ length: 30 }, (_, index) => generatedEvent(index));
  const window = indexWindow(events);
  for (const t_ms of [-1, 0, 1.5, 3, 20, 100, Infinity]) {
    const recent = recentEvents(window, t_ms);
    expect(recent).toEqual(events.filter((event) => event.t_ms <= t_ms).slice(-5).reverse());
    expect(recent.length).toBeLessThanOrEqual(5);
  }
  expect(recentEvents(window, 20, 2)).toHaveLength(2);
  expect(recentEvents(window, 20, 0)).toEqual([]);
  expect(recentEvents(window, 20, -1)).toEqual([]);
  expect(recentEvents(indexWindow([]), 100)).toEqual([]);
});

test('the ticker reads only its requested events, with no binary search or scan of the array', () => {
  const window = indexWindow(Array.from({ length: 50000 }, (_, index) => generatedEvent(index)));
  let reads = 0;
  const events = new Proxy(window.events, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads++;
      return Reflect.get(target, property, receiver);
    },
  });
  expect(recentEvents({ ...window, events }, 50000)).toHaveLength(5);
  expect(reads).toBe(5);
});

test('the time index handles sparse large milliseconds and fractional query times', () => {
  const times = [0, 1, 2 ** 32, 2 ** 48, Number.MAX_SAFE_INTEGER];
  const events = times.map((t_ms, index) => ({ ...generatedEvent(index), t_ms }));
  const window = indexWindow(events);
  for (const t_ms of [-Infinity, -1, 0, 0.5, 1, 2 ** 32 - 0.5, 2 ** 48, Number.MAX_SAFE_INTEGER, Infinity]) {
    expect(recentEvents(window, t_ms)).toEqual(events.filter((event) => event.t_ms <= t_ms).slice(-5).reverse());
  }
});

test('ingest snapshots events so later input mutations cannot desynchronise the indexes', () => {
  const event = generatedEvent(0);
  const window = indexWindow([event]);
  event.t_ms = 100;
  event.text = '[generated changed]';
  expect(recentEvents(window, 0)[0]?.text).toBe('[generated]');
  expect(tallyAt(window, 0).seen).toBe(1);
});
