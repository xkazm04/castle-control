import type { LotsDraw } from '@castle-control/contract';
import type { DrawShape } from '@castle-control/renderer';
import type { FlowLine, FlowOption } from '@castle-control/ui/steward-flow';
import { fixtureDraws, fixturePool } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { checkFixturePolicy } from '../../lots-model.js';

/** Pure draft logic for the Lot Chamber's Steward flows. No ports, no React. */
export type RevealStyle = 'ceremony' | 'quiet' | 'hand';
export type SetupPreset = 'question' | 'prize' | 'custom' | 'paid';
export type Fairness = 'balanced' | 'open' | 'activity' | 'each';
export type PoolKind = LotsDraw['rules']['pool']['kind'];
export type SetupDraft = { preset?: SetupPreset; draw: LotsDraw; shape?: DrawShape; fairness?: Fairness; other?: boolean };

const base = (index: number): LotsDraw => {
  const draw = fixtureDraws[index] ?? fixtureDraws[0];
  if (!draw) throw new Error(copy.empty);
  return draw;
};
export const questionDraw = () => base(0);
export const presetDraw = (preset: SetupPreset): LotsDraw => preset === 'prize' ? { ...base(1), name: 'Free-entry prize' }
  : preset === 'paid' ? base(2) : base(0);

export const shapeNames: Record<DrawShape, string> = { urn: 'Urn', wheel: 'Wheel', deck: 'Deck', ballot_box: 'Ballot box' };
export const shapeOptions: readonly FlowOption[] = [
  { id: 'urn', label: 'Urn', consequence: 'Lots tumble out of the urn’s mouth, one by one.' },
  { id: 'wheel', label: 'Wheel', consequence: 'Lots ride the rim and stop under the pointer.' },
  { id: 'deck', label: 'Deck', consequence: 'Each lot is a pip, dealt off the top of the deck.' },
  { id: 'ballot_box', label: 'Ballot box', consequence: 'Slips rise one at a time through the slot.' },
];

export const poolLabel: Record<PoolKind, string> = {
  chatters: 'Everyone chatting', keyword: 'Anyone who types !join', followers: 'Followers',
  subscribers: 'Subscribers only', redeemers: 'Channel-point redeemers',
};
export function withPool(draw: LotsDraw, kind: PoolKind): LotsDraw {
  return { ...draw, rules: { ...draw.rules, pool: kind === 'keyword' ? { kind: 'keyword', keyword: '!join' } : { kind } },
    policy: { ...draw.policy, subscriber_only: kind === 'subscribers', channel_points: kind === 'redeemers' } };
}
export const lotCount = (draw: LotsDraw) => fixturePool(draw).length;

export function withRules(draw: LotsDraw, change: Partial<LotsDraw['rules']>): LotsDraw {
  return { ...draw, rules: { ...draw.rules, ...change } };
}
export function withPolicy(draw: LotsDraw, change: Partial<LotsDraw['policy']>): LotsDraw {
  return { ...draw, policy: { ...draw.policy, ...change } };
}
export const capOf = (numerator: number | null): LotsDraw['rules']['cohort_caps'] =>
  numerator === null ? [] : [{ cohort: 'raider', numerator, denominator: 3 }];
export function withOdds(draw: LotsDraw, odds: 'equal' | 'activity'): LotsDraw {
  const equal = odds === 'equal';
  return { ...withRules(draw, { weight_curve: equal ? { kind: 'equal' } : { kind: 'concave', max_units: 4 }, free_join_equal_odds: equal }),
    policy: { ...draw.policy, free_entry_equal_odds: equal } };
}
export function withFairness(draw: LotsDraw, fairness: Fairness): LotsDraw {
  if (fairness === 'balanced') return withOdds(withRules(draw, { cohort_caps: capOf(1), cooldown_s: 600 }), 'equal');
  if (fairness === 'open') return withOdds(withRules(draw, { cohort_caps: [], cooldown_s: 0 }), 'equal');
  if (fairness === 'activity') return withOdds(withRules(draw, { cohort_caps: capOf(1), cooldown_s: 600 }), 'activity');
  return draw;
}
/** A prize back to a plain question: the one escape every guardrail offers. */
export const noPrize = (draw: LotsDraw): LotsDraw =>
  withPolicy(draw, { content: 'question', paid_entry: false, paid_weight: false, prize_value_usd_cents: 0 });

