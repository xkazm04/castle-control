import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Rule } from '@castle-control/contract';
import { parseMethodParams } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import { FieldGroup, HeraldicCard, InkButton } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { benchInput } from '../../moderation-bench.js';
import type { BenchResult, RuleBenchPort, RuleDraft } from '../../moderation-bench.js';
import { compilePreviewPattern } from '../../moderation-pattern.js';
import { proposeCommand } from './session.js';

/** Reuses the existing upsert payload; the fixture port never imports a transport. */
export function proposeWatchingRule(queue: ProposalQueue, original: Rule, name: string, pattern: string): void {
  if (original.mode !== 'shadow' || original.rule_class !== 'pattern') throw new Error(copy.rule_invalid);
  const { rule } = parseMethodParams(gatehouseRulesUpsert, { rule: { ...original, name: name.trim(), pattern } });
  const preview = compilePreviewPattern(rule.pattern ?? '');
  if (!preview.ok) throw new Error(copy[preview.refusal]);
  proposeCommand(queue, { kind: 'rule', rule }, `Edit watching rule: ${rule.name}`);
}

export function WatchingRuleEditor({ rules, queue, bench, result, busy = false, on_save, children }: {
  rules: readonly Rule[]; queue?: ProposalQueue | undefined; bench: RuleBenchPort; result: BenchResult; busy?: boolean;
  on_save?: ((rule: Rule) => void) | undefined; children?: ReactNode;
}) {
  const editable = rules.filter(rule => rule.rule_class === 'pattern' && rule.mode === 'shadow');
  const state = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const { selection, original, input } = benchInput(state, rules);
  const [notice, setNotice] = useState('');
  const change = (next: Partial<RuleDraft>) => { setNotice(''); bench.setDraft({ ...input, ...next }, selection); };
  return <HeraldicCard className="moderator-rule-editor"><h3>{copy.rule_bench}</h3><p className="moderator-small">{copy.bench_hint}</p>
    <FieldGroup label={copy.rule_choose} control_id="watching-rule" variant="select">
      <select id="watching-rule" value={selection} disabled={busy} onChange={event => { bench.select(event.currentTarget.value); setNotice(''); }}>
        <option value="">{copy.new_watching}</option>
        {editable.map(item => <option key={item.rule_id} value={item.rule_id}>{item.name}</option>)}
      </select></FieldGroup>
    <form className="moderator-rule-form" onSubmit={event => {
      event.preventDefault();
      if (busy || !result.ok) return;
      try {
        if (on_save) on_save(result.rule);
        else if (queue && original) proposeWatchingRule(queue, original, input.name, input.pattern);
        else if (queue) proposeCommand(queue, { kind: 'rule', rule: result.rule }, `New watching rule: ${result.rule.name}`);
        setNotice(queue ? copy.rule_proposed : copy.bench_save_pending);
      } catch { setNotice(copy.rule_invalid); }
    }}>
      <FieldGroup label={copy.watching_name} control_id="watching-name"><input id="watching-name" value={input.name} required maxLength={120}
        disabled={busy} onChange={event => change({ name: event.currentTarget.value })} /></FieldGroup>
      <FieldGroup label={copy.watching_pattern} control_id="watching-pattern"><input id="watching-pattern" value={input.pattern} required maxLength={500}
        disabled={busy} onChange={event => change({ pattern: event.currentTarget.value })} /></FieldGroup>
      {!original && <FieldGroup label={copy.draft_action} control_id="watching-action" variant="select">
        <select id="watching-action" value={input.action} disabled={busy} onChange={event => {
          const action = event.currentTarget.value;
          if (action === 'warn' || action === 'delete' || action === 'timeout' || action === 'hold') change({ action });
        }}>{(['warn', 'delete', 'timeout', 'hold'] as const).map(action => <option key={action} value={action}>{action}</option>)}</select>
      </FieldGroup>}
      <p className="moderator-small">{copy.bench_shadow}{original && ` · ${original.action}`}</p>
      <InkButton type="submit" size="room" disabled={busy || !result.ok}>{queue ? copy.propose_rule : original ? copy.save_watching : copy.save_as_watching}</InkButton>
      <p className="moderator-small">{notice}</p>
    </form>{children}
  </HeraldicCard>;
}
