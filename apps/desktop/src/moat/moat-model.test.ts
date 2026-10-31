import { expect, test } from 'vitest';
import { busyNight, simulatedDrill } from '../drill-fixture.js';
import type { MoatOutcome, MoatSource } from './moat-model.js';
import { buildMoat, fateOf, heldCount, markerProgress, replayedCount, ruleTally, scrubTicks, spotlightStops, stampLevels, stopNeighbour, visibleMarkers, windowFor } from './moat-model.js';

const night = simulatedDrill();
const model = buildMoat(night);
const outcome = (index: number, patch: Partial<MoatOutcome> = {}): MoatOutcome => ({
  message_id: `simulated-message-${index}`, source: 'simulated-test', at: new Date(Date.UTC(2026, 9, 26, 12, 0, index)).toISOString(),
  state: 'not_provoked', verdict: 'pass', passed: true, ...patch,
});

test('the seeded night is the same every time and holds three stops among forty simulated lines', () => {
  expect(simulatedDrill()).toEqual(night);
  expect(simulatedDrill({ seed: 'another-night' })).not.toEqual(night);
  expect(model.counts).toEqual({ total: 40, aired: 35, held: 3, unresolved: 2, undated: 0 });
  const stopped = model.markers.filter(marker => marker.fate === 'held');
  expect(stopped.map(marker => marker.rule_id)).toEqual(['links', 'repeats', 'blocked-terms']);
  expect(stopped.every(marker => marker.action && marker.verdict)).toBe(true);
  // The last two stops sit side by side so the cluster layout is always exercised.
  expect((stopped[2]?.index ?? 0) - (stopped[1]?.index ?? 0)).toBe(1);
});

test('the fixture summary is derived from its outcomes, never typed in', () => {
  const states = night.outcomes.reduce<Record<string, number>>((all, item) => ({ ...all, [item.state]: (all[item.state] ?? 0) + 1 }), {});
  for (const [state, count] of Object.entries(night.summary.states)) expect(states[state] ?? 0).toBe(count);
  expect(night.summary.passes).toBe(night.outcomes.filter(item => item.passed === true).length);
  expect(night.summary.over_moderation.evaluated).toBe(night.summary.states.acted);
  expect(night.gaps[0]?.from).toBe('2026-10-26T12:05:00Z');
});

test('a gap is a span on the axis and no message falls inside it', () => {
  expect(model.gaps).toHaveLength(1);
  const gap = model.gaps[0];
  expect(gap && gap.to_ms - gap.from_ms).toBe(20000);
  expect(model.markers.some(marker => gap && marker.offset_ms > gap.from_ms && marker.offset_ms < gap.to_ms)).toBe(false);
  expect(model.run_ms).toBe(model.span_ms + model.cross_ms);
});

test('only a verdict or an unprovoked state can say a line aired', () => {
  expect(fateOf({ verdict: 'pass', state: 'not_provoked' })).toBe('aired');
  expect(fateOf({ state: 'not_provoked' })).toBe('aired');
  expect(fateOf({ verdict: 'hold', state: 'acted' })).toBe('held');
  expect(fateOf({ verdict: 'bar', state: 'acted' })).toBe('held');
  for (const state of ['acted', 'not_evaluable', 'judge_pending', 'judge_void', 'engine_failed'] as const) {
    expect(fateOf({ state })).toBe('unresolved');
  }
});

