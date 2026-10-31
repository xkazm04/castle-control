import { useState } from 'react';
import type { Rule } from '@castle-control/contract';
import { parseMethodParams } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import { FieldGroup, HeraldicCard, InkButton } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { proposeCommand } from './session.js';

/** Reuses the existing upsert payload; the fixture port never imports a transport. */
export function proposeWatchingRule(queue: ProposalQueue, original: Rule, name: string, pattern: string): void {
  if (original.mode !== 'shadow' || original.rule_class !== 'pattern') throw new Error(copy.rule_invalid);
  const { rule } = parseMethodParams(gatehouseRulesUpsert, { rule: { ...original, name: name.trim(), pattern: pattern.trim() } });
  // Fixture-side syntax feedback only; the Rust core remains the live regex authority.
  new RegExp(rule.pattern ?? '');
  proposeCommand(queue, { kind: 'rule', rule }, `Edit watching rule: ${rule.name}`);
}

export function WatchingRuleEditor({ rules, queue }: { rules: readonly Rule[]; queue: ProposalQueue }) {
  const editable = rules.filter(rule => rule.rule_class === 'pattern' && rule.mode === 'shadow');
  const [selected, setSelected] = useState(editable[0]?.rule_id ?? '');
  const rule = editable.find(item => item.rule_id === selected);
  return <HeraldicCard className="moderator-rule-editor"><h4>{copy.rule_editor}</h4><p className="moderator-small">{copy.rule_editor_hint}</p>
    <FieldGroup label={copy.rule_choose} control_id="watching-rule" variant="select">
      <select id="watching-rule" value={selected} onChange={event => setSelected(event.currentTarget.value)}>
        {editable.map(item => <option key={item.rule_id} value={item.rule_id}>{item.name}</option>)}
      </select></FieldGroup>
    {rule ? <WatchingRuleForm key={JSON.stringify(rule)} rule={rule} queue={queue} /> : <p>{copy.core_rules_empty}</p>}
  </HeraldicCard>;
}

function WatchingRuleForm({ rule, queue }: { rule: Rule; queue: ProposalQueue }) {
  const [name, setName] = useState(rule.name); const [pattern, setPattern] = useState(rule.pattern ?? '');
  const [notice, setNotice] = useState(''); const [error, setError] = useState(false);
  return <form className="moderator-rule-form" onSubmit={event => {
    event.preventDefault();
    try { proposeWatchingRule(queue, rule, name, pattern); setError(false); setNotice(copy.rule_proposed); }
    catch { setError(true); setNotice(copy.rule_invalid); }
  }}>
    <FieldGroup label={copy.watching_name} control_id="watching-name"><input id="watching-name" value={name} required maxLength={120}
      onChange={event => setName(event.currentTarget.value)} /></FieldGroup>
    <FieldGroup label={copy.watching_pattern} control_id="watching-pattern"><input id="watching-pattern" value={pattern} required maxLength={500}
      onChange={event => setPattern(event.currentTarget.value)} /></FieldGroup>
    <InkButton type="submit" size="room">{copy.propose_rule}</InkButton>
    <p role={error ? 'alert' : 'status'} className="moderator-small">{notice}</p>
  </form>;
}
