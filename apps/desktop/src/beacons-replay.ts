import type { IntensityCurve } from '@castle-control/contract';
import type { Offering } from './beacons-fixture.js';
import { curveIntensity, decayedTotal, weightedAmount } from './beacons-model.js';

/** A replayed night feeds the preview model's own rules: gifts and subs only, weighted and decayed
 * exactly like a test fire and the simulated clock. It is never live accounting and never a second engine. */
export type ReplayBurst = Readonly<{ t: number; source: 'gift' | 'subscribe'; count: number; offering: number }>;
export type TracePoint = Readonly<{ t: number; total: number; intensity: number }>;
export type ReplayBand = Readonly<{ from: number; to: number }>;
export type ReplayTrace = Readonly<{
  duration_s: number; points: readonly TracePoint[];
  /** Spans where the running total sits at or past the top point, so more offerings change nothing. */
  pinned: readonly ReplayBand[]; pinned_s: number;
  /** Seconds at or past the lit threshold, integrated exactly like the pinned spans. */
  lit_total: number; lit_s: number; first_lit_s?: number;
  peak: TracePoint; max_total: number;
}>;

export const night_duration_s = 2880;
export const replay_step_s = 10;
export const pinned_merge_s = 30;

/** Only the kinds the preview model accepts count. Bits, points and Hype Train marks stay on the timeline. */
export function nightBursts(offerings: readonly Offering[]): readonly ReplayBurst[] {
  const bursts: ReplayBurst[] = [];
  offerings.forEach((item, offering) => {
    if (item.kind === 'gift') bursts.push({ t: item.t, source: 'gift', count: item.amount, offering });
    else if (item.kind === 'sub') bursts.push({ t: item.t, source: 'subscribe', count: item.amount, offering });
  });
  return bursts.sort((a, b) => a.t - b.t || a.offering - b.offering);
}

/** The first stair above the floor: a beacon is lit once its total reaches the curve's second point. */
export function litTotal(curve: IntensityCurve): number {
  return (curve.ranges[1] ?? curve.ranges[0])?.total ?? 0;
}

/** When a decaying total falls back under a threshold: the exact crossing, no sampling error. */
function aboveUntil(total: number, threshold: number, from: number, to: number, curve: IntensityCurve): number {
  if (total < threshold) return from;
  if (curve.decay.kind === 'none' || threshold <= 0) return to;
  return Math.min(to, from + curve.decay.half_life_s * Math.log2(total / threshold));
}

/** Deterministic: the same curve, weighting and bursts always return the same trace. */
export function replayTrace(curve: IntensityCurve, gift_weight: number, bursts: readonly ReplayBurst[],
  duration_s = night_duration_s, step_s = replay_step_s): ReplayTrace {
  const top = curve.ranges.at(-1)?.total ?? 0;
  const lit_total = litTotal(curve);
  const points: TracePoint[] = [];
  const pinned: { from: number; to: number }[] = [];
  const point = (t: number, total: number) => {
    const next = { t, total, intensity: curveIntensity(curve, total) };
    points.push(next);
    return next;
  };
  let total = 0; let at = 0; let first_lit_s: number | undefined; let pinned_s = 0; let lit_s = 0; let max_total = 0;
  let peak = point(0, 0);
  const pin = (from: number, to: number) => {
    const until = aboveUntil(total, top, from, to, curve);
    if (until <= from) return;
    pinned_s += until - from;
    // Dips shorter than the merge gap read as one pinned span; the minutes stay exact.
    const last = pinned.at(-1);
    if (last && last.to >= from - pinned_merge_s) last.to = Math.max(last.to, until);
    else pinned.push({ from, to: until });
  };
  const advance = (t: number) => {
    pin(at, t);
    if (lit_total > 0) lit_s += aboveUntil(total, lit_total, at, t, curve) - at;
    total = decayedTotal(total, t - at, curve.decay);
    at = t;
  };
  let next = 0;
  for (let grid = step_s; grid <= duration_s + step_s; grid += step_s) {
    const t = Math.min(grid, duration_s);
    while (next < bursts.length && (bursts[next]?.t ?? Infinity) <= t) {
      const burst = bursts[next++];
      if (!burst || burst.t < 0 || burst.t > duration_s) continue;
      advance(burst.t);
      point(burst.t, total);
      total += weightedAmount(burst.source, burst.count, gift_weight);
      const after = point(burst.t, total);
      max_total = Math.max(max_total, total);
      if (first_lit_s === undefined && total >= lit_total && lit_total > 0) first_lit_s = burst.t;
      if (after.intensity > peak.intensity || (after.intensity === peak.intensity && after.total > peak.total)) peak = after;
    }
    advance(t);
    point(t, total);
    if (t >= duration_s) break;
  }
  return Object.freeze({ duration_s, points: Object.freeze(points), pinned: Object.freeze(pinned.map(band => Object.freeze(band))),
    pinned_s, lit_total, lit_s, peak, max_total, ...(first_lit_s === undefined ? {} : { first_lit_s }) });
}

