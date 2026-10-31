import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { parseJson } from '@castle-control/contract/door';
import { parseMethodParams } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import { fixtureCharts, fixtureMessages, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { previewPattern } from './moderation-pattern.js';
import { benchInput, createRuleBench, drillBenchRule, evaluateDraft, saveBenchRule } from './moderation-bench.js';
import { createCoreGatehousePort } from './gatehouse-core.js';
import type { GatehouseNetwork } from './gatehouse-core.js';

test('shared Rust/TypeScript vectors prove normalized Unicode pattern parity', () => {
  const vectors = parseJson(readFileSync(new URL('../../../crates/cc-gatehouse/src/pattern_vectors.json', import.meta.url), 'utf8'));
  if (!Array.isArray(vectors) || !vectors.length) throw new Error('Missing parity inventory');
  for (const value of vectors) {
    const row: unknown = value;
    if (!row || typeof row !== 'object' || !('pattern' in row) || typeof row.pattern !== 'string'
      || !('text' in row) || typeof row.text !== 'string' || !('expected' in row) || typeof row.expected !== 'boolean') {
      throw new Error('Invalid parity vector');
    }
    expect(previewPattern(row.pattern, row.text), `${row.pattern}: ${row.text}`).toEqual({ ok: true, matches: row.expected });
  }
});

test('unsupported and invalid syntax refuses without hits or exceptions', () => {
  for (const pattern of ['(?=x)', 'a\\1', '(?i)foo', '\\w+', '\\bword\\b', '[a&&b]', '(a+)+']) {
    expect(previewPattern(pattern, 'aaaa word')).toEqual({ ok: false, refusal: 'unsupported_by_gate', matches: false });
  }
  for (const pattern of ['(', '[', '', 'x'.repeat(501)]) {
    expect(previewPattern(pattern, 'x')).toEqual({ ok: false, refusal: 'invalid', matches: false });
  }
  for (const pattern of ['(?=x)', '(']) {
    const result = evaluateDraft({ name: 'Draft', pattern, action: 'delete' }, fixtureRules.rules, fixtureMessages.slice(0, 420));
    expect(result.ok).toBe(false); expect(result.hit_ids.size).toBe(0); expect(result.total_hits).toBe(0);
  }
});

test('new drafts are schema-valid shadow rules with counts tied to the current verdict', () => {
  const messages = fixtureMessages.slice(0, 420);
  const result = evaluateDraft({ name: 'Caps lock!', pattern: 'go left', action: 'delete' }, fixtureRules.rules, messages);
  if (!result.ok) throw new Error(result.refusal);
  const hits = messages.filter(item => item.message_text?.toLowerCase().includes('go left'));
  expect(result.rule.rule_id).toBe('caps-lock');
  expect(parseMethodParams(gatehouseRulesUpsert, { rule: result.rule }).rule.mode).toBe('shadow');
  expect(result.total_hits).toBe(hits.length);
  expect(result.newly_acting).toBe(hits.filter(item => item.verdict === 'pass').length);
  expect([...result.hit_ids]).toEqual(hits.map(item => item.message_id));
  const before = structuredClone(fixtureRules.rules);
  const collision = evaluateDraft({ name: 'Links', pattern: 'go left', action: 'delete' }, fixtureRules.rules, messages);
  expect(collision.ok && collision.rule.rule_id).toBe('links-2');
  expect(fixtureRules.rules).toEqual(before);
});

test('newly-acting is the passed subset, not a prediction of safety or held outcomes', () => {
  const messages = fixtureMessages.slice(0, 3).map((item, index) => ({ ...item, message_text: 'GO LEFT!', verdict: (['pass', 'hold', 'bar'] as const)[index] ?? 'hold' }));
  const result = evaluateDraft({ name: 'New', pattern: 'go left', action: 'timeout' }, [], messages);
  expect(result.total_hits).toBe(3); expect(result.newly_acting).toBe(1);
  expect(result.ok && result.rule.timeout_s).toBe(60);
});

test('one draft store retains selection across route mounts and edits preserve existing identity/action', () => {
  const bench = createRuleBench(); const listener = vi.fn(); const unsubscribe = bench.subscribe(listener);
  bench.select(''); bench.setDraft({ name: 'New rule', pattern: 'left', action: 'warn' });
  expect(benchInput(bench.getSnapshot(), fixtureRules.rules).selection).toBe('');
  bench.select('repeats');
  const { input, original } = benchInput(bench.getSnapshot(), fixtureRules.rules);
  const result = evaluateDraft({ ...input, name: 'Edited', pattern: 'left' }, fixtureRules.rules, [], original);
  expect(result.ok && result.rule).toMatchObject({ rule_id: 'repeats', action: 'timeout', timeout_s: 60, mode: 'shadow' });
  expect(listener).toHaveBeenCalledTimes(3); unsubscribe();
});

test('core saves exactly one shadow upsert and compares against the saved recording/configuration', async () => {
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async (_endpoint, _session, method, params) => {
    if (method === 'gatehouse.rules.list') return fixtureRules;
    if (method === 'gatehouse.consensus.get') return fixtureCharts[0];
    if (method === 'gatehouse.chat.list' || method === 'gatehouse.history.list') return { items: [], unavailable_count: 0 };
    if (method === 'gatehouse.rules.upsert') return parseMethodParams(gatehouseRulesUpsert, params).rule;
    if (method === 'gatehouse.drill.diff') return { label: 'simulated', baseline: fixtureReplay, candidate: fixtureReplay, changes: [] };
    throw new Error(`Unexpected method ${method}`);
  });
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  await port.load(); rpc.mockClear();
  const draft = evaluateDraft({ name: 'Caps lock!', pattern: 'go left', action: 'delete' }, port.getSnapshot().rules, []);
  if (!draft.ok) throw new Error(draft.refusal);
  expect(await drillBenchRule(port, draft)).toBe(false); expect(rpc).not.toHaveBeenCalled();
  const configuration = { rules: [...port.getSnapshot().rules], bank: 'simulated-bank', judge: 'simulated-judge', prompts: [] };
  await port.saveBaseline({ recording: 'simulated-bench-recording', configuration });
  expect(await drillBenchRule(port, draft)).toBe(true);
  expect(rpc.mock.calls.map(call => call.slice(2))).toEqual([['gatehouse.drill.diff', {
    recording: 'simulated-bench-recording', baseline: configuration, candidate: { ...configuration, rules: [...configuration.rules, draft.rule] },
  }]]);
  expect(port.getSnapshot().diff?.candidate).toEqual(fixtureReplay);
  rpc.mockClear(); expect(await saveBenchRule(port, draft)).toBe(true);
  expect(rpc.mock.calls.map(call => call.slice(2))).toEqual([['gatehouse.rules.upsert', { rule: draft.rule }]]);
  expect(draft.rule.mode).toBe('shadow');
  // Saving first must not duplicate the draft in the comparison candidate or mutate the baseline.
  rpc.mockClear(); await drillBenchRule(port, draft);
  expect(rpc.mock.calls[0]?.[3]).toMatchObject({ baseline: configuration, candidate: { rules: [...configuration.rules, draft.rule] } });
  expect(port.getSnapshot().baseline).toEqual(configuration);
});
