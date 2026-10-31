import { parseMethodParams } from '@castle-control/contract';
import type { Action, Decision, Rule } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import type { CoreGatehousePort } from './gatehouse-core.js';
import { compilePreviewPattern } from './moderation-pattern.js';
import type { PatternRefusal } from './moderation-pattern.js';

export type RuleDraft = { name: string; pattern: string; action: Action };
export type BenchMessage = Pick<Decision, 'message_id' | 'message_text' | 'verdict'>;
type Counts = { hit_ids: ReadonlySet<string>; total_hits: number; newly_acting: number; samples: readonly BenchMessage[] };
export type BenchResult = Counts & ({ ok: true; rule: Rule } | { ok: false; refusal: PatternRefusal });
export type BenchSnapshot = { selection?: string; draft?: RuleDraft };

export function createRuleBench() {
  let state: BenchSnapshot = {};
  const listeners = new Set<() => void>();
  const publish = (next: BenchSnapshot) => { state = next; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(selection: string) { publish({ selection }); },
    setDraft(draft: RuleDraft, selection = '') { publish({ selection, draft: { ...draft } }); },
  };
}
export type RuleBenchPort = ReturnType<typeof createRuleBench>;

export function benchInput(state: BenchSnapshot, rules: readonly Rule[]) {
  const editable = rules.filter(rule => rule.mode === 'shadow' && rule.rule_class === 'pattern');
  const selection = state.selection ?? editable[0]?.rule_id ?? '';
  const original = editable.find(rule => rule.rule_id === selection);
  const input = state.draft ?? { name: original?.name ?? '', pattern: original?.pattern ?? '', action: original?.action ?? 'delete' };
  return { selection, original, input };
}

export function evaluateDraft(input: RuleDraft, rules: readonly Rule[], messages: readonly BenchMessage[], original?: Rule): BenchResult {
  const empty: Counts = { hit_ids: new Set(), total_hits: 0, newly_acting: 0, samples: [] };
  const compiled = compilePreviewPattern(input.pattern);
  if (!compiled.ok) return { ...empty, ok: false, refusal: compiled.refusal };
  if (original && (original.mode !== 'shadow' || original.rule_class !== 'pattern')) return { ...empty, ok: false, refusal: 'invalid' };
  const slug = input.name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/g, '') || 'rule';
  let rule_id = slug; let suffix = 2;
  while (!original && rules.some(rule => rule.rule_id === rule_id)) rule_id = `${slug}-${suffix++}`;
  let rule: Rule;
  try {
    rule = parseMethodParams(gatehouseRulesUpsert, { rule: original
      ? { ...original, name: input.name.trim(), pattern: input.pattern, mode: 'shadow' }
      : { rule_id, name: input.name.trim(), pattern: input.pattern, action: input.action, mode: 'shadow', rule_class: 'pattern', delivery: 'streamer',
        ...(input.action === 'timeout' ? { timeout_s: 60 } : {}) } }).rule;
  } catch { return { ...empty, ok: false, refusal: 'invalid' }; }
  const hits = messages.filter(message => message.message_text !== undefined && compiled.matches(message.message_text));
  return { ok: true, rule, hit_ids: new Set(hits.map(message => message.message_id)), total_hits: hits.length,
    newly_acting: hits.filter(message => message.verdict === 'pass').length, samples: hits.slice(0, 3) };
}

export async function saveBenchRule(port: CoreGatehousePort, result: BenchResult): Promise<boolean> {
  if (!result.ok || result.rule.mode !== 'shadow' || port.getSnapshot().busy) return false;
  await port.upsertRule({ rule: result.rule });
  return port.getSnapshot().phase !== 'error';
}

export async function drillBenchRule(port: CoreGatehousePort, result: BenchResult): Promise<boolean> {
  const state = port.getSnapshot();
  if (!result.ok || state.busy || !state.baseline || !state.baseline_recording) return false;
  const rules = state.rules.some(rule => rule.rule_id === result.rule.rule_id)
    ? state.rules.map(rule => rule.rule_id === result.rule.rule_id ? result.rule : rule) : [...state.rules, result.rule];
  await port.diffDrill({ recording: state.baseline_recording, baseline: state.baseline, candidate: { ...state.baseline, rules } });
  return port.getSnapshot().phase !== 'error';
}