test('messages move chat to gate to stream, and held ones stop at the gate', () => {
  const [aired] = model.markers.filter(marker => marker.fate === 'aired');
  const [held] = model.markers.filter(marker => marker.fate === 'held');
  const [unknown] = model.markers.filter(marker => marker.fate === 'unresolved');
  if (!aired || !held || !unknown) throw new Error('Expected every fate in the simulated night');
  const cross = model.cross_ms;
  expect(markerProgress(aired, aired.offset_ms - 1, cross)).toEqual({ phase: 'waiting', lift: 0 });
  expect(markerProgress(aired, aired.offset_ms + cross / 2, cross)).toEqual({ phase: 'crossing', lift: 0.5 });
  expect(markerProgress(aired, aired.offset_ms + cross * 9, cross)).toEqual({ phase: 'aired', lift: 1 });
  expect(markerProgress(held, held.offset_ms + cross / 4, cross)).toEqual({ phase: 'crossing', lift: 0.25 });
  expect(markerProgress(held, held.offset_ms + cross * 9, cross)).toEqual({ phase: 'stopped', lift: 0.5 });
  expect(markerProgress(unknown, unknown.offset_ms + cross * 9, cross)).toEqual({ phase: 'unresolved', lift: 0.5 });
});

test('the held count and replayed count follow the playhead and end at the totals', () => {
  expect(heldCount(model, 0)).toBe(0);
  expect(replayedCount(model, -1)).toBe(0);
  expect(heldCount(model, model.run_ms)).toBe(3);
  expect(replayedCount(model, model.run_ms)).toBe(40);
  const first = model.held_arrivals[0] ?? 0;
  expect(heldCount(model, first - 1)).toBe(0);
  expect(heldCount(model, first)).toBe(1);
  let last = 0;
  for (let at = 0; at <= model.run_ms; at += 500) { const count = heldCount(model, at); expect(count).toBeGreaterThanOrEqual(last); last = count; }
});

test('lines without a usable time are counted aside and never drawn', () => {
  const result: MoatSource = { outcomes: [outcome(1), outcome(2, { at: 'not a time' }), outcome(3)], gaps: [] };
  const sparse = buildMoat(result);
  expect(sparse.markers).toHaveLength(2);
  expect(sparse.counts).toMatchObject({ total: 3, undated: 1 });
  expect(buildMoat({ outcomes: [], gaps: [] }).markers).toEqual([]);
});

test('equal times keep the drill order and out-of-order input is sorted', () => {
  const same = '2026-10-26T12:00:00Z';
  const ordered = buildMoat({ outcomes: [outcome(2, { at: same }), outcome(1, { at: same }), outcome(0, { at: '2026-10-26T11:59:00Z' })], gaps: [] });
  expect(ordered.markers.map(marker => marker.message_id)).toEqual(['simulated-message-0', 'simulated-message-2', 'simulated-message-1']);
  expect(ordered.markers.map(marker => marker.index)).toEqual([0, 1, 2]);
});

test('a short night fits whole and a long one shows the page the playhead is in', () => {
  expect(windowFor(model, 0)).toEqual({ from_ms: 0, to_ms: model.span_ms, paged: false });
  const long = buildMoat(simulatedDrill({ seed: 'long', count: 10000 }));
  const early = windowFor(long, 0);
  const late = windowFor(long, long.run_ms);
  expect(early).toMatchObject({ from_ms: 0, paged: true });
  expect(late.to_ms).toBe(long.span_ms);
  expect(late.from_ms).toBeGreaterThan(early.to_ms);
  const middle = windowFor(long, long.run_ms / 2);
  expect(visibleMarkers(long, middle).markers.length).toBeGreaterThan(100);
  expect(visibleMarkers(long, middle).markers.length).toBeLessThanOrEqual(360);
});

test('ten thousand outcomes build quickly and a window always keeps every stop', () => {
  const started = performance.now();
  const long = buildMoat(simulatedDrill({ seed: 'long', count: 10000 }));
  expect(long.counts.total).toBe(10000);
  expect(long.counts.held).toBeGreaterThan(500);
  for (const fraction of [0, 0.25, 0.5, 0.99]) {
    const window = windowFor(long, long.run_ms * fraction);
    const visible = visibleMarkers(long, window, 60);
    const inside = long.markers.filter(marker => marker.offset_ms >= window.from_ms && marker.offset_ms <= window.to_ms);
    const stops = (list: readonly { fate: string }[]) => list.filter(marker => marker.fate !== 'aired').length;
    expect(stops(visible.markers)).toBe(stops(inside));
    expect(visible.markers.length + visible.thinned).toBe(inside.length);
  }
  expect(performance.now() - started).toBeLessThan(5000);
});

