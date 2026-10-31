import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { available, decisionTransition, settingTransition, transition } from './moderation-lifecycle.js';
import type { Op, SettledPhase } from './moderation-lifecycle.js';
import { fixtureBans, fixtureHeld, fixtureLedger } from './moderation-fixture.js';
import { createModerationPreview } from './moderation-model.js';

const ops: readonly Op[] = ['release', 'remove', 'ban', 'dismiss', 'undo', 'petition'];
// Independent specification of every settled phase / operation pair, including
// both orders of Undo/Petition. Confirming phases accept no second operation.
const cases: readonly { phase: SettledPhase; legal: readonly Op[] }[] = [
  { phase: { kind: 'held' }, legal: ['release', 'remove'] },
  { phase: { kind: 'ban_pending' }, legal: ['ban', 'dismiss'] },
  { phase: { kind: 'released' }, legal: ['petition'] },
  { phase: { kind: 'removed' }, legal: ['petition'] },
  { phase: { kind: 'banned' }, legal: ['undo', 'petition'] },
  { phase: { kind: 'timed_out' }, legal: ['undo', 'petition'] },
  { phase: { kind: 'dismissed' }, legal: ['petition'] },
  { phase: { kind: 'recorded' }, legal: ['petition'] },
  { phase: { kind: 'undone', from: { kind: 'timed_out' } }, legal: ['petition'] },
  { phase: { kind: 'undone', from: { kind: 'banned' } }, legal: ['petition'] },
  ...(['banned', 'timed_out'] as const).map(kind => ({
    phase: { kind: 'petitioned', from: { kind } } as const, legal: ['undo'] as const,
  })),
  ...(['released', 'removed', 'dismissed', 'recorded'] as const).map(kind => ({
    phase: { kind: 'petitioned', from: { kind } } as const, legal: [],
  })),
  { phase: { kind: 'petitioned', from: { kind: 'undone', from: { kind: 'banned' } } }, legal: [] },
  { phase: { kind: 'undone', from: { kind: 'petitioned', from: { kind: 'banned' } } }, legal: [] },
];
const terminal = { release: 'released', remove: 'removed', ban: 'banned', dismiss: 'dismissed', undo: 'undone', petition: 'petitioned' } as const;

for (const { phase, legal } of cases) for (const op of ops) {
  test(`${JSON.stringify(phase)} + ${op} follows the transition table`, () => {
    const result = transition(phase, op);
    if (!legal.includes(op)) {
      expect(result).toEqual({ ok: false, refusal: 'operation_unavailable' }); return;
    }
    const next = op === 'undo' || op === 'petition' ? { kind: terminal[op], from: phase } : { kind: terminal[op] };
    expect(result).toEqual({ ok: true, next: { kind: 'confirming', op, from: phase, next } });
    if (!result.ok) throw new Error('Expected legal transition');
    for (const competing of ops) expect(transition(result.next, competing)).toEqual({ ok: false, refusal: 'confirmation_pending' });
    expect(phase).not.toHaveProperty('op');
  });
}

test('availability and seal transition share original/rule/phase refusals', () => {
  const state = createModerationPreview().getSnapshot(); const ban = fixtureBans[0];
  const held = fixtureHeld[0]; const timeout = fixtureLedger[0];
  if (!ban || !held || !timeout) throw new Error('Missing generated decisions');
  expect(available(state, ban.decision_id)).toEqual(['ban', 'dismiss']);
  expect(available(state, held.decision_id)).toEqual(['release', 'remove']);
  expect(available(state, timeout.decision_id)).toEqual(['undo', 'petition']);
  const missingRule = { ...state, rules: state.rules.filter(rule => rule.rule_id !== ban.rule_id) };
  expect(available(missingRule, ban.decision_id)).toEqual([]);
  expect(decisionTransition(missingRule, ban.decision_id, 'ban')).toEqual({ ok: false, refusal: 'rule_unavailable' });
  const withoutText = { ...ban }; delete withoutText.message_text;
  expect(available({ ...state, bans: [withoutText] }, ban.decision_id)).toEqual([]);
  expect(decisionTransition({ ...state, bans: [withoutText] }, ban.decision_id, 'ban')).toEqual({ ok: false, refusal: 'original_unavailable' });
});

test('setting transitions retain applied values and refuse replacement while confirming', () => {
  for (const value of [0, 2, 4, 6]) {
    expect(settingTransition({ kind: 'applied', value: 4 }, value)).toEqual({ ok: true, next: { kind: 'confirming', value: 4, target: value } });
    expect(settingTransition({ kind: 'confirming', value: 4, target: value }, 0)).toEqual({ ok: false, refusal: 'confirmation_pending' });
  }
});

test('model and gate roll contain no composite operation keys or pending boolean fields', () => {
  for (const path of ['./moderation-model.ts', './rooms/moderator/log.tsx']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source).not.toMatch(/_pending\s*:\s*boolean/);
    expect(source).not.toMatch(/\.(?:set|has|get)\(`[^`]*\$\{/);
    expect(source).not.toMatch(/\b(?:operations|held_pending|delay_pending|shield_pending)\b/);
  }
});
