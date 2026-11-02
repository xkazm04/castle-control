import type { IntensityCurve } from '@castle-control/contract';
import type { Offering } from '../../beacons-fixture.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { clockLabel, traceAt } from '../../beacons-replay.js';

const kinds = { points: 'channel points', bits: 'bits', sub: 'sub', gift: 'gift subs', hype_train: 'Hype Train level' } as const;
export const offeringText = (offering: Offering) =>
  offering.kind === 'sub' ? `${offering.login} subscribes` : `${offering.login} · ${offering.amount} ${kinds[offering.kind]}`;

/** Indexes of the last few offerings at or before the playhead, newest first. */
export function recentOfferings(offerings: readonly Offering[], position: number, limit = 3): number[] {
  const found: number[] = [];
  for (let index = offerings.length - 1; index >= 0 && found.length < limit; index--) {
    if ((offerings[index]?.t ?? Infinity) <= position) found.push(index);
  }
  return found;
}

/**
 * The Steward's running commentary on a playing night: what a viewer sees at the playhead,
 * in plain words, derived only from the same trace the picture draws.
 */
export function narrate({ name, offerings, counted, trace, curve, position }: {
  name: string; offerings: readonly Offering[]; counted: ReadonlySet<number>;
  trace: ReplayTrace; curve: IntensityCurve; position: number;
}): string {
  const now = traceAt(trace, curve, position);
  const percent = Math.round(now.intensity * 100);
  const top = curve.ranges.at(-1)?.total ?? 0;
  const at = clockLabel(position);
  if (position >= trace.duration_s) {
    if (trace.first_lit_s === undefined) return `End of the night. The ${name} never lit: this curve asks for more than the night gave.`;
    return trace.pinned_s > 0
      ? `End of the night. The ${name} sat pinned at max for ${Math.max(1, Math.round(trace.pinned_s / 60))} min: offerings there changed nothing viewers could see.`
      : `End of the night. The ${name} peaked at ${Math.round(trace.peak.intensity * 100)}% and was never pinned: every offering showed.`;
  }
  const latest = recentOfferings(offerings, position, 8).find(index => counted.has(index));
  const offering = latest === undefined ? undefined : offerings[latest];
  if (now.total >= top && top > 0) return `${at} · Pinned at max. Viewers see the ${name} at full blaze; more gifts change nothing until it cools.`;
  if (offering && position - offering.t < 45) return `${at} · ${offeringText(offering)}. The ${name} swells to ${percent}%.`;
  if (now.intensity <= 0.005) return `${at} · Dark. Bits and points tick by, but only gift subs and subs feed the ${name} in this preview.`;
  if (curve.decay.kind === 'none') return `${at} · Quiet. The ${name} holds at ${percent}%: this curve never fades.`;
  return `${at} · Quiet. The ${name} cools to ${percent}%, halving every ${Math.round(curve.decay.half_life_s / 6) / 10} min.`;
}
