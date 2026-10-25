import type { Decision, DecisionId, RuleId, RuleMode } from '@castle-control/contract';
import { fixtureBans, fixtureHeld, fixtureLedger, fixtureMessages, fixtureRules } from './moderation-fixture.js';

export type PreviewCommand =
  | { kind: 'ban' | 'dismiss' | 'undo' | 'petition' | 'release' | 'remove'; decision_id: DecisionId }
  | { kind: 'mode'; rule_id: RuleId; mode: RuleMode }
  | { kind: 'shield' };
export type ModerationPreview = {
  messages: readonly Decision[]; held: readonly Decision[]; bans: readonly Decision[]; ledger: readonly Decision[];
  preview_modes: ReadonlyMap<string, RuleMode>; operations: ReadonlyMap<string, string>; shield: boolean; notice: string;
};
export type ModerationPort = {
  getSnapshot: () => ModerationPreview; subscribe: (listener: () => void) => () => void;
  send: (command: PreviewCommand) => void;
};

/** A local-only port. A future client can implement this seam; no transport is imported here.
 * Preview modes never modify the contract rules, which remain shadow throughout. */
export function createModerationPreview(): ModerationPort {
  let snapshot: ModerationPreview = { messages: fixtureMessages, held: fixtureHeld, bans: fixtureBans, ledger: fixtureLedger,
    preview_modes: new Map(fixtureRules.rules.map(rule => [rule.rule_id, rule.mode])), operations: new Map(), shield: false, notice: 'Nothing sent.' };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    send(command) {
      if (command.kind === 'mode') {
        snapshot = { ...snapshot, preview_modes: new Map(snapshot.preview_modes).set(command.rule_id, command.mode), notice: 'Mode preview changed only. Actual rules remain Watching.' };
      } else if (command.kind === 'shield') {
        snapshot = { ...snapshot, shield: !snapshot.shield, notice: 'Shield Mode preview changed only.' };
      } else {
        const id = command.decision_id;
        const target = [...snapshot.bans, ...snapshot.held, ...snapshot.ledger].find(item => item.decision_id === id);
        if (!target) return;
        const resolved = command.kind === 'ban' || command.kind === 'dismiss' || command.kind === 'release' || command.kind === 'remove';
        snapshot = { ...snapshot,
          bans: resolved ? snapshot.bans.filter(item => item.decision_id !== id) : snapshot.bans,
          held: resolved ? snapshot.held.filter(item => item.decision_id !== id) : snapshot.held,
          messages: snapshot.messages.map(item => item.message_id === target.message_id
            ? { ...item, verdict: command.kind === 'release' || command.kind === 'dismiss' || command.kind === 'undo'
              ? 'pass' : command.kind === 'remove' || command.kind === 'ban' ? 'bar' : item.verdict } : item),
          ledger: snapshot.ledger.some(item => item.decision_id === id) ? snapshot.ledger : [target, ...snapshot.ledger],
          operations: new Map(snapshot.operations).set(id, command.kind).set(`${id}:${command.kind}`, command.kind),
          notice: `Simulated ${command.kind} recorded locally. Nothing sent.`,
        };
      }
      for (const listener of listeners) listener();
    },
  };
}
