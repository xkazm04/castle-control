import { parseMethodParams, parseMethodResult, gatehouseRulesList, gatehouseBanConfirm, gatehouseConsensusGet, gatehouseDrillRun,
  gatehouseDelaySet, gatehouseShieldSet, gatehouseHeldResolve } from '@castle-control/contract';
import type { ChatDelay, ConsensusFilter, ConsensusGetResult, Decision, DrillRunResult, HeldOutcome, RulesListResult } from '@castle-control/contract';
import { moderationCopy as copy } from './moderation-copy.js';

export const fixtureLabel = 'simulated';
const at = '2026-10-26T12:15:00Z';
const source = 'simulated-generated-room';
const heldText = copy.fixture_held_text;
const banText = 'Simulated original message: simulated-blocked, quoted for human review.';

// All fixture boundary decoding uses the contract door, including branded IDs.
export const fixtureRules: RulesListResult = parseMethodResult(gatehouseRulesList, JSON.stringify({ rules: [
  { rule_id: 'links', name: 'Links', rule_class: 'pattern', pattern: 'https?://', action: 'delete', mode: 'shadow', delivery: 'streamer' },
  { rule_id: 'repeats', name: 'Repeated messages', rule_class: 'pattern', pattern: 'repeat', action: 'timeout', timeout_s: 60, mode: 'shadow', delivery: 'streamer' },
  { rule_id: 'blocked-terms', name: 'Blocked terms', rule_class: 'pattern', pattern: 'simulated-blocked', action: 'ban', mode: 'shadow', delivery: 'streamer' },
] }));

function decision(index: number, kind: Decision['kind'], verdict: Decision['verdict'], message_text: string, rule_id = 'links'): Decision {
  return parseMethodResult(gatehouseBanConfirm, JSON.stringify({
    decision_id: `01ARZ3NDEKTSV4RRFF${String(index).padStart(8, '0')}`,
    message_id: `simulated-message-${index}`, at, kind, verdict, rule_id,
    message_text, operator: 'human', simulated: true, reason_codes: ['simulated_pattern_match'],
  }));
}

export const fixtureMessages: readonly Decision[] = Array.from({ length: 4200 }, (_, index) => {
  const verdict = index % 13 === 0 ? 'hold' : index % 7 === 0 ? 'bar' : 'pass';
  const text = index === 0 ? heldText : index === 26 ? banText : verdict === 'hold' ? `Simulated question ${index}: may I share a link?`
    : verdict === 'bar' ? `Simulated repeated message ${index}` : `Simulated viewer ${index}: go ${index % 2 ? 'left' : 'right'}!`;
  return decision(index, 'would_act', verdict, text, index === 26 ? 'blocked-terms' : 'links');
});
export const fixtureHeld = [decision(0, 'held', 'hold', heldText)];
export const fixtureBans = [decision(26, 'ban_pending', 'hold', banText, 'blocked-terms')];
export const fixtureLedger = [decision(5003, 'timed_out', 'bar', 'Simulated repeated message before a timeout.', 'repeats'),
  decision(5004, 'would_act', 'hold', 'Simulated link awaiting review.'),
  decision(5005, 'removed', 'bar', copy.fixture_twitch_text, 'repeats')];
// Provenance is local fixture metadata, not a new wire field or an inferred operator rank.
export const fixtureTwitchActions = new Set(fixtureLedger.slice(2).map(item => item.decision_id));
export const fixtureHoldReasons = new Map(fixtureHeld.map(item => [item.message_id, copy.fixture_hold_reason]));
export const fixtureConfirmationMs = 400;
export const fixtureDelay = parseMethodResult(gatehouseDelaySet, '{"delay_s":4}');
export const fixtureShield = parseMethodResult(gatehouseShieldSet, '{"enabled":false}');

export function confirmFixtureDelay(delay_s: ChatDelay) {
  const request = parseMethodParams(gatehouseDelaySet, { delay_s });
  return parseMethodResult(gatehouseDelaySet, JSON.stringify(request));
}
export function confirmFixtureShield(enabled: boolean) {
  const request = parseMethodParams(gatehouseShieldSet, { enabled });
  return parseMethodResult(gatehouseShieldSet, JSON.stringify(request));
}
export function confirmFixtureHeld(target: Decision, outcome: HeldOutcome): Decision {
  const request = parseMethodParams(gatehouseHeldResolve, { message_id: target.message_id, outcome });
  return parseMethodResult(gatehouseHeldResolve, JSON.stringify({ ...target,
    kind: request.outcome === 'allow' ? 'released' : 'removed',
    verdict: request.outcome === 'allow' ? 'pass' : 'bar',
  }));
}