export const fairnessOptions: readonly FlowOption[] = [
  { id: 'balanced', label: 'Balanced', tag: 'Recommended', consequence: 'Raiders take at most 1 of 3 winners; recent winners sit out 10 minutes; equal odds.' },
  { id: 'open', label: 'Wide open', consequence: 'No raider cap, no cooldown, equal odds for everyone in the roll.' },
  { id: 'activity', label: 'Activity counts a little', consequence: 'Chat activity adds weight, each unit less than the last. Money never adds weight.' },
  { id: 'each', label: 'Let me choose each', consequence: 'Set the raider cap, the cooldown and the odds one at a time.' },
];
export const capOptions: readonly FlowOption[] = [
  { id: '1', label: '1 of 3 winners', consequence: 'A raid can join the fun but cannot take the draw.' },
  { id: '2', label: '2 of 3 winners', consequence: 'Raiders may take most, never all, of the winners.' },
  { id: 'none', label: 'No cap', consequence: 'Raiders are drawn like everyone else.' },
  { id: '0', label: 'Raiders sit this one out', consequence: 'Raiders stay in the roll but cannot win this draw.' },
];
export const cooldownOptions: readonly FlowOption[] = [
  { id: '600', label: '10 minutes', consequence: 'Anyone who won in the last 10 minutes sits this one out.' },
  { id: '1800', label: '30 minutes', consequence: 'Recent winners wait half an hour before they can win again.' },
  { id: '14400', label: 'Rest of the stream', consequence: 'One win per viewer for the next four hours.' },
  { id: '0', label: 'No cooldown', consequence: 'Anyone may win again straight away.' },
];
export const oddsOptions: readonly FlowOption[] = [
  { id: 'equal', label: 'Equal odds', consequence: 'Every lot weighs the same, and a free !join always counts in full.' },
  { id: 'activity', label: 'Activity counts a little', consequence: 'Chatting adds weight with diminishing returns, capped at 4 units. Money never adds weight.' },
];

export const capLine = (draw: LotsDraw) => {
  const cap = draw.rules.cohort_caps.find(item => item.cohort === 'raider');
  return !cap ? 'No cap' : cap.numerator === 0 ? 'Raiders sit out' : `At most ${cap.numerator} of ${cap.denominator} winners`;
};
export const capFigure = (draw: LotsDraw) => {
  const cap = draw.rules.cohort_caps.find(item => item.cohort === 'raider');
  return cap ? `${cap.numerator}/${cap.denominator}` : copy.no_cap;
};
export const cooldownLine = (seconds: number) => seconds <= 0 ? 'No cooldown'
  : seconds >= 3600 ? `${Math.round(seconds / 3600)} hours` : `${Math.round(seconds / 60)} minutes`;
export const oddsLine = (draw: LotsDraw) => draw.rules.free_join_equal_odds || draw.rules.weight_curve.kind === 'equal'
  ? 'Equal odds' : 'Activity counts a little · money never';
export const contentLine = (draw: LotsDraw) => draw.policy.content === 'prize'
  ? `Prize · $${(draw.policy.prize_value_usd_cents / 100).toLocaleString('en-US')}`
  : copy.content_options.find(option => option.value === draw.policy.content)?.label ?? draw.policy.content;
/** Cooldown holds out the generated recent winners; with no cooldown nobody is held out. */
export const heldOut = (draw: LotsDraw, generated: number) => draw.rules.cooldown_s > 0 ? generated : 0;

/** The guardrail check in one calm sentence, plus any review notes. */
export function guardrailLines(draw: LotsDraw): FlowLine[] {
  const check = checkFixturePolicy(draw.policy);
  if (check.result === 'ok') return [{ label: 'Guardrails', value: draw.policy.content === 'prize'
    ? 'Clear · free entry, rules attached, Twitch disclaimer acknowledged' : 'Clear · no prize, nothing to block' }];
  const reasons = check.reasons.map(reason => copy.reasons[reason as keyof typeof copy.reasons] ?? reason);
  return [{ label: 'Guardrails', value: check.result === 'blocked' ? 'Blocked' : 'Clear to seal · review before live use' },
    ...reasons.map((reason, index) => ({ label: index ? `Note ${index + 1}` : 'Notes', value: reason }))];
}

export function drawLines(draw: LotsDraw, shape: DrawShape | undefined): FlowLine[] {
  return [
    { label: 'Draw', value: draw.name },
    { label: 'For', value: contentLine(draw) },
    { label: 'Who can enter', value: `${poolLabel[draw.rules.pool.kind]} · ${lotCount(draw)} lots` },
    { label: 'Winners', value: String(draw.rules.winner_count) },
    { label: 'Raiders', value: capLine(draw) },
    { label: 'Cooldown', value: cooldownLine(draw.rules.cooldown_s) },
    { label: 'Odds', value: oddsLine(draw) },
    ...(shape ? [{ label: 'On stream', value: shapeNames[shape] }] : []),
  ];
}

export function winnerOptions(count: number, current: number): FlowOption[] {
  const tiers: [number, string, string][] = [[1, '1 winner', 'One name, one moment.'], [3, '3 · the hearth', 'A small room: three winners.'],
    [7, '7 · the hall', 'A busy evening: seven winners.'], [15, '15 · the courtyard', 'A big crowd: fifteen winners.']];
  return [...tiers.filter(([value]) => value <= count).map(([value, label, line]) => ({ id: String(value), label,
    consequence: `${line} About 1 in ${Math.max(1, Math.round(count / value))} lots wins.`, ...(value === current ? { tag: 'Now' } : {}) })),
    { id: 'other', label: 'Another number', consequence: `Any count from 1 to ${count}.` }];
}
export const parseWinners = (raw: string, count: number): string | null => {
  const value = Number(raw);
  return raw.trim() && Number.isInteger(value) && value >= 1 && value <= count ? null : `Choose a whole number from 1 to ${count}.`;
};
