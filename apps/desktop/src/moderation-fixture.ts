import { parseResult } from '@castle-control/contract';
import type { ConsensusFilter, ConsensusGetResult, Decision, DrillRunResult, RulesListResult } from '@castle-control/contract';

export const fixtureLabel = 'simulated';
const at = '2026-10-26T12:15:00Z';
const source = 'simulated-generated-room';
const heldText = 'Simulated original held message: can I post my guide?';
const banText = 'Simulated original message: simulated-blocked, quoted for human review.';

// All fixture boundary decoding uses the contract door, including branded IDs.
export const fixtureRules: RulesListResult = parseResult('gatehouse.rules.list', JSON.stringify({ rules: [
  { rule_id: 'links', name: 'Links', rule_class: 'pattern', pattern: 'https?://', action: 'delete', mode: 'shadow', delivery: 'streamer' },
  { rule_id: 'repeats', name: 'Repeated messages', rule_class: 'pattern', pattern: 'repeat', action: 'timeout', timeout_s: 60, mode: 'shadow', delivery: 'streamer' },
  { rule_id: 'blocked-terms', name: 'Blocked terms', rule_class: 'pattern', pattern: 'simulated-blocked', action: 'ban', mode: 'shadow', delivery: 'streamer' },
] }));

function decision(index: number, kind: Decision['kind'], verdict: Decision['verdict'], message_text: string, rule_id = 'links'): Decision {
  return parseResult('gatehouse.ban.confirm', JSON.stringify({
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
  decision(5004, 'would_act', 'hold', 'Simulated link awaiting review.')];

export function fixtureConsensus(filter: ConsensusFilter): ConsensusGetResult {
  const scale = filter.kind === 'emotes' ? 0.8 : filter.kind === 'text' ? 0.9 : filter.kind === 'emote' ? 0.7 : 1;
  return parseResult('gatehouse.consensus.get', JSON.stringify({
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
export const fixtureReplay: DrillRunResult = parseResult('gatehouse.drill.run', JSON.stringify({
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