/** The exact running total at any playhead: the last recorded point, decayed to the playhead. */
export function traceAt(trace: ReplayTrace, curve: IntensityCurve, t: number): TracePoint {
  const at = Math.max(0, Math.min(trace.duration_s, t));
  let low = 0; let high = trace.points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((trace.points[middle]?.t ?? Infinity) <= at) low = middle; else high = middle - 1;
  }
  const base = trace.points[low] ?? { t: 0, total: 0, intensity: 0 };
  const total = decayedTotal(base.total, at - base.t, curve.decay);
  return { t: at, total, intensity: curveIntensity(curve, total) };
}

/** Seconds the night spends in each total bucket across [0, maximum]; anything past maximum lands in the last cell. */
export function timeSpent(trace: ReplayTrace, maximum: number, cells: number): readonly number[] {
  const spent = Array.from({ length: cells }, () => 0);
  trace.points.forEach((point, index) => {
    const next = trace.points[index + 1];
    if (!next || next.t <= point.t) return;
    const cell = Math.min(cells - 1, Math.max(0, Math.floor(point.total / Math.max(maximum, 1e-9) * cells)));
    spent[cell] = (spent[cell] ?? 0) + next.t - point.t;
  });
  return spent;
}

/** Drag headroom past the busiest moment, on a round number so the scale never moves mid-drag. */
export function replayDomain(trace: ReplayTrace): number {
  const want = Math.max(10, trace.max_total * 1.15);
  const step = 10 ** Math.floor(Math.log10(want)) / 2;
  return Math.ceil(want / step) * step;
}

/** A climbing night is offered a fit only while its peak stays under this share of full blaze. */
export const fit_offer_below = 0.9;

export type FitSuggestion = Readonly<{ index: number; total: number; label: string }>;

/** One draft point move, derived from the trace. It goes through the same editor and still needs a seal. */
export function fitSuggestion(trace: ReplayTrace, curve: IntensityCurve): FitSuggestion | undefined {
  const ranges = curve.ranges;
  const top = ranges.length - 1;
  const busiest = trace.max_total;
  if (top < 1 || busiest <= 0) return undefined;
  if (trace.first_lit_s === undefined && top >= 2) {
    const floor = (ranges[0]?.total ?? 0) + 1;
    const total = Math.max(floor, Math.floor(busiest * 0.75));
    return total < (ranges[1]?.total ?? 0) ? { index: 1, total, label: `Light it at this night's peak · move point 2 to ${total}` } : undefined;
  }
  const total = Math.ceil(busiest) + 1;
  const current = ranges[top]?.total ?? 0;
  if (total === current || total <= (ranges[top - 1]?.total ?? 0)) return undefined;
  if (trace.pinned_s > 0) return { index: top, total, label: `Fit the top point to this night's peak · move it to ${total}` };
  // A peak already near the top gains next to nothing from a fit, so only a curve this night barely uses is offered one.
  if (trace.peak.intensity >= fit_offer_below) return undefined;
  return { index: top, total, label: `Let this night's peak reach the top · move the top point to ${total}` };
}

export const minute = (seconds: number) => Math.floor(seconds / 60);
export const clockLabel = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export type ReplayVerdict = Readonly<{ tone: 'pinned' | 'never_lit' | 'balanced'; text: string }>;

/** Plain-language verdict derived only from the trace. */
export function replayVerdict(trace: ReplayTrace): ReplayVerdict {
  const peak = `${Math.round(trace.peak.intensity * 100)}% at minute ${minute(trace.peak.t)}`;
  if (trace.first_lit_s === undefined) return { tone: 'never_lit',
    text: `Never lit · the night peaks at ${trace.peak.total.toFixed(1)} weighted subs at minute ${minute(trace.peak.t)}, under the first threshold of ${trace.lit_total}` };
  if (trace.pinned_s > 0) {
    const pinned_min = Math.max(1, Math.round(trace.pinned_s / 60));
    return { tone: 'pinned', text: `Pinned at max for ${pinned_min} of ${minute(trace.duration_s)} minutes · first pinned at minute ${minute(trace.pinned[0]?.from ?? 0)} · offerings there change nothing` };
  }
  return { tone: 'balanced', text: `Peak ${peak} · never pinned · first lit at minute ${minute(trace.first_lit_s)}` };
}
