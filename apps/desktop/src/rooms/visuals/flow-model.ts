import type { ContributionSource, IntensityCurve, IntensityDecay, Visual } from '@castle-control/contract';
import { curveIntensity, decayedTotal, weightedAmount } from '../../beacons-model.js';
import { sampleNight, sampleNights } from '../../beacons-nights.js';
import type { NightId } from '../../beacons-nights.js';
import { fitSuggestion, minute, nightBursts, replayTrace } from '../../beacons-replay.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { contributionInput } from './contribution-input.js';

/**
 * Pure choices behind the Beacons Steward flows. Every consequence line is computed from
 * the same preview rules as the room (curve, decay, gift weighting, generated nights),
 * so the cards never promise what the picture will not show. Nothing here acts.
 */

/** What can feed a beacon from the flow: the four kinds a streamer recognises. */
export const feeds = [
  { id: 'gift', label: 'Gift subs', counted: true },
  { id: 'subscribe', label: 'Subscriptions', counted: true },
  { id: 'cheer', label: 'Bits', counted: false },
  { id: 'channel_points', label: 'Channel points', counted: false },
] as const satisfies readonly { id: ContributionSource; label: string; counted: boolean }[];
export type FeedId = typeof feeds[number]['id'];

export type StrengthId = 'keep' | 'gentle' | 'balanced' | 'eager';
const presetCurves: Record<Exclude<StrengthId, 'keep'>, { label: string; ranges: IntensityCurve['ranges'] }> = {
  gentle: { label: 'Gentle', ranges: [{ total: 0, intensity: 0 }, { total: 20, intensity: 0.2 }, { total: 60, intensity: 0.55 }, { total: 150, intensity: 1 }] },
  balanced: { label: 'Balanced', ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 0.25 }, { total: 30, intensity: 0.6 }, { total: 100, intensity: 1 }] },
  eager: { label: 'Eager', ranges: [{ total: 0, intensity: 0 }, { total: 3, intensity: 0.3 }, { total: 12, intensity: 0.7 }, { total: 40, intensity: 1 }] },
};
export const strengths: readonly StrengthId[] = ['keep', 'gentle', 'balanced', 'eager'];

export type DecayId = 'fast' | 'medium' | 'slow' | 'hold';
export const decays: readonly { id: DecayId; label: string; decay: IntensityDecay; line: string }[] = [
  { id: 'fast', label: 'Halves every 2 min', decay: { kind: 'exponential', half_life_s: 120 }, line: 'A flash: a gift bomb flares, then settles within minutes' },
  { id: 'medium', label: 'Halves every 5 min', decay: { kind: 'exponential', half_life_s: 300 }, line: 'A glow that lingers through a short lull' },
  { id: 'slow', label: 'Halves every 15 min', decay: { kind: 'exponential', half_life_s: 900 }, line: 'Builds across the night; hard to cool down' },
  { id: 'hold', label: 'Never fades', decay: { kind: 'none' }, line: 'Only climbs until the night ends; it soon sits at full blaze' },
];

export type ShotId = 'sub' | 'gift10' | 'gift50' | 'quiet';
export const shots: readonly { id: ShotId; label: string; source?: 'gift' | 'subscribe'; count: number }[] = [
  { id: 'sub', label: 'One sub', source: 'subscribe', count: 1 },
  { id: 'gift10', label: '10 gift subs', source: 'gift', count: 10 },
  { id: 'gift50', label: 'A 50-gift bomb', source: 'gift', count: 50 },
  { id: 'quiet', label: 'A quiet minute', count: 0 },
];

export type DemoCaseId = 'gift_wave' | 'raid_spike' | 'sub_train';
export const demoCases: readonly { id: DemoCaseId; label: string; visual: string; night: NightId; line: string }[] = [
  { id: 'gift_wave', label: 'Gift wave on the camera frame', visual: 'gilded-frame', night: 'gift_wave',
    line: 'A 20-gift bomb at minute 12, then a wave of gifts from minute 26' },
  { id: 'raid_spike', label: 'Raid spike on the offering altar', visual: 'offering-altar', night: 'raid_spike',
    line: 'A quiet start, then a raid rush of subs at minute 20' },
  { id: 'sub_train', label: 'Sub train on the hype border', visual: 'hype-border', night: 'sub_train',
    line: 'One sub every 40 to 60 s, all night long' },
];