test('stamps that would overlap stack upward and the overflow is counted', () => {
  expect(stampLevels([100, 300, 500], 50, 3)).toEqual({ levels: [0, 0, 0], overflow: 0 });
  expect(stampLevels([100, 110, 120, 130], 50, 3)).toEqual({ levels: [0, 1, 2, -1], overflow: 1 });
  expect(stampLevels([100, 110, 400], 50, 2)).toEqual({ levels: [0, 1, 0], overflow: 0 });
});

test('the scrubber ticks sit where the stops are', () => {
  const ticks = scrubTicks(model);
  expect(ticks.reduce((total, tick) => total + tick.held, 0)).toBe(3);
  expect(ticks.every(tick => tick.at > 0 && tick.at < 1)).toBe(true);
  expect(scrubTicks(buildMoat({ outcomes: [], gaps: [] }))).toEqual([]);
});

test('previous and next stop walk the stops in time order, stopping where each stamp drops', () => {
  const arrivals = model.held_arrivals;
  expect(stopNeighbour(model, 0, -1)).toBeUndefined();
  const first = stopNeighbour(model, 0, 1);
  expect(first?.marker.message_id).toBe(model.stops[0]?.message_id);
  expect(first?.at_ms).toBe(arrivals[0]);
  // From a stop's own arrival, next is the following stop and previous is the one before.
  const second = stopNeighbour(model, arrivals[0] ?? 0, 1);
  expect(second?.marker.message_id).toBe(model.stops[1]?.message_id);
  expect(stopNeighbour(model, arrivals[1] ?? 0, -1)?.marker.message_id).toBe(model.stops[0]?.message_id);
  expect(stopNeighbour(model, arrivals[2] ?? 0, 1)).toBeUndefined();
  expect(stopNeighbour(model, model.run_ms, -1)?.marker.message_id).toBe(model.stops[2]?.message_id);
  expect(stopNeighbour(buildMoat({ outcomes: [], gaps: [] }), 0, 1)).toBeUndefined();
  // Walking forward visits every stop once.
  const seen: string[] = []; let at = -1;
  for (let step = 0; step < 10; step += 1) { const next = stopNeighbour(model, at, 1); if (!next) break; seen.push(next.marker.message_id); at = next.at_ms; }
  expect(seen).toEqual(model.stops.map(marker => marker.message_id));
});

test('the rule tally counts each named rule once per stop, most first, and the spotlight keeps the arrivals aligned', () => {
  expect(ruleTally(model)).toEqual([{ rule_id: 'blocked-terms', held: 1 }, { rule_id: 'links', held: 1 }, { rule_id: 'repeats', held: 1 }]);
  const busy = buildMoat({ outcomes: [
    outcome(0, { verdict: 'hold', state: 'acted', rule_id: 'links', action: 'delete' }), outcome(5, { verdict: 'bar', state: 'acted', rule_id: 'repeats', action: 'timeout' }),
    outcome(9, { verdict: 'hold', state: 'acted', rule_id: 'links', action: 'delete' }), outcome(12, { verdict: 'hold', state: 'acted' }), outcome(14)], gaps: [] });
  // A stop with no rule id is not counted under any rule, and aired lines are not stops.
  expect(ruleTally(busy)).toEqual([{ rule_id: 'links', held: 2 }, { rule_id: 'repeats', held: 1 }]);
  expect(spotlightStops(busy, undefined)).toBe(busy);
  const links = spotlightStops(busy, 'links');
  expect(links.stops.map(marker => marker.message_id)).toEqual(['simulated-message-0', 'simulated-message-9']);
  expect(links.held_arrivals).toEqual([busy.held_arrivals[0], busy.held_arrivals[2]]);
  // Next and Previous walk only that rule's stops.
  const next = stopNeighbour(links, links.held_arrivals[0] ?? 0, 1);
  expect(next?.marker.message_id).toBe('simulated-message-9');
  expect(stopNeighbour(links, next?.at_ms ?? 0, 1)).toBeUndefined();
  expect(spotlightStops(busy, 'no-such-rule').stops).toEqual([]);
  expect(stopNeighbour(spotlightStops(busy, 'no-such-rule'), 0, 1)).toBeUndefined();
});

