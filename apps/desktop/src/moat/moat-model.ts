import type { Action, BridgeGap, DrillState, Verdict } from '@castle-control/contract';

// The moat draws what a replay already says: when each message came, where it ended up, the
// action and the rule that stopped it. A DrillOutcome carries no message text, so none is drawn.

/** held = stopped at the gate (verdict hold or bar); unresolved = the drill could not say. */
/** The fields of a DrillOutcome the moat reads. Message text is not among them, because the contract has none. */
export type MoatOutcome = Readonly<{
  message_id: string; source: string; at: string; state: DrillState;
  verdict?: Verdict | undefined; action?: Action | undefined; rule_id?: string | undefined; passed?: boolean | undefined;
}>;
export type MoatSource = Readonly<{ outcomes: readonly MoatOutcome[]; gaps: readonly BridgeGap[] }>;

export type MoatFate = 'aired' | 'held' | 'unresolved';

export type MoatMarker = Readonly<{
  index: number; message_id: string; source: string; at: string;
  /** Milliseconds since the first thing on the timeline. */
  offset_ms: number; fate: MoatFate; state: DrillState;
  verdict?: Verdict; action?: Action; rule_id?: string; passed?: boolean;
}>;
export type MoatGap = Readonly<{ from: string; to: string; from_ms: number; to_ms: number }>;
export type MoatCounts = Readonly<{ total: number; aired: number; held: number; unresolved: number; undated: number }>;
export type MoatModel = Readonly<{
  /** Wall-clock epoch milliseconds of offset zero. */
  start_ms: number;
  /** Time a message takes to cross from chat to the stream, replay time. */
  cross_ms: number;
  /** Length of the x axis: the recording from first message or gap edge to the last. */
  span_ms: number;
  /** Playhead range: the span plus the last crossing, so every message finishes. */
  run_ms: number;
  markers: readonly MoatMarker[];
  gaps: readonly MoatGap[];
  /** When each held marker reaches the gate, sorted. */
  held_arrivals: readonly number[];
  counts: MoatCounts;
}>;

export const crossingMs = 4000;

export function fateOf(outcome: { verdict?: Verdict | undefined; state: DrillState }): MoatFate {
  if (outcome.verdict === 'hold' || outcome.verdict === 'bar') return 'held';
  if (outcome.verdict === 'pass') return 'aired';
  // Without a verdict only "no rule provoked" is a safe statement that the line aired.
  return outcome.state === 'not_provoked' ? 'aired' : 'unresolved';
}

export function buildMoat(result: MoatSource, cross_ms = crossingMs): MoatModel {
  const dated = result.outcomes.map(outcome => ({ outcome, at_ms: Date.parse(outcome.at) })).filter(item => Number.isFinite(item.at_ms));
  const gaps = result.gaps.map(gap => ({ gap, from: Date.parse(gap.from), to: Date.parse(gap.to) }))
    .filter(item => Number.isFinite(item.from) && Number.isFinite(item.to) && item.to >= item.from);
  const times = [...dated.map(item => item.at_ms), ...gaps.flatMap(item => [item.from, item.to])];
  const start = times.length ? Math.min(...times) : 0;
  const end = times.length ? Math.max(...times) : 0;
  // Array.prototype.sort is stable, so equal times keep the order the drill reported.
  const sorted = [...dated].sort((a, b) => a.at_ms - b.at_ms);
  const markers = sorted.map(({ outcome, at_ms }, index): MoatMarker => ({
    index, message_id: outcome.message_id, source: outcome.source, at: outcome.at, offset_ms: at_ms - start,
    fate: fateOf(outcome), state: outcome.state,
    ...(outcome.verdict ? { verdict: outcome.verdict } : {}), ...(outcome.action ? { action: outcome.action } : {}),
    ...(outcome.rule_id ? { rule_id: outcome.rule_id } : {}), ...(outcome.passed === undefined ? {} : { passed: outcome.passed }),
  }));
  const span_ms = Math.max(end - start, 1);
  const counts = { total: result.outcomes.length, aired: 0, held: 0, unresolved: 0, undated: result.outcomes.length - dated.length };
  for (const marker of markers) counts[marker.fate] += 1;
  return {
    start_ms: start, cross_ms, span_ms, run_ms: span_ms + cross_ms, markers,
    gaps: gaps.map(({ gap, from, to }) => ({ from: gap.from, to: gap.to, from_ms: from - start, to_ms: to - start })),
    held_arrivals: markers.filter(marker => marker.fate === 'held').map(marker => marker.offset_ms + cross_ms / 2),
    counts,
  };
}

