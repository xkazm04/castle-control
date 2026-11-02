import { expect, test } from 'vitest';
import { parseDuelList, SAMPLE } from '@castle-control/duel';
import { createFixtureDuel, fixturePicture } from './duel-fixture.js';
import { DEMO_KEY } from './duel-host.js';

/** A hand-driven wall clock and timer queue: nothing here waits on real time. */
function harness() {
  let now = 0;
  let queue: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  const duel = createFixtureDuel(() => now, {
    set: (run, ms) => { const id = ++ids; queue.push({ at: now + ms, run, id }); return id; },
    clear: id => { queue = queue.filter(item => item.id !== id); },
  });
  const stop = duel.subscribe(() => {});
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = queue.sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > end) break;
      queue = queue.filter(item => item !== next);
      now = next.at; next.run();
    }
    now = end;
  };
  return { duel, advance, stop, picture: () => fixturePicture(duel.getSnapshot()), pending: () => queue.length };
}

test('the sample waits ready; opening the vote lets SIMULATED ballots arrive and the tally move', () => {
  const h = harness();
  expect(h.picture()).toMatchObject({ phase: 'ready', simulated: true, match: 1, matches: 3, counts: [0, 0],
    left: { title: 'Raze the mill', seed: 1 }, right: { title: 'Borrow the mill', seed: 4 } });
  expect(h.pending()).toBe(0); // a ready stage runs no clock
  h.duel.send({ kind: 'enter' });
  expect(h.picture().phase).toBe('live');
  h.advance(6000);
  const middle = h.picture();
  expect(middle.counts[0] + middle.counts[1]).toBeGreaterThan(0);
  expect(middle.elapsed_ms).toBeGreaterThanOrEqual(5000);
  h.advance(4000);
  const later = h.picture();
  expect(later.counts[0] + later.counts[1]).toBeGreaterThanOrEqual(middle.counts[0] + middle.counts[1]);
  expect(later.barred).toBeGreaterThan(0);
});

test('the window closes on its own, the verdict theatre holds, then the next match opens', () => {
  const h = harness();
  h.duel.send({ kind: 'enter' });
  h.advance(15_000);
  const verdict = h.picture();
  expect(verdict.phase).toBe('verdict');
  expect(verdict.verdict?.how).toMatch(/tally|tie/);
  expect(verdict.rounds[0]?.[0]?.winner).not.toBeNull();
  h.advance(4000);
  expect(h.picture()).toMatchObject({ phase: 'live', match: 2, left: { title: 'Tax the miller' }, right: { title: 'Spare it' } });
});

test('a streamer call overrides the tally and freezes it; call off pauses; undo reopens the pair', () => {
  const h = harness();
  h.duel.send({ kind: 'enter' });
  h.advance(7000);
  const before = h.picture().counts;
  h.duel.send({ kind: 'pick', side: 1 });
  const called = h.picture();
  expect(called.verdict).toEqual({ side: 1, how: 'call' });
  expect(called.counts).toEqual(before);
  h.advance(1000);
  expect(h.picture().counts).toEqual(before);
  h.duel.send({ kind: 'undo' });
  expect(h.picture()).toMatchObject({ phase: 'live', match: 1, can_undo: false });
  h.duel.send({ kind: 'cancel' });
  expect(h.picture().phase).toBe('called_off');
  expect(h.pending()).toBe(0);
  h.duel.send({ kind: 'enter' });
  expect(h.picture().phase).toBe('live');
});

test('the demo starts open at three times speed and crowns a champion inside a minute', () => {
  const h = harness();
  h.duel.start(SAMPLE.chat, { key: DEMO_KEY, open: true, speed: 3 });
  expect(h.picture()).toMatchObject({ phase: 'live', demo: true, speed: 3 });
  h.advance(50_000);
  const done = h.picture();
  expect(done.phase).toBe('done');
  expect(done.champion).toBeDefined();
  expect(done.rounds.flat().every(slot => slot.winner !== null)).toBe(true);
  h.stop();
});

test('a custom eight-contestant list seeds 1 v 8 first and keeps the clock off while nobody watches', () => {
  const h = harness();
  const items = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8'].map(title => ({ id: title.toLowerCase(), title, by: 'streamer' }));
  h.duel.start(parseDuelList({ title: 'Eight', items }), { window_ms: 30_000, key: 'duel', open: true });
  expect(h.picture()).toMatchObject({ left: { title: 'A1' }, right: { title: 'H8' }, matches: 7, window_ms: 30_000 });
  expect(h.picture().rounds.map(round => round.length)).toEqual([4, 2, 1]);
  h.stop();
  expect(h.pending()).toBe(0);
});