test('the busy night is a seeded two thousand lines with a gap that fits the page, and the same every time', () => {
  const night = busyNight();
  expect(busyNight()).toEqual(night);
  const busy = buildMoat(night);
  expect(busy.counts).toMatchObject({ total: 2000, held: 150, unresolved: 60, undated: 0 });
  expect(busy.gaps).toHaveLength(1);
  expect(((busy.gaps[0]?.to_ms ?? 0) - (busy.gaps[0]?.from_ms ?? 0)) / 1000).toBe(240);
  expect(windowFor(busy, 0).paged).toBe(true);
  expect(ruleTally(busy).reduce((total, item) => total + item.held, 0)).toBe(150);
});

test('stops that drop at the same instant are each reachable with Next and Previous', () => {
  // Whole-second recordings: three stops share a second, so they share an arrival.
  const tied = buildMoat({ outcomes: [outcome(0), outcome(3, { verdict: 'hold', state: 'acted', rule_id: 'links', action: 'delete' }),
    outcome(3, { verdict: 'bar', state: 'acted', rule_id: 'repeats', action: 'timeout' }), outcome(3, { verdict: 'hold', state: 'acted', rule_id: 'links', action: 'delete' }),
    outcome(9)], gaps: [] });
  expect(new Set(tied.held_arrivals).size).toBe(1);
  const first = stopNeighbour(tied, 0, 1);
  expect(first?.marker.index).toBe(tied.stops[0]?.index);
  // Standing on a tied stop (picked, playhead at its gate) the next one is the following stop, not the same instant again.
  const second = stopNeighbour(tied, first?.at_ms ?? 0, 1, first?.marker.index);
  expect(second?.marker.index).toBe(tied.stops[1]?.index);
  const third = stopNeighbour(tied, second?.at_ms ?? 0, 1, second?.marker.index);
  expect(third?.marker.index).toBe(tied.stops[2]?.index);
  expect(stopNeighbour(tied, third?.at_ms ?? 0, 1, third?.marker.index)).toBeUndefined();
  expect(stopNeighbour(tied, third?.at_ms ?? 0, -1, third?.marker.index)?.marker.index).toBe(tied.stops[1]?.index);
  expect(stopNeighbour(tied, first?.at_ms ?? 0, -1, first?.marker.index)).toBeUndefined();
  // A pick the playhead has moved away from is not an anchor: the playhead decides.
  expect(stopNeighbour(tied, 0, 1, tied.stops[2]?.index)?.marker.index).toBe(tied.stops[0]?.index);
});

test('a very long night builds without spreading its times into call arguments, and an empty budget draws no aired dot', () => {
  const lines = Array.from({ length: 200000 }, (_, index) => outcome(index));
  const huge = buildMoat({ outcomes: lines, gaps: [] });
  expect(huge.counts.total).toBe(200000);
  expect(huge.span_ms).toBe(199999 * 1000);
  const crowded = buildMoat({ outcomes: [outcome(0), ...Array.from({ length: 6 }, (_, index) => outcome(1 + index, { verdict: 'hold', state: 'acted', rule_id: 'links', action: 'delete' }))], gaps: [] });
  const drawn = visibleMarkers(crowded, { from_ms: 0, to_ms: crowded.span_ms, paged: false }, 6);
  expect(drawn.markers.filter(marker => marker.fate === 'aired')).toHaveLength(0);
  expect(drawn.thinned).toBe(1);
});
