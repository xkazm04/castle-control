import { isPending } from '@castle-control/ui/steward';
import type { Proposal, ProposalField, ProposalQueue } from '@castle-control/ui/steward';
import { parseMethodParams } from '@castle-control/contract';
import type { Rule } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import { createRuleBench } from '../../moderation-bench.js';
import type { RuleBenchPort } from '../../moderation-bench.js';
import type { CoreGatehousePort } from '../../gatehouse-core.js';
import { createModerationPreview } from '../../moderation-model.js';
import type { ModerationPort, PreviewCommand } from '../../moderation-model.js';
import { confirmFixtureDelay } from '../../moderation-fixture.js';
import { decisionTransition, LifecycleRefusal, settingTransition } from '../../moderation-lifecycle.js';
import { createOutputPreview } from './output-model.js';
import type { OutputPort } from './output-model.js';

type Session = { port: ModerationPort; commands: Map<string, PreviewCommand>; output: OutputPort; bench: RuleBenchPort };
const sessions = new WeakMap<ProposalQueue, Session>();
const coreBenches = new WeakMap<CoreGatehousePort, RuleBenchPort>();
export function coreRuleBench(port: CoreGatehousePort): RuleBenchPort {
  let bench = coreBenches.get(port);
  if (!bench) { bench = createRuleBench(); coreBenches.set(port, bench); }
  return bench;
}

/** Extend the existing fixture port with sealed new rules. Existing lifecycle,
 * timers, edits and verdicts stay owned by the original moderation model. */
function sessionPreview(): ModerationPort {
  const base = createModerationPreview();
  const added = new Map<string, Rule>();
  const listeners = new Set<() => void>();
  let snapshot = base.getSnapshot();
  function publish() {
    const current = base.getSnapshot();
    const preview_modes = new Map(current.preview_modes);
    for (const rule of added.values()) if (!preview_modes.has(rule.rule_id)) preview_modes.set(rule.rule_id, rule.mode);
    snapshot = { ...current, rules: [...current.rules, ...added.values()], preview_modes };
    for (const listener of listeners) listener();
  }
  base.subscribe(publish);
  return { ...base, getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    send(command) {
      if (command.kind === 'rule' && !base.getSnapshot().rules.some(rule => rule.rule_id === command.rule.rule_id)) {
        const { rule } = parseMethodParams(gatehouseRulesUpsert, { rule: command.rule });
        if (rule.mode !== 'shadow' || rule.rule_class !== 'pattern') throw new Error('Only watching pattern rules can be saved.');
        added.set(rule.rule_id, rule); publish();
      } else base.send(command);
    },
  };
}

export function moderationSession(queue: ProposalQueue): Session {
  let session = sessions.get(queue);
  if (!session) { session = { port: sessionPreview(), commands: new Map(), output: createOutputPreview(), bench: createRuleBench() }; sessions.set(queue, session); }
  return session;
}

export function proposeCommand(queue: ProposalQueue, command: PreviewCommand, title: string): void {
  const session = moderationSession(queue);
  const state = session.port.getSnapshot();
  const target = 'decision_id' in command ? [...state.held, ...state.bans, ...state.ledger].find(item => item.decision_id === command.decision_id) : undefined;
  if ('decision_id' in command) {
    const change = decisionTransition(state, command.decision_id, command.kind);
    if (!change.ok) {
      session.port.refuse(change.refusal);
      if (change.refusal === 'original_unavailable') return;
      // Keep directly requested plans reviewable, including stale/ineligible
      // drafts. The same refusal is enforced again before any seal succeeds.
    }
  }
  let id = `moderation-${queue.getSnapshot().proposals.length + 1}`;
  while (queue.getSnapshot().proposals.some(item => item.id === id)) id += '-next';
  const fields: ProposalField[] = Object.entries(command).map(([key, value]) => ({ key, label: key.replaceAll('_', ' '),
    value: typeof value === 'object' ? JSON.stringify(value) : value, struck: [] }));
  if (command.kind === 'shield') fields.push({ key: 'enabled', label: 'Shield Mode after sealing', value: !state.shield.value, struck: [] });
  if (target?.message_text) fields.push({ key: 'original', label: 'Original message', value: target.message_text, struck: [] });
  queue.addOrUpdate({ id, chamber: 'moderator', kind: 'seal', title, revision: 1, state: 'drafted', fields });
  session.commands.set(id, command);
  queue.select(id);
}

/** Maps the offline Steward grammar to the existing local model. Never a live call. */
export function sealModerationProposal(queue: ProposalQueue, proposal: Proposal): void {
  const { port, commands } = moderationSession(queue);
  if (!isPending(proposal) || proposal.kind !== 'seal' || queue.getSnapshot().proposals.find(item => item.id === proposal.id) !== proposal) {
    throw new Error('Choose a current open moderation proposal.');
  }
  const snapshot = port.getSnapshot();
  let pending: readonly PreviewCommand[];
  const command = commands.get(proposal.id);
  if (command) {
    // Room commands are immutable plans: amendments require a new reviewed command.
    if (proposal.revision !== 1) throw new Error('Draft a new moderation command to change its target.');
    if (command.kind === 'shield' && proposal.fields.find(field => field.key === 'enabled')?.value === snapshot.shield.value) {
      throw new Error('Shield Mode already matches this proposal. Draft a new change.');
    }
    pending = [command];
  } else if (proposal.fields.some(field => field.key === 'shield' && field.value === true)) {
    if (snapshot.shield.value) throw new Error('Shield Mode is already enabled or awaiting confirmation.');
    pending = [{ kind: 'shield' }];
  } else {
    const verdict = proposal.fields.find(field => field.key === 'verdict')?.value;
    const line = proposal.fields.find(field => field.key === 'line')?.value;
    if ((verdict !== 'pass' && verdict !== 'bar') || typeof line !== 'string') throw new Error('Unsupported moderation proposal.');
    const targets = snapshot.held.filter(item => line === 'all as proposed' || item.message_id === line || item.message_text === line);
    if (!targets.length || (line !== 'all as proposed' && targets.length !== 1)) throw new Error('Choose an original held message by its full text or message id.');
    pending = targets.map(item => ({ kind: verdict === 'pass' ? 'release' : 'remove', decision_id: item.decision_id }));
  }
  for (const item of pending) {
    if (item.kind === 'shield' || item.kind === 'delay') {
      const change = item.kind === 'shield' ? settingTransition(snapshot.shield, !snapshot.shield.value)
        : settingTransition(snapshot.delay, item.delay_s);
      if (!change.ok) throw new LifecycleRefusal(change.refusal);
      if (item.kind === 'delay') confirmFixtureDelay(item.delay_s);
    }
    if (item.kind === 'mode' && !snapshot.rules.some(rule => rule.rule_id === item.rule_id)) throw new Error('Rule no longer exists.');
    if (item.kind === 'rule' && (item.rule.mode !== 'shadow' || item.rule.rule_class !== 'pattern')) throw new Error('Only watching pattern rules may be edited.');
    if ('decision_id' in item) {
      const change = decisionTransition(snapshot, item.decision_id, item.kind);
      if (!change.ok) throw new LifecycleRefusal(change.refusal);
    }
  }
  const result = queue.seal(proposal.id);
  if (!result.ok) throw new Error(result.reason);
  pending.forEach(item => {
    port.send(item);
    const bench = moderationSession(queue).bench;
    const draft = bench.getSnapshot().draft;
    if (item.kind === 'rule' && draft?.name.trim() === item.rule.name && draft.pattern === item.rule.pattern) {
      bench.setDraft(draft, item.rule.rule_id);
    }
  });
}
