import type { Decision, DecisionId, Rule } from '@castle-control/contract';
import { moderationCopy as copy } from './moderation-copy.js';

/** Client-local fixture state, never an RPC or persisted decision kind.
 * Held -> released/removed; ban_pending -> banned/dismissed;
 * timed_out/banned -> undone; settled ledger entries -> petitioned.
 * Every operation first confirms for 400 ms AFTER the human proposal seal.
 * Undo and Petition may each occur once, in either order. Recorded preserves
 * existing would_act/warning ledger evidence without granting Undo authority.
 */
export type Op = 'release' | 'remove' | 'ban' | 'dismiss' | 'undo' | 'petition';
export type SettledPhase =
  | { kind: 'held' | 'ban_pending' | 'released' | 'removed' | 'banned' | 'dismissed' | 'timed_out' | 'recorded' }
  | { kind: 'undone' | 'petitioned'; from: SettledPhase };
export type ConfirmingPhase = { kind: 'confirming'; op: Op; from: SettledPhase; next: SettledPhase };
export type DecisionPhase = SettledPhase | ConfirmingPhase;
export type SettingPhase<T> = { kind: 'applied'; value: T } | { kind: 'confirming'; value: T; target: T };
export type Refusal = 'original_unavailable' | 'rule_unavailable' | 'confirmation_pending' | 'operation_unavailable';
type Refused = { ok: false; refusal: Refusal };
type Transition = { ok: true; next: ConfirmingPhase } | Refused;
type DecisionState = {
  phases: ReadonlyMap<DecisionId, DecisionPhase>; rules: readonly Rule[];
  held: readonly Decision[]; bans: readonly Decision[]; ledger: readonly Decision[];
};
const ops: readonly Op[] = ['release', 'remove', 'ban', 'dismiss', 'undo', 'petition'];
const legal = {
  held: ['release', 'remove'], ban_pending: ['ban', 'dismiss'],
  released: ['petition'], removed: ['petition'], banned: ['undo', 'petition'],
  dismissed: ['petition'], timed_out: ['undo', 'petition'], recorded: ['petition'],
  undone: ['petition'], petitioned: ['undo'],
} satisfies Record<SettledPhase['kind'], readonly Op[]>;
const terminal = { release: 'released', remove: 'removed', ban: 'banned', dismiss: 'dismissed' } as const;

function contains(phase: SettledPhase, kind: SettledPhase['kind']): boolean {
  return phase.kind === kind || ('from' in phase && contains(phase.from, kind));
}
export function transition(phase: DecisionPhase, op: Op): Transition {
  if (phase.kind === 'confirming') return { ok: false, refusal: 'confirmation_pending' };
  const allowed: readonly Op[] = legal[phase.kind];
  if (!allowed.includes(op)
    || op === 'undo' && (contains(phase, 'undone') || !contains(phase, 'banned') && !contains(phase, 'timed_out'))
    || op === 'petition' && contains(phase, 'petitioned')) return { ok: false, refusal: 'operation_unavailable' };
  const next: SettledPhase = op === 'undo' || op === 'petition'
    ? { kind: op === 'undo' ? 'undone' : 'petitioned', from: phase } : { kind: terminal[op] };
  return { ok: true, next: { kind: 'confirming', op, from: phase, next } };
}

export function initialPhase(decision: Decision): SettledPhase {
  switch (decision.kind) {
    case 'held': case 'ban_pending': case 'released': case 'removed': case 'banned': case 'timed_out':
      return { kind: decision.kind };
    default: return { kind: 'recorded' };
  }
}
export function decisionTransition(state: DecisionState, id: DecisionId, op: Op): Transition {
  const target = [...state.held, ...state.bans, ...state.ledger].find(item => item.decision_id === id);
  if (!target?.message_text) return { ok: false, refusal: 'original_unavailable' };
  if ((op === 'ban' || op === 'dismiss') && !state.rules.some(rule => rule.rule_id === target.rule_id)) {
    return { ok: false, refusal: 'rule_unavailable' };
  }
  const phase = state.phases.get(id);
  return phase ? transition(phase, op) : { ok: false, refusal: 'operation_unavailable' };
}
export function available(state: DecisionState, id: DecisionId): readonly Op[] {
  return ops.filter(op => decisionTransition(state, id, op).ok);
}
export function settingTransition<T>(phase: SettingPhase<T>, target: T): { ok: true; next: SettingPhase<T> } | Refused {
  return phase.kind === 'confirming' ? { ok: false, refusal: 'confirmation_pending' }
    : { ok: true, next: { kind: 'confirming', value: phase.value, target } };
}
export function phaseLabel(phase: DecisionPhase): string {
  if (phase.kind === 'confirming') return `${phaseLabel(phase.from)} · ${copy.confirming_operations[phase.op]}`;
  if (phase.kind === 'undone') return contains(phase.from, 'timed_out') ? copy.timeout_undone : copy.ban_undone;
  if (phase.kind === 'petitioned') return `${phaseLabel(phase.from)} · ${copy.appeal_requested}`;
  return copy.decision_phases[phase.kind];
}
export class LifecycleRefusal extends Error {
  readonly refusal: Refusal;
  constructor(refusal: Refusal) { super(copy[refusal]); this.name = 'LifecycleRefusal'; this.refusal = refusal; }
}