export type TuneDraft = { visual?: string; feed?: FeedId; strength?: StrengthId; decay?: DecayId };
export type TestDraft = { visual?: string; shot?: ShotId };
export type ReplayMove = 'keep' | 'fit';
export type ReplayDraft = { visual?: string; night?: NightId; move?: ReplayMove };
export type DemoDraft = { case?: DemoCaseId; move?: ReplayMove };

export const strengthLabel = (id: StrengthId) => id === 'keep' ? 'As it is' : presetCurves[id].label;
export const decayLabel = (decay: IntensityDecay) =>
  decay.kind === 'none' ? 'Never fades' : `Halves every ${Math.round(decay.half_life_s / 6) / 10} min`;
export const curveSteps = (curve: IntensityCurve) =>
  curve.ranges.map(point => `${point.total}→${Math.round(point.intensity * 100)}%`).join(' · ');

/** The visual as the draft would leave it. Only the fields the draft names change. */
export function tunedVisual(visual: Visual, draft: Pick<TuneDraft, 'feed' | 'strength' | 'decay'>): Visual {
  const ranges = draft.strength && draft.strength !== 'keep' ? presetCurves[draft.strength].ranges : visual.curve.ranges;
  const decay = decays.find(item => item.id === draft.decay)?.decay ?? visual.curve.decay;
  return { ...visual, curve: { ranges, decay }, ...(draft.feed ? { input: contributionInput(draft.feed) } : {}) };
}

const traces = new WeakMap<IntensityCurve, Map<string, ReplayTrace>>();
/** Memoised per curve object: the flow cards and the picture ask for the same nights many times. */
export function nightTrace(curve: IntensityCurve, night: NightId, gift_weight = 1): ReplayTrace {
  let byNight = traces.get(curve);
  if (!byNight) { byNight = new Map(); traces.set(curve, byNight); }
  const key = `${night}:${gift_weight}`;
  const found = byNight.get(key);
  if (found) return found;
  const trace = replayTrace(curve, gift_weight, nightBursts(sampleNight(night).offerings));
  byNight.set(key, trace);
  return trace;
}

/** One short phrase for a card: how this curve would behave across a generated night. */
export function nightPhrase(trace: ReplayTrace): string {
  if (trace.first_lit_s === undefined) return 'stays dark';
  if (trace.pinned_s > 0) return `sits at full blaze for ${Math.max(1, Math.round(trace.pinned_s / 60))} min`;
  return `peaks ${Math.round(trace.peak.intensity * 100)}%, lit ${Math.round(trace.lit_s / 60)} min`;
}

export function nightName(id: NightId): string { return sampleNight(id).name; }

/** "Sample night: peaks 74%, lit 12 min · Gift wave: full blaze for 8 min" */
export function curveConsequence(curve: IntensityCurve, gift_weight = 1): string {
  return (['sample', 'gift_wave'] as const).map(night => `${nightName(night)}: ${nightPhrase(nightTrace(curve, night, gift_weight))}`).join(' · ');
}

export function shotResult(curve: IntensityCurve, total: number, gift_weight: number, shot: ShotId) {
  const item = shots.find(value => value.id === shot);
  const next = !item ? total : item.source ? total + weightedAmount(item.source, item.count, gift_weight) : decayedTotal(total, 60, curve.decay);
  return { before: curveIntensity(curve, total), after: curveIntensity(curve, next), total: next };
}

/** The night's moves, offered only when the trace earns them (the same rule as the workbench). */
export function replayMoves(curve: IntensityCurve, night: NightId, gift_weight = 1) {
  const trace = nightTrace(curve, night, gift_weight);
  const fit = fitSuggestion(trace, curve);
  return { trace, fit };
}

export function fittedCurve(curve: IntensityCurve, night: NightId, gift_weight = 1): IntensityCurve {
  const { fit } = replayMoves(curve, night, gift_weight);
  const point = fit && curve.ranges[fit.index];
  if (!fit || !point) return curve;
  return { ...curve, ranges: curve.ranges.map((value, index) => index === fit.index ? { ...point, total: fit.total } : value) };
}

export const nights = sampleNights;
export const minuteOf = minute;
