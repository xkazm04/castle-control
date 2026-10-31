import { expect, test, vi } from 'vitest';
import type { IntensityCurve } from '@castle-control/contract';
import { fixtureOfferings } from './beacons-fixture.js';
import { createBeaconsPreview, curveIntensity } from './beacons-model.js';
import { night_duration_s, nightBursts, replayTrace, replayVerdict, traceAt } from './beacons-replay.js';
import type { ReplayBurst } from './beacons-replay.js';
import { createReplayClock } from './rooms/visuals/replay-clock.js';

// Generated, simulated curves only; never a recording of a real night.
const altar: IntensityCurve = { ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 0.25 }, { total: 30, intensity: 0.6 },
  { total: 100, intensity: 1 }], decay: { kind: 'exponential', half_life_s: 300 } };
const bursts = nightBursts(fixtureOfferings);

test('the night feeds only gifts and subs, in time order, from the 60 fictional offerings', () => {
  expect(fixtureOfferings).toHaveLength(60);
  expect(bursts.every(burst => burst.source === 'gift' || burst.source === 'subscribe')).toBe(true);
  expect(bursts.map(burst => burst.t)).toEqual([...bursts.map(burst => burst.t)].sort((a, b) => a - b));
  const kinds = new Set(bursts.map(burst => fixtureOfferings[burst.offering]?.kind));
  expect([...kinds].sort()).toEqual(['gift', 'sub']);
  expect(bursts.filter(burst => burst.source === 'gift').reduce((sum, burst) => sum + burst.count, 0)).toBe(90);
});

test('replay accumulates with the preview model: the same weighting, decay and curve as test fire and the clock', () => {
  const port = createBeaconsPreview();
  const start = port.getSnapshot().visuals[0];
  if (!start) throw new Error('Missing generated altar');
  const curve = start.visual.curve;
  port.weight(3);
  port.fire('gift', 10); port.advance(); port.fire('subscribe', 1); port.advance(); port.advance();
  const after = port.getSnapshot().visuals[0];
  if (!after) throw new Error('Missing generated altar');
  const night: ReplayBurst[] = [{ t: 0, source: 'gift', count: 10, offering: 0 }, { t: 60, source: 'subscribe', count: 1, offering: 1 }];
  const trace = replayTrace(curve, 3, night, 600);
  const replayed = traceAt(trace, curve, 180);
  // The port started from its illustrative total; the replay starts from an empty night. Decay is linear.
  const carried = start.total * 2 ** (-180 / 300);
  expect(replayed.total).toBeCloseTo(after.total - carried, 10);
  expect(replayed.intensity).toBe(curveIntensity(curve, replayed.total));
});

test('the trace is deterministic and exact at bursts, with no wall clock', () => {
  const now = vi.spyOn(Date, 'now');
  const performance_now = vi.spyOn(performance, 'now');
  try {
    const first = replayTrace(altar, 1, bursts);
    const second = replayTrace(altar, 1, bursts);
    expect(second).toEqual(first);
    expect(first.points[0]).toEqual({ t: 0, total: 0, intensity: 0 });
    expect(first.points.at(-1)?.t).toBe(night_duration_s);
    const gift = bursts.find(burst => burst.source === 'gift');
    if (!gift) throw new Error('Expected a simulated gift');
    const at = first.points.filter(point => point.t === gift.t);
    expect((at.at(-1)?.total ?? 0) - (at[0]?.total ?? 0)).toBe(gift.count);
    expect(now).not.toHaveBeenCalled();
    expect(performance_now).not.toHaveBeenCalled();
  } finally { now.mockRestore(); performance_now.mockRestore(); }
});

test('pinned bands, never lit and balanced verdicts come from the trace alone', () => {
  const balanced = replayTrace(altar, 1, bursts);
  expect(balanced.pinned).toEqual([]);
  expect(replayVerdict(balanced).tone).toBe('balanced');
  expect(replayVerdict(balanced).text).toMatch(/^Peak \d+% at minute \d+ · never pinned · first lit at minute \d+$/);
  const heavy = replayTrace(altar, 6, bursts);
  expect(heavy.pinned.length).toBeGreaterThan(0);
  expect(heavy.pinned_s).toBeGreaterThan(0);
  for (const band of heavy.pinned) {
    expect(band.to).toBeGreaterThan(band.from);
    expect(traceAt(heavy, altar, (band.from + band.to) / 2).total).toBeGreaterThanOrEqual(100);
  }
  expect(replayVerdict(heavy).tone).toBe('pinned');
  const high: IntensityCurve = { ...altar, ranges: [{ total: 0, intensity: 0 }, { total: 500, intensity: 0.5 }, { total: 900, intensity: 1 }] };
  const dark = replayTrace(high, 1, bursts);
  expect(dark.first_lit_s).toBeUndefined();
  expect(replayVerdict(dark).tone).toBe('never_lit');
  expect(replayVerdict(dark).text).toContain('under the first threshold of 500');
});

test('pinned spans end exactly where the decayed total crosses the top point', () => {
  const curve: IntensityCurve = { ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 1 }], decay: { kind: 'exponential', half_life_s: 60 } };
  const trace = replayTrace(curve, 1, [{ t: 100, source: 'gift', count: 40, offering: 0 }], 600);
  // 40 halves to 10 after two half-lives.
  expect(trace.pinned).toEqual([{ from: 100, to: 220 }]);
  expect(trace.pinned_s).toBe(120);
  // Lit from the gift until 40 halves under 10 too: the top point here is also the lit point.
  expect(trace.lit_s).toBe(120);
  const stair: IntensityCurve = { ...curve, ranges: [{ total: 0, intensity: 0 }, { total: 5, intensity: 0.5 }, { total: 10, intensity: 1 }] };
  // 40 falls to 5 after three half-lives.
  expect(replayTrace(stair, 1, [{ t: 100, source: 'gift', count: 40, offering: 0 }], 600).lit_s).toBeCloseTo(180, 9);
});

test('the replay clock is deterministic: injected ticks only, speeds, scrubbing and end of night', () => {
  const run = () => {
    const clock = createReplayClock(night_duration_s);
    const seen: number[] = [];
    clock.tick(1000); seen.push(clock.getSnapshot().position_s);
    clock.play(); clock.tick(1000); seen.push(clock.getSnapshot().position_s);
    clock.setSpeed(10); clock.tick(500); seen.push(clock.getSnapshot().position_s);
    clock.setSpeed(1); clock.tick(2000); seen.push(clock.getSnapshot().position_s);
    clock.seek(-5); seen.push(clock.getSnapshot().position_s);
    clock.seek(99999); seen.push(clock.getSnapshot().position_s);
    return { seen, playing: clock.getSnapshot().playing, clock };
  };
  const first = run();
  expect(first.seen).toEqual([0, 30, 35, 37, 0, night_duration_s]);
  expect(run().seen).toEqual(first.seen);
  const clock = createReplayClock(night_duration_s);
  clock.play();
  for (let frame = 0; frame < 96 * 4; frame++) clock.tick(250);
  expect(clock.getSnapshot()).toEqual({ position_s: night_duration_s, playing: false, speed: 30, duration_s: night_duration_s });
  clock.play();
  expect(clock.getSnapshot().position_s).toBe(0);
  clock.pause(); clock.tick(1000);
  expect(clock.getSnapshot().position_s).toBe(0);
});
