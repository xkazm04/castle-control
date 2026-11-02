import { expect, test } from 'vitest';
import type { IntensityCurve } from '@castle-control/contract';
import { fixtureOfferings, fixtureVisuals } from './beacons-fixture.js';
import { generateNights, sampleNight, sampleNights } from './beacons-nights.js';
import { fit_offer_below, fitSuggestion, night_duration_s, nightBursts, replayDomain, replayTrace, replayVerdict, timeSpent } from './beacons-replay.js';

const altar = fixtureVisuals[0]?.curve;
if (!altar) throw new Error('Missing generated altar');
const withTop = (curve: IntensityCurve, total: number): IntensityCurve =>
  ({ ...curve, ranges: curve.ranges.map((point, index, points) => index === points.length - 1 ? { ...point, total } : point) });

test('nights are generated, seeded, fictional and inside the 48 minutes', () => {
  expect(sampleNights.map(night => night.id)).toEqual(['sample', 'gift_wave', 'raid_spike', 'sub_train']);
  expect(sampleNight('sample').offerings).toBe(fixtureOfferings);
  const again = generateNights();
  for (const night of sampleNights) {
    expect(night.offerings.length).toBeGreaterThan(20);
    expect(night.offerings.every(item => item.t > 0 && item.t < night_duration_s && Number.isInteger(item.t))).toBe(true);
    expect(night.offerings.map(item => item.t)).toEqual([...night.offerings.map(item => item.t)].sort((a, b) => a - b));
    expect(night.offerings.every(item => /^[a-z]+\d{1,2}$/.test(item.login))).toBe(true);
    expect(again.find(item => item.id === night.id)?.offerings).toEqual(night.offerings);
  }
});

test('each generated night shows a different verdict on the sample altar curve', () => {
  const verdict = (id: Parameters<typeof sampleNight>[0]) => replayVerdict(replayTrace(altar, 1, nightBursts(sampleNight(id).offerings)));
  expect(verdict('sample').tone).toBe('balanced');
  expect(verdict('gift_wave').tone).toBe('pinned');
  expect(verdict('gift_wave').text).toContain('full from minute 30');
  expect(verdict('raid_spike').tone).toBe('balanced');
  expect(verdict('sub_train').tone).toBe('never_lit');
});

test('the gift-wave story: moving the top point right turns a pinned wave into a peak', () => {
  const bursts = nightBursts(sampleNight('gift_wave').offerings);
  const pinned = replayTrace(altar, 1, bursts);
  expect(pinned.pinned_s).toBeGreaterThan(6 * 60);
  const tuned = replayTrace(withTop(altar, 200), 1, bursts);
  expect(tuned.pinned).toEqual([]);
  expect(Math.floor(tuned.peak.t / 60)).toBeGreaterThanOrEqual(31);
  expect(Math.floor(tuned.peak.t / 60)).toBeLessThanOrEqual(34);
  expect(tuned.peak.intensity).toBeGreaterThan(0.85);
});

test('time spent covers the whole night and the drag domain is a round number past the busiest moment', () => {
  for (const night of sampleNights) {
    const trace = replayTrace(altar, 1, nightBursts(night.offerings));
    const spent = timeSpent(trace, 100, 24);
    expect(spent).toHaveLength(24);
    expect(spent.reduce((sum, seconds) => sum + seconds, 0)).toBeCloseTo(night_duration_s, 6);
    const domain = replayDomain(trace);
    expect(domain).toBeGreaterThan(trace.max_total);
    expect(domain % 5).toBe(0);
    // The domain ignores the curve's points, so it never moves under a dragged point.
    expect(replayDomain(replayTrace(withTop(altar, 400), 1, nightBursts(night.offerings)))).toBe(domain);
  }
});

test('fit suggestions move one point and fix the verdict they target', () => {
  const wave = nightBursts(sampleNight('gift_wave').offerings);
  const pinned = replayTrace(altar, 1, wave);
  const top = fitSuggestion(pinned, altar);
  expect(top).toMatchObject({ index: 3, total: Math.ceil(pinned.max_total) + 1 });
  expect(top?.label).toContain('Fit the top point');
  const fitted = replayTrace(withTop(altar, top?.total ?? 0), 1, wave);
  expect(fitted.pinned).toEqual([]);
  expect(fitted.peak.intensity).toBeGreaterThan(0.99);
  const train = nightBursts(sampleNight('sub_train').offerings);
  const dark = replayTrace(altar, 1, train);
  const light = fitSuggestion(dark, altar);
  expect(light?.index).toBe(1);
  const lit = { ...altar, ranges: altar.ranges.map((point, index) => index === 1 ? { ...point, total: light?.total ?? 0 } : point) };
  expect(replayVerdict(replayTrace(lit, 1, train)).tone).not.toBe('never_lit');
  expect(fitSuggestion(fitted, withTop(altar, top?.total ?? 0))).toBeUndefined();
  // Near the top already: no offer. A curve the night barely uses: one move, and the peak lands just under the top.
  const near = replayTrace(withTop(altar, Math.ceil(pinned.max_total) + 4), 1, wave);
  expect(near.peak.intensity).toBeGreaterThanOrEqual(fit_offer_below);
  expect(fitSuggestion(near, withTop(altar, Math.ceil(pinned.max_total) + 4))).toBeUndefined();
  const loose = withTop(altar, 1000);
  const reach = fitSuggestion(replayTrace(loose, 1, wave), loose);
  expect(reach).toMatchObject({ index: 3, total: Math.ceil(pinned.max_total) + 1 });
  expect(reach?.label).toBe(`Let this night's peak reach the top · move the top point to ${reach?.total}`);
});
