import { expect, test } from 'vitest';
import { fixtureCandidate, fixtureReplay } from '../moderation-fixture.js';
import { simulatedCandidate, simulatedDrill } from '../drill-fixture.js';
import { compareMoats } from './moat-compare.js';
import { buildMoat } from './moat-model.js';

const before = buildMoat(fixtureCandidate.baseline);
const after = buildMoat(fixtureCandidate.candidate);

test('the simulated candidate is the same recording under different rules, with its own instrument', () => {
  expect(fixtureCandidate.baseline).toEqual(fixtureReplay);
  expect(fixtureCandidate.candidate.outcomes.map(outcome => outcome.message_id)).toEqual(fixtureReplay.outcomes.map(outcome => outcome.message_id));
  expect(fixtureCandidate.candidate.outcomes.map(outcome => outcome.at)).toEqual(fixtureReplay.outcomes.map(outcome => outcome.at));
  expect(fixtureCandidate.candidate.gaps).toEqual(fixtureReplay.gaps);
  expect(fixtureCandidate.candidate.instrument_hash).not.toBe(fixtureReplay.instrument_hash);
  expect(fixtureCandidate.candidate.instrument.rules_hash).toBe(fixtureCandidate.candidate.instrument_hash);
  expect(simulatedCandidate(fixtureReplay)).toEqual(fixtureCandidate);
  expect(simulatedCandidate(fixtureReplay, 'other')).not.toEqual(fixtureCandidate);
});

test('the candidate summary is counted from its outcomes and its changes are real state changes', () => {
  const run = fixtureCandidate.candidate;
  expect(run.summary.states.acted).toBe(run.outcomes.filter(outcome => outcome.state === 'acted').length);
  expect(run.summary.passes).toBe(run.outcomes.filter(outcome => outcome.passed === true).length);
  expect(fixtureCandidate.changes.length).toBeGreaterThan(0);
  for (const change of fixtureCandidate.changes) {
    const was = fixtureReplay.outcomes.find(outcome => outcome.message_id === change.message_id);
    const now = run.outcomes.find(outcome => outcome.message_id === change.message_id);
    expect(was?.state).toBe(change.before);
    expect(now?.state).toBe(change.after);
    expect(change.before).not.toBe(change.after);
  }
});

test('the comparison finds what changed, what is newly held and what is released', () => {
  const comparison = compareMoats(before, after, fixtureCandidate.changes);
  expect(comparison.aligned).toBe(true);
  expect(before.counts.held).toBe(3);
  expect(after.counts.held).toBe(before.counts.held + comparison.newly_held - comparison.released);
  expect(comparison.released).toBe(1);
  expect(comparison.newly_held).toBeGreaterThan(0);
  expect(comparison.changed.size).toBeGreaterThanOrEqual(comparison.newly_held + comparison.released);
  for (const change of fixtureCandidate.changes) expect(comparison.changed.has(change.message_id)).toBe(true);
});

test('a rule change that keeps the verdict still counts as a change, and identical runs change nothing', () => {
  expect(compareMoats(before, before, []).changed.size).toBe(0);
  const retargeted = buildMoat({ ...fixtureReplay, outcomes: fixtureReplay.outcomes.map(outcome => outcome.rule_id === 'links'
    ? { ...outcome, rule_id: 'repeats' as typeof outcome.rule_id } : outcome) });
  const comparison = compareMoats(before, retargeted, []);
  expect(comparison.changed.size).toBe(1);
  expect(comparison.newly_held + comparison.released).toBe(0);
});

test('runs that do not share a timeline are not drawn on one playhead', () => {
  const other = buildMoat(simulatedDrill({ seed: 'unrelated' }));
  expect(compareMoats(before, other, []).aligned).toBe(false);
});
