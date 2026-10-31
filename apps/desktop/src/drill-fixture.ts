import { gatehouseDrillRun, parseMethodResult } from '@castle-control/contract';
import { gatehouseDrillDiff } from '@castle-control/contract/gatehouse';
import type { DrillDiffResult, DrillRunResult, DrillState } from '@castle-control/contract';

// Generated, never recorded chat. A string seed draws the same simulated night every run.
const source = 'simulated-generated-room';
const hash = 'a'.repeat(64);
// The recording gap opens at this instant; the rest of the night is placed around it.
const gap_opens = Date.parse('2026-10-26T12:05:00Z');

// The fixture rule table: what each rule would do and the verdict it ends in.
const stops = [
  { rule_id: 'links', action: 'delete', verdict: 'hold' },
  { rule_id: 'repeats', action: 'timeout', verdict: 'bar' },
  { rule_id: 'blocked-terms', action: 'ban', verdict: 'hold' },
] as const;
const unresolved: readonly DrillState[] = ['judge_pending', 'engine_failed', 'not_evaluable', 'judge_void'];

/** FNV-1a over the seed text, then mulberry32: small, seeded and dependency free. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

type Drawn = { message_id: string; at: number; source: string; state: DrillState; verdict?: 'hold' | 'bar' | 'pass'; action?: string; rule_id?: string; passed?: boolean };
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
export type SimulatedDrillOptions = { seed?: string; count?: number; gap_s?: number };

/** Bursty chat with a stop every dozen lines or so, two of them side by side, and one recording gap. */
export function simulatedDrill({ seed = 'castle-night', count = 40, gap_s = 20 }: SimulatedDrillOptions = {}): DrillRunResult {
  const random = seededRandom(seed);
  const stopped = new Map<number, number>();
  const wanted = Math.max(3, Math.round(count * 0.075));
  if (count <= 60) {
    // The small night is hand-placed so the cluster is always on screen.
    for (const [slot, share] of [0.18, 0.43, 0.46].entries()) stopped.set(Math.round(count * share), slot);
  } else {
    while (stopped.size < wanted) {
      const index = 2 + Math.floor(random() * (count - 4));
      stopped.set(index, stopped.size % stops.length);
      if (random() < 0.35 && index + 1 < count - 1) stopped.set(index + 1, stopped.size % stops.length);
    }
  }
  const pending = new Set<number>();
  while (pending.size < Math.max(2, Math.round(count * 0.03))) {
    const index = 1 + Math.floor(random() * (count - 2));
    if (!stopped.has(index)) pending.add(index);
  }
  const gap_after = Math.floor(count * 0.55);
  const gap = { from: 0, to: 0 };
  let clock = 0; let unresolved_count = 0;
  const drawn = Array.from({ length: count }, (_, index): Drawn => {
    // Quiet stretches, bursts and steady chat: the spacing is never uniform.
    const roll = random();
    clock += roll < 0.14 ? 4000 + Math.floor(random() * 3000) : roll < 0.4 ? 250 + Math.floor(random() * 450) : 1100 + Math.floor(random() * 1700);
    if (index === gap_after) {
      gap.from = clock; clock += gap_s * 1000; gap.to = clock; clock += 1500;
    }
    const base = { message_id: `simulated-message-${index}`, at: clock, source };
    const stop = stopped.has(index) ? stops[stopped.get(index) ?? 0] : undefined;
    if (stop) {
      // One stopped line is judged a false positive so the over-moderation axis has a number.
      return { ...base, state: 'acted', verdict: stop.verdict, action: stop.action, rule_id: stop.rule_id, passed: index % 2 === 1 };
    }
    if (pending.has(index)) return { ...base, state: unresolved[unresolved_count++ % unresolved.length] ?? 'judge_pending' };
    return { ...base, state: 'not_provoked', verdict: 'pass', passed: true };
  });
  const shift = gap_opens - gap.from;
  const outcomes = drawn.map(outcome => ({ ...outcome, at: iso(outcome.at + shift) }));
  return parseMethodResult(gatehouseDrillRun, JSON.stringify(runBody(outcomes, [{ from: iso(gap.from + shift), to: iso(gap.to + shift) }])));
}

type Line = { message_id: string; at: string; source: string; state: DrillState; verdict?: string; action?: string; rule_id?: string; passed?: boolean };
/** A run body whose summary is counted from its outcomes, so the two can never disagree. */
function runBody(outcomes: readonly Line[], gaps: readonly { from: string; to: string }[]) {
  const states: Record<DrillState, number> = { acted: 0, not_provoked: 0, not_evaluable: 0, judge_pending: 0, judge_void: 0, engine_failed: 0 };
  for (const outcome of outcomes) states[outcome.state] += 1;
  const acted = outcomes.filter(outcome => outcome.state === 'acted');
  return {
    label: 'simulated', source, instrument_hash: hash,
    instrument: { rules_hash: hash, bank_hash: hash, judge_hash: hash, prompts_hash: hash },
    outcomes,
    summary: { passes: outcomes.filter(outcome => outcome.passed === true).length, states,
      over_moderation: { evaluated: acted.length, false_positives: acted.filter(outcome => outcome.passed === false).length } },
    gaps,
  };
}

/**
 * A simulated candidate rule set for the same recording: the links rule is disarmed and the
 * repeats rule is tightened, so one stop is released and a few new ones appear. The candidate
 * gets its own instrument hash, because a run with different rules is never the same instrument.
 */
export function simulatedCandidate(baseline: DrillRunResult, seed = 'castle-candidate'): DrillDiffResult {
  const random = seededRandom(seed);
  const aired = baseline.outcomes.filter(outcome => outcome.verdict === 'pass' || outcome.state === 'not_provoked');
  const tightened = new Set(aired.filter((_, position) => position > 3 && random() < 0.12).slice(0, 4).map(outcome => outcome.message_id));
  const outcomes: Line[] = baseline.outcomes.map(outcome => {
    const line = { message_id: outcome.message_id, at: outcome.at, source: 'simulated-candidate-room' };
    if (outcome.rule_id === 'links') return { ...line, state: 'not_provoked', verdict: 'pass', passed: true };
    if (tightened.has(outcome.message_id)) return { ...line, state: 'acted', verdict: 'hold', action: 'timeout', rule_id: 'repeats', passed: true };
    return { ...line, state: outcome.state, ...(outcome.verdict ? { verdict: outcome.verdict } : {}), ...(outcome.action ? { action: outcome.action } : {}),
      ...(outcome.rule_id ? { rule_id: outcome.rule_id } : {}), ...(outcome.passed === undefined ? {} : { passed: outcome.passed }) };
  });
  const run = runBody(outcomes, baseline.gaps);
  const candidate_hash = 'b'.repeat(64);
  const changes = baseline.outcomes.flatMap((before, index) => {
    const after = outcomes[index];
    return after && after.state !== before.state ? [{ message_id: before.message_id, before: before.state, after: after.state }] : [];
  });
  return parseMethodResult(gatehouseDrillDiff, JSON.stringify({ label: 'simulated', baseline,
    candidate: { ...run, instrument_hash: candidate_hash, instrument: { ...run.instrument, rules_hash: candidate_hash } }, changes }));
}

// Hashes are illustrative fixture identifiers, never presented as a computed live instrument.
export const fixtureReplay: DrillRunResult = simulatedDrill();
export const fixtureCandidate: DrillDiffResult = simulatedCandidate(fixtureReplay);
