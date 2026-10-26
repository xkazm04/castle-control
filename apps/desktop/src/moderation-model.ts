import type { ChatDelay, Decision, DecisionId, RuleId, RuleMode } from '@castle-control/contract';
import { confirmFixtureDelay, confirmFixtureHeld, confirmFixtureShield, fixtureBans, fixtureConfirmationMs,
  fixtureDelay, fixtureHeld, fixtureLedger, fixtureMessages, fixtureRules, fixtureShield } from './moderation-fixture.js';
import { moderationCopy as copy } from './moderation-copy.js';

export type PreviewCommand =
  | { kind: 'ban' | 'dismiss' | 'undo' | 'petition' | 'release' | 'remove'; decision_id: DecisionId }
  | { kind: 'mode'; rule_id: RuleId; mode: RuleMode }
  | { kind: 'delay'; delay_s: ChatDelay }
  | { kind: 'shield' };
export type ModerationPreview = {
  messages: readonly Decision[]; held: readonly Decision[]; bans: readonly Decision[]; ledger: readonly Decision[];
  preview_modes: ReadonlyMap<string, RuleMode>; operations: ReadonlyMap<string, string>; shield: boolean; notice: string;
  delay_s: ChatDelay; delay_pending: boolean; shield_pending: boolean; held_pending: ReadonlySet<DecisionId>;
};
export type ModerationPort = {
  getSnapshot: () => ModerationPreview; subscribe: (listener: () => void) => () => void;
  send: (command: PreviewCommand) => void;
};

/** A local-only port. A future client can implement this seam; no transport is imported here.
 * Preview modes never modify the contract rules, which remain shadow throughout. */
export function createModerationPreview(): ModerationPort {
  let snapshot: ModerationPreview = { messages: fixtureMessages, held: fixtureHeld, bans: fixtureBans, ledger: fixtureLedger,
    preview_modes: new Map(fixtureRules.rules.map(rule => [rule.rule_id, rule.mode])), operations: new Map(),
    shield: fixtureShield.enabled, delay_s: fixtureDelay.delay_s, delay_pending: false, shield_pending: false,
    held_pending: new Set(), notice: copy.nothing_sent };
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    send(command) {
      if (command.kind === 'mode') {
        snapshot = { ...snapshot, preview_modes: new Map(snapshot.preview_modes).set(command.rule_id, command.mode), notice: copy.mode_changed };
      } else if (command.kind === 'delay') {
        if (snapshot.delay_pending) return;
        snapshot = { ...snapshot, delay_pending: true, notice: copy.gate_pending };
        setTimeout(() => {
          const result = confirmFixtureDelay(command.delay_s);
          snapshot = { ...snapshot, delay_s: result.delay_s, delay_pending: false, notice: copy.gate_confirmed };
          notify();
        }, fixtureConfirmationMs);
      } else if (command.kind === 'shield') {
        if (snapshot.shield_pending) return;
        const enabled = !snapshot.shield;
        snapshot = { ...snapshot, shield_pending: true, notice: copy.gate_pending };
        setTimeout(() => {
          const result = confirmFixtureShield(enabled);
          snapshot = { ...snapshot, shield: result.enabled, shield_pending: false, notice: copy.gate_confirmed };
          notify();
        }, fixtureConfirmationMs);
      } else if (command.kind === 'release' || command.kind === 'remove') {
        const id = command.decision_id;
        const target = snapshot.held.find(item => item.decision_id === id);
        if (!target?.message_text || snapshot.held_pending.has(id)) return;
        snapshot = { ...snapshot, held_pending: new Set(snapshot.held_pending).add(id), notice: copy.gate_pending };
        setTimeout(() => {
          const result = confirmFixtureHeld(target, command.kind === 'release' ? 'allow' : 'deny');
          const pending = new Set(snapshot.held_pending);
          pending.delete(id);
          snapshot = { ...snapshot, held_pending: pending, held: snapshot.held.filter(item => item.decision_id !== id),
            messages: snapshot.messages.map(item => item.message_id === result.message_id ? { ...item, verdict: result.verdict } : item),
            ledger: [result, ...snapshot.ledger],
            operations: new Map(snapshot.operations).set(id, command.kind), notice: copy.gate_confirmed };
          notify();
        }, fixtureConfirmationMs);
      } else {
        const id = command.decision_id;
        const target = [...snapshot.bans, ...snapshot.held, ...snapshot.ledger].find(item => item.decision_id === id);
        if (!target) return;
        const resolved = command.kind === 'ban' || command.kind === 'dismiss';
        snapshot = { ...snapshot,
          bans: resolved ? snapshot.bans.filter(item => item.decision_id !== id) : snapshot.bans,
          messages: snapshot.messages.map(item => item.message_id === target.message_id
            ? { ...item, verdict: command.kind === 'dismiss' || command.kind === 'undo'
              ? 'pass' : command.kind === 'ban' ? 'bar' : item.verdict } : item),
          ledger: snapshot.ledger.some(item => item.decision_id === id) ? snapshot.ledger : [target, ...snapshot.ledger],
          operations: new Map(snapshot.operations).set(id, command.kind).set(`${id}:${command.kind}`, command.kind),
          notice: copy.operation_recorded(command.kind),
        };
      }
      notify();
    },
  };
}
