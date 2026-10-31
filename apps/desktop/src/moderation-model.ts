import type { ChatDelay, Decision, DecisionId, Rule, RuleId, RuleMode } from '@castle-control/contract';
import { parseMethodParams } from '@castle-control/contract';
import { gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import { confirmFixtureDelay, confirmFixtureHeld, confirmFixtureShield, fixtureBans, fixtureConfirmationMs,
  fixtureDelay, fixtureHeld, fixtureLedger, fixtureMessages, fixtureRules, fixtureShield } from './moderation-fixture.js';
import { moderationCopy as copy } from './moderation-copy.js';
import { decisionTransition, initialPhase, settingTransition } from './moderation-lifecycle.js';
import type { DecisionPhase, Refusal, SettingPhase } from './moderation-lifecycle.js';

export type PreviewCommand =
  | { kind: 'ban' | 'dismiss' | 'undo' | 'petition' | 'release' | 'remove'; decision_id: DecisionId }
  | { kind: 'mode'; rule_id: RuleId; mode: RuleMode }
  | { kind: 'delay'; delay_s: ChatDelay }
  | { kind: 'rule'; rule: Rule }
  | { kind: 'shield' };
export type ModerationPreview = {
  rules: readonly Rule[]; replay_count: number;
  messages: readonly Decision[]; held: readonly Decision[]; bans: readonly Decision[]; ledger: readonly Decision[];
  preview_modes: ReadonlyMap<string, RuleMode>; phases: ReadonlyMap<DecisionId, DecisionPhase>; notice: string;
  delay: SettingPhase<ChatDelay>; shield: SettingPhase<boolean>;
};
export type ModerationPort = {
  getSnapshot: () => ModerationPreview; subscribe: (listener: () => void) => () => void;
  send: (command: PreviewCommand) => void;
  refuse: (refusal: Refusal) => void;
  advanceChat: () => boolean;
};

/** A local-only port. A future client can implement this seam; no transport is imported here.
 * Preview modes never modify the contract rules, which remain shadow throughout. */
export function createModerationPreview(): ModerationPort {
  let snapshot: ModerationPreview = { rules: fixtureRules.rules, replay_count: 420, messages: fixtureMessages, held: fixtureHeld, bans: fixtureBans, ledger: fixtureLedger,
    preview_modes: new Map(fixtureRules.rules.map(rule => [rule.rule_id, rule.mode])),
    phases: new Map([...fixtureLedger, ...fixtureHeld, ...fixtureBans].map(item => [item.decision_id, initialPhase(item)])),
    shield: { kind: 'applied', value: fixtureShield.enabled }, delay: { kind: 'applied', value: fixtureDelay.delay_s },
    notice: copy.nothing_sent };
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const refuse = (refusal: Refusal) => { snapshot = { ...snapshot, notice: copy[refusal] }; notify(); };
  return {
    getSnapshot: () => snapshot,
    refuse,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    advanceChat() {
      if (snapshot.replay_count >= snapshot.messages.length) return false;
      snapshot = { ...snapshot, replay_count: snapshot.replay_count + 1 };
      notify(); return snapshot.replay_count < snapshot.messages.length;
    },
    send(command) {
      if (command.kind === 'rule') {
        const { rule } = parseMethodParams(gatehouseRulesUpsert, { rule: command.rule });
        if (rule.mode !== 'shadow' || rule.rule_class !== 'pattern' || !snapshot.rules.some(item => item.rule_id === rule.rule_id)) return;
        snapshot = { ...snapshot, rules: snapshot.rules.map(item => item.rule_id === rule.rule_id ? rule : item), notice: copy.rule_saved };
      } else if (command.kind === 'mode') {
        snapshot = { ...snapshot, preview_modes: new Map(snapshot.preview_modes).set(command.rule_id, command.mode), notice: copy.mode_changed };
      } else if (command.kind === 'delay') {
        const change = settingTransition(snapshot.delay, command.delay_s);
        if (!change.ok) { refuse(change.refusal); return; }
        // Validate at the existing fixture contract door before scheduling.
        const result = confirmFixtureDelay(command.delay_s);
        snapshot = { ...snapshot, delay: change.next, notice: copy.gate_pending };
        setTimeout(() => {
          snapshot = { ...snapshot, delay: { kind: 'applied', value: result.delay_s }, notice: copy.gate_confirmed };
          notify();
        }, fixtureConfirmationMs);
      } else if (command.kind === 'shield') {
        const change = settingTransition(snapshot.shield, !snapshot.shield.value);
        if (!change.ok) { refuse(change.refusal); return; }
        const result = confirmFixtureShield(!snapshot.shield.value);
        snapshot = { ...snapshot, shield: change.next, notice: copy.gate_pending };
        setTimeout(() => {
          snapshot = { ...snapshot, shield: { kind: 'applied', value: result.enabled }, notice: copy.gate_confirmed };
          notify();
        }, fixtureConfirmationMs);
      } else {
        const id = command.decision_id;
        const change = decisionTransition(snapshot, id, command.kind);
        if (!change.ok) { refuse(change.refusal); return; }
        const target = [...snapshot.held, ...snapshot.bans, ...snapshot.ledger].find(item => item.decision_id === id);
        if (!target) { refuse('original_unavailable'); return; }
        const resolvingHeld = command.kind === 'release' || command.kind === 'remove';
        const result = resolvingHeld ? confirmFixtureHeld(target, command.kind === 'release' ? 'allow' : 'deny') : target;
        snapshot = { ...snapshot, phases: new Map(snapshot.phases).set(id, change.next),
          notice: resolvingHeld ? copy.gate_pending : `${copy.operation_confirming(command.kind)} ${copy.gate_pending}` };
        setTimeout(() => {
          const phases = new Map(snapshot.phases).set(id, change.next.next);
          const queued = (item: Decision, kind: 'held' | 'ban_pending') => {
            const phase = phases.get(item.decision_id);
            return phase?.kind === kind || phase?.kind === 'confirming' && phase.from.kind === kind;
          };
          snapshot = { ...snapshot, phases,
            held: snapshot.held.filter(item => queued(item, 'held')), bans: snapshot.bans.filter(item => queued(item, 'ban_pending')),
            messages: snapshot.messages.map(item => item.message_id === target.message_id
              ? { ...item, verdict: resolvingHeld ? result.verdict : command.kind === 'dismiss' || command.kind === 'undo'
                ? 'pass' : command.kind === 'ban' ? 'bar' : item.verdict } : item),
            ledger: snapshot.ledger.some(item => item.decision_id === id) ? snapshot.ledger : [result, ...snapshot.ledger],
            notice: resolvingHeld ? copy.held_resolved(result.verdict) : copy.operation_recorded(command.kind) };
          notify();
        }, fixtureConfirmationMs);
      }
      notify();
    },
  };
}
