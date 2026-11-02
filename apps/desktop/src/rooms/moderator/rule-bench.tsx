import { useSyncExternalStore } from 'react';
import type { Rule } from '@castle-control/contract';
import { InkButton } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { benchInput, drillBenchRule, evaluateDraft, saveBenchRule } from '../../moderation-bench.js';
import type { BenchMessage, BenchResult, RuleBenchPort } from '../../moderation-bench.js';
import type { CoreGatehousePort } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { WatchingRuleEditor } from './watching-rule.jsx';
import type { RuleBenchLink } from './moat-panel.jsx';
import { moatCopy } from '../../moat/moat-copy.js';

export function BenchFeedback({ result }: { result: BenchResult }) {
  return <div className="moderator-bench-feedback">
    <p role="status" aria-live="polite"><span aria-label={copy.draft_hits} data-draft-hits={result.total_hits}>{copy.draft_hit_count(result.total_hits)}</span>
      {' · '}<span aria-label={copy.newly_acting} data-newly-acting={result.newly_acting}>{copy.newly_acting_count(result.newly_acting)}</span></p>
    {!result.ok && <p role="alert" data-pattern-refusal={result.refusal}>{copy[result.refusal]}</p>}
    {result.ok && <p className="moderator-small">{copy.draft_id}: <code>{result.rule.rule_id}</code></p>}
    {result.samples.length > 0 && <ul aria-label={copy.draft_samples}>{result.samples.map(item => <li key={item.message_id} title={item.message_text}>
      {item.message_text}</li>)}</ul>}
    <p className="moderator-small">{copy.bench_safety}</p>
  </div>;
}

/** One editor and one draft; all numbers are pattern hits, never gate verdicts. */
export function RuleBench({ rules, messages, bench, queue, core, ban = false }: {
  rules: readonly Rule[]; messages: readonly BenchMessage[]; bench: RuleBenchPort;
  queue?: ProposalQueue; core?: CoreGatehousePort;
  /** Dress rehearsal only: a ban rule, every ban confirmed by the streamer. */
  ban?: boolean;
}) {
  const state = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const { input, original } = benchInput(state, rules);
  const result = evaluateDraft(input, rules, messages, original);
  const live = core?.getSnapshot();
  const can_drill = !!live?.baseline && !!live.baseline_recording;
  return <section className="moderator-block moderator-rule-bench" aria-label={copy.rule_bench}>
    <WatchingRuleEditor rules={rules} bench={bench} result={result} queue={queue} busy={live?.busy ?? false} ban={ban}
      on_save={core ? async () => {
        const saved = await saveBenchRule(core, result);
        if (saved && result.ok && bench.getSnapshot() === state) bench.setDraft(input, result.rule.rule_id);
        return { saved, notice: core.getSnapshot().notice };
      } : undefined}>
      <BenchFeedback result={result} />
      {core && <><InkButton type="button" size="room" disabled={live?.busy || !result.ok || !can_drill}
        onClick={() => { void drillBenchRule(core, result); }}>{copy.drill_draft}</InkButton>
        {!can_drill && <p>{copy.bench_baseline_needed} <a href="#/chamber/moderator/drill">{copy.open_drill}</a></p>}
        {live?.diff && <a className="moderator-drill-link" href="#/chamber/moderator/drill">{copy.bench_comparison}</a>}
      </>}
    </WatchingRuleEditor>
  </section>;
}

/** The bench edits watching pattern rules only, so only those are offered from the moat. */
export function ruleBenchLink(rules: readonly Rule[], bench: RuleBenchPort): RuleBenchLink {
  return {
    can_open: rule_id => rules.some(rule => rule.rule_id === rule_id && rule.mode === 'shadow' && rule.rule_class === 'pattern'),
    open: rule_id => { bench.select(rule_id); },
    describe: rule_id => {
      const rule = rules.find(item => item.rule_id === rule_id);
      return rule && `${rule.name} · ${moatCopy.rule_mode[rule.mode]}`;
    },
  };
}

export function DraftPatternPreview({ result }: { result: BenchResult }) {
  return <section className="moderator-card moderator-draft-preview" aria-label={copy.draft_preview}>
    <h3>{copy.draft_preview}</h3><p>{copy.draft_preview_note}</p><BenchFeedback result={result} />
  </section>;
}