export function fixtureConsensus(filter: ConsensusFilter): ConsensusGetResult {
  const scale = filter.kind === 'emotes' ? 0.8 : filter.kind === 'text' ? 0.9 : filter.kind === 'emote' ? 0.7 : 1;
  return parseMethodResult(gatehouseConsensusGet, JSON.stringify({
    at, window_s: 900, filter, shed_count: filter.kind === 'all' ? 17 : 4,
    directions: ['Go left', 'Hype', 'Skip the boss', 'Go right'].map((label, index) => {
      const series = Array.from({ length: 16 }, (_, minute) => {
        const weights = [40, 28, 19, 13].map((base, position) => base + Math.sin(minute / 3 + position) * 3);
        return {
          at: new Date(Date.parse(at) - (15 - minute) * 60000).toISOString(),
          share: (weights[index] ?? 0) / weights.reduce((sum, weight) => sum + weight, 0) * scale,
        };
      });
      const share = series.at(-1)?.share ?? 0;
      return { key: `direction-${index}`, label, share,
        delta_3m: share - (series.at(-4)?.share ?? 0), messages: Math.round(share * 280), series };
    }),
  }));
}
export const fixtureCharts = [fixtureConsensus({ kind: 'all' }), fixtureConsensus({ kind: 'emotes' }),
  fixtureConsensus({ kind: 'text' }), fixtureConsensus({ kind: 'emote', emote: 'Kappa' })];

// Hashes are illustrative fixture identifiers, never presented as a computed live instrument.
const hash = 'a'.repeat(64);
export const fixtureReplay: DrillRunResult = parseMethodResult(gatehouseDrillRun, JSON.stringify({
  label: fixtureLabel, source, instrument_hash: hash,
  instrument: { rules_hash: hash, bank_hash: hash, judge_hash: hash, prompts_hash: hash },
  outcomes: fixtureMessages.slice(0, 60).map((message, index) => ({
    at: message.at, message_id: message.message_id, source, state: index < 10 ? 'acted' : 'not_provoked',
    verdict: index < 10 ? 'hold' : 'pass', passed: index >= 10,
  })),
  summary: { passes: 50, states: { acted: 10, not_provoked: 50, not_evaluable: 0, judge_pending: 0, judge_void: 0, engine_failed: 0 },
    over_moderation: { evaluated: 20, false_positives: 1 } },
  gaps: [{ from: '2026-10-26T12:05:00Z', to: '2026-10-26T12:05:10Z' }],
}));

// Illustrative consensus per minute from prototype/ai-first/data/sample.js.
// Fictional channel and invented numbers, never live Twitch measurements.
export const illustrativeConsensus = [
  {"minute": 0, "go-left": 37.8, "hype": 24.4, "skip-boss": 28.2, "go-right": 9.7},
  {"minute": 1, "go-left": 38.0, "hype": 22.9, "skip-boss": 30.0, "go-right": 9.1},
  {"minute": 2, "go-left": 39.8, "hype": 21.1, "skip-boss": 29.2, "go-right": 9.8},
  {"minute": 3, "go-left": 42.6, "hype": 21.6, "skip-boss": 27.0, "go-right": 8.8},
  {"minute": 4, "go-left": 36.3, "hype": 32.6, "skip-boss": 22.7, "go-right": 8.3},
  {"minute": 5, "go-left": 35.6, "hype": 33.4, "skip-boss": 23.4, "go-right": 7.6},
  {"minute": 6, "go-left": 38.1, "hype": 31.8, "skip-boss": 22.3, "go-right": 7.8},
  {"minute": 7, "go-left": 43.9, "hype": 21.6, "skip-boss": 24.0, "go-right": 10.5},
  {"minute": 8, "go-left": 46.6, "hype": 18.6, "skip-boss": 24.8, "go-right": 10.0},
  {"minute": 9, "go-left": 45.5, "hype": 19.4, "skip-boss": 25.1, "go-right": 10.0},
  {"minute": 10, "go-left": 49.2, "hype": 19.0, "skip-boss": 22.3, "go-right": 9.5},
  {"minute": 11, "go-left": 49.4, "hype": 18.9, "skip-boss": 23.6, "go-right": 8.1},
  {"minute": 12, "go-left": 49.3, "hype": 18.8, "skip-boss": 22.1, "go-right": 9.9},
  {"minute": 13, "go-left": 51.2, "hype": 19.1, "skip-boss": 20.5, "go-right": 9.2},
  {"minute": 14, "go-left": 51.3, "hype": 20.3, "skip-boss": 20.3, "go-right": 8.1},
] as const;
