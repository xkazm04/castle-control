import { useRef, useState, useSyncExternalStore } from 'react';
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
  on_save?: ((rule: Rule) => Promise<{ saved: boolean; notice: string }>) | undefined; children?: ReactNode;
}) {
  const editable = rules.filter(rule => rule.rule_class === 'pattern' && rule.mode === 'shadow');
  const state = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const { selection, original, input } = benchInput(state, rules);
  const [notice, setNotice] = useState({ text: '', error: false });
  const pending = useRef(false);
  const edit = useRef(0);
  const clearNotice = () => { edit.current++; setNotice({ text: '', error: false }); };
  const change = (next: Partial<RuleDraft>) => { clearNotice(); bench.setDraft({ ...input, ...next }, selection); };
  return <HeraldicCard className="moderator-rule-editor"><h3>{copy.rule_bench}</h3><p className="moderator-small">{copy.bench_hint}</p>
    <FieldGroup label={copy.rule_choose} control_id="watching-rule" variant="select">
      <select id="watching-rule" value={selection} disabled={busy} onChange={event => { bench.select(event.currentTarget.value); clearNotice(); }}>
        <option value="">{copy.new_watching}</option>
        {editable.map(item => <option key={item.rule_id} value={item.rule_id}>{item.name}</option>)}
      </select></FieldGroup>
    <form className="moderator-rule-form" onSubmit={async event => {
      event.preventDefault();
      if (busy || pending.current || !result.ok) return;
      const revision = edit.current;
      pending.current = true;
      try {
        if (on_save) {
          setNotice({ text: copy.bench_save_pending, error: false });
          const outcome = await on_save(result.rule);
          if (revision === edit.current) setNotice({ text: outcome.saved ? copy.bench_saved(result.rule.rule_id) : copy.bench_save_failed(outcome.notice), error: !outcome.saved });
        } else if (queue) {
          if (original) proposeWatchingRule(queue, original, input.name, input.pattern);
          else proposeCommand(queue, { kind: 'rule', rule: result.rule }, `New watching rule: ${result.rule.name}`);
          setNotice({ text: copy.rule_proposed, error: false });
        }
      } catch {
        if (revision === edit.current) setNotice({ text: copy.rule_invalid, error: true });
      } finally { pending.current = false; }
    }}>
      <FieldGroup label={copy.watching_name} control_id="watching-name"><input id="watching-name" value={input.name} required maxLength={120}
        disabled={busy} onChange={event => change({ name: event.currentTarget.value })} /></FieldGroup>
      <FieldGroup label={copy.watching_pattern} control_id="watching-pattern"><input id="watching-pattern" value={input.pattern} required maxLength={500}
        disabled={busy} onChange={event => change({ pattern: event.currentTarget.value })} /></FieldGroup>
      {!original && <FieldGroup label={copy.draft_action} control_id="watching-action" variant="select">
        <select id="watching-action" value={input.action} disabled={busy} onChange={event => {
          const action = event.currentTarget.value;
          if (action === 'warn' || action === 'delete' || action === 'timeout' || action === 'hold') change({ action });
        }}>{(['warn', 'delete', 'timeout', 'hold'] as const).map(action => <option key={action} value={action}>{copy.draft_actions[action]}</option>)}</select>
      </FieldGroup>}
      <p className="moderator-small">{copy.bench_shadow}{original && ` · ${copy.rule_action(original.action, original.timeout_s)}`}</p>
      <InkButton type="submit" size="room" disabled={busy || !result.ok}>{queue ? copy.propose_rule : original ? copy.save_watching : copy.save_as_watching}</InkButton>
      <p className="moderator-small" role={notice.error ? 'alert' : undefined}>{notice.text}</p>
    </form>{children}
  </HeraldicCard>;
}