/** How far down the moat a marker is: 0 in chat, 0.5 at the gate, 1 on the stream. */
export type MoatPhase = 'waiting' | 'crossing' | 'aired' | 'stopped' | 'unresolved';
export function markerProgress(marker: MoatMarker, playhead_ms: number, cross_ms: number): { phase: MoatPhase; lift: number } {
  const elapsed = playhead_ms - marker.offset_ms;
  if (elapsed < 0) return { phase: 'waiting', lift: 0 };
  const travelled = Math.min(elapsed / cross_ms, 1);
  if (marker.fate === 'aired') return { phase: travelled >= 1 ? 'aired' : 'crossing', lift: travelled };
  // Held and unresolved messages never pass the gate.
  return { phase: travelled >= 0.5 ? (marker.fate === 'held' ? 'stopped' : 'unresolved') : 'crossing', lift: Math.min(travelled, 0.5) };
}

/** First index of a sorted sequence for which `reached` holds, by bisection. */
function firstReached(count: number, reached: (index: number) => boolean): number {
  let low = 0; let high = count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (reached(middle)) high = middle; else low = middle + 1;
  }
  return low;
}
const offsetOf = (model: MoatModel) => (index: number) => model.markers[index]?.offset_ms ?? 0;

/** Held messages that have reached the gate by this playhead. */
export function heldCount(model: MoatModel, playhead_ms: number): number {
  return firstReached(model.held_arrivals.length, index => (model.held_arrivals[index] ?? 0) > playhead_ms);
}
/** Messages whose turn in chat has come. */
export function replayedCount(model: MoatModel, playhead_ms: number): number {
  return firstReached(model.markers.length, index => offsetOf(model)(index) > playhead_ms);
}

export type MoatWindow = Readonly<{ from_ms: number; to_ms: number; paged: boolean }>;
/** The x range on screen. A short night fits whole; a long one is shown in pages of about `capacity` messages. */
export function windowFor(model: MoatModel, playhead_ms: number, capacity = 240): MoatWindow {
  if (model.markers.length <= capacity) return { from_ms: 0, to_ms: model.span_ms, paged: false };
  const page = Math.max(model.span_ms * capacity / model.markers.length, model.cross_ms * 2);
  const pages = Math.ceil(model.span_ms / page);
  const from_ms = Math.min(Math.floor(Math.max(playhead_ms, 0) / page), pages - 1) * page;
  return { from_ms, to_ms: Math.min(from_ms + page, model.span_ms), paged: true };
}

export type MoatDrawable = Readonly<{ markers: readonly MoatMarker[]; thinned: number }>;
/** Markers inside a window, found by bisection so ten thousand outcomes cost the same as forty. */
export function visibleMarkers(model: MoatModel, window: MoatWindow, max_dots = 360): MoatDrawable {
  const first = firstReached(model.markers.length, index => offsetOf(model)(index) >= window.from_ms);
  const last = firstReached(model.markers.length, index => offsetOf(model)(index) > window.to_ms);
  const inside = model.markers.slice(first, last);
  if (inside.length <= max_dots) return { markers: inside, thinned: 0 };
  // Thin only the aired dots. Stopped and unresolved messages are the point and always stay.
  const aired = inside.filter(marker => marker.fate === 'aired');
  const keep = Math.max(max_dots - (inside.length - aired.length), 0);
  const stride = keep ? Math.ceil(aired.length / keep) : aired.length + 1;
  const shown = new Set(aired.filter((_, position) => position % stride === 0));
  const kept = inside.filter(marker => marker.fate !== 'aired' || shown.has(marker));
  return { markers: kept, thinned: inside.length - kept.length };
}

/** Level 0 is nearest the gate. Stamps that would overlap take the next level up; the rest are `overflow`. */
export function stampLevels(xs: readonly number[], width: number, levels: number): { levels: readonly number[]; overflow: number } {
  const edges: number[] = Array.from({ length: levels }, () => Number.NEGATIVE_INFINITY);
  let overflow = 0;
  const placed = xs.map(x => {
    const level = edges.findIndex(edge => x - width / 2 >= edge);
    if (level < 0) { overflow += 1; return -1; }
    edges[level] = x + width / 2;
    return level;
  });
  return { levels: placed, overflow };
}

export type ScrubTick = Readonly<{ at: number; held: number }>;
/** Held density along the whole scrubber, in at most `buckets` ticks, as fractions of the run. */
export function scrubTicks(model: MoatModel, buckets = 120): readonly ScrubTick[] {
  const counts = new Map<number, number>();
  for (const arrival of model.held_arrivals) {
    const bucket = Math.min(Math.floor(arrival / model.run_ms * buckets), buckets - 1);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0] - b[0]).map(([bucket, held]) => ({ at: (bucket + 0.5) / buckets, held }));
}
