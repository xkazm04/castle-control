import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createModerationPreview } from '../../moderation-model.js';
import { evaluateDraft } from '../../moderation-bench.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import ModeratorRoom from './index.jsx';
import { GateControls, HeldQueue, Rules } from './controls.jsx';
import { GateLog } from './log.jsx';
import { ChatPlayback } from './playback.jsx';
import { BenchFeedback } from './rule-bench.jsx';
import { moderationSession } from './session.js';

afterEach(() => { vi.useRealTimers(); });
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
function description(html: string, button: string) {
  const ids = button.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];
  expect(ids.length, `Missing target description: ${text(button)}`).toBeGreaterThan(0);
  return ids.map(id => {
    const element = [...html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)]
      .filter(match => match[2] === id);
    expect(element, `Description ${id} resolves exactly once`).toHaveLength(1);
    return text(element[0]?.[3] ?? '');
  }).join(' ');
}

test('fixture ModeratorRoom announces each notice in exactly one status region', () => {
  vi.useFakeTimers();
  const queue = new ProposalQueue();
  const { port } = moderationSession(queue);
  const assertNotice = () => {
    const html = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />);
    const notices = [...html.matchAll(/<([a-z]+)\b[^>]*role="status"[^>]*>([\s\S]*?)<\/\1>/g)]
      .filter(match => text(match[2] ?? '') === port.getSnapshot().notice);
    expect(notices).toHaveLength(1);
  };
  assertNotice();
  port.send({ kind: 'delay', delay_s: 6 }); assertNotice();
  vi.runAllTimers(); assertNotice();
});

test.each(['shadow', 'armed'] as const)('%s rule actions describe their own rule', mode => {
  const port = createModerationPreview();
  const queue = new ProposalQueue();
  for (const rule of port.getSnapshot().rules) port.send({ kind: 'mode', rule_id: rule.rule_id, mode });
  const state = port.getSnapshot();
  const html = renderToStaticMarkup(<Rules state={state} queue={queue} />);
  const actions = buttons(html);
  expect(actions).toHaveLength(state.rules.length);
  actions.forEach((button, index) => {
    expect(text(button)).toBe(mode === 'armed' ? copy.propose_watch : copy.propose_arm);
    expect(description(html, button)).toBe(state.rules[index]?.name);
  });
  expect(new Set(actions.map(button => `${text(button)} ${description(html, button)}`)).size).toBe(actions.length);
});

test.each([false, true])('Ban and Dismiss describe their message (rule unavailable=%s)', missing_rule => {
  const initial = createModerationPreview().getSnapshot();
  const state = missing_rule ? { ...initial, rules: [] } : initial;
  const html = renderToStaticMarkup(<HeldQueue state={state} queue={new ProposalQueue()} />);
  const actions = buttons(html).filter(button => text(button) === copy.propose_ban || text(button) === copy.propose_dismiss);
  expect(actions).toHaveLength(state.bans.length * 2);
  actions.forEach((button, index) => {
    expect(description(html, button)).toBe(state.bans[Math.floor(index / 2)]?.message_id);
    if (missing_rule && text(button) === copy.propose_ban) expect(button).toContain('disabled=""');
  });
  expect(new Set(actions.map(button => `${text(button)} ${description(html, button)}`)).size).toBe(actions.length);
});

test('every ledger Undo and Petition describes its message without making paragraphs tab stops', () => {
  const state = createModerationPreview().getSnapshot();
  const html = renderToStaticMarkup(<GateLog state={state} queue={new ProposalQueue()} />);
  const rows = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)];
  expect(rows).toHaveLength(state.ledger.length);
  rows.forEach((row, index) => {
    const actions = buttons(row[1] ?? '');
    expect(actions.length).toBeGreaterThan(0);
    for (const button of actions) {
      expect([copy.propose_undo, copy.propose_petition]).toContain(text(button));
      expect(description(html, button)).toBe(state.ledger[index]?.message_id);
    }
  });
  expect(html).not.toMatch(/<p\b[^>]*tabindex=/);
  const actions = buttons(html);
  expect(new Set(actions.map(button => `${text(button)} ${description(html, button)}`)).size).toBe(actions.length);
});

test.each([false, true])('Shield name includes its visible drawbridge action (enabled=%s)', enabled => {
  const initial = createModerationPreview().getSnapshot();
  const state = { ...initial, shield: { kind: 'applied' as const, value: enabled } };
  const html = renderToStaticMarkup(<GateControls state={state} queue={new ProposalQueue()} />);
  const shield = buttons(html).find(button => button.includes(copy.shield_label));
  expect(shield).toBeTruthy();
  expect(shield).not.toMatch(/aria-label=/);
  expect(text(shield ?? '')).toContain(enabled ? copy.lower_bridge : copy.shield);
  expect(text(shield ?? '')).toContain(copy.shield_label);
});

test('BenchFeedback has one polite count region and non-live labelled count hooks', () => {
  const result = evaluateDraft({ name: 'Simulated draft', pattern: 'left', action: 'warn' }, [], []);
  const html = renderToStaticMarkup(<BenchFeedback result={result} />);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  expect(html).not.toContain('<output');
  for (const label of [copy.draft_hits, copy.newly_acting]) {
    const hook = [...html.matchAll(/<span\b[^>]*>/g)].find(match => match[0].includes(`aria-label="${label}"`))?.[0];
    expect(hook).toBeTruthy();
    expect(hook).not.toMatch(/role="status"|aria-live=/);
  }
});

test('Play uses a changing action name without a pressed state', () => {
  const port = createModerationPreview();
  const html = renderToStaticMarkup(<ChatPlayback port={port} state={port.getSnapshot()} />);
  expect(text(buttons(html)[0] ?? '')).toBe(copy.play_chat);
  expect(buttons(html)[0]).not.toContain('aria-pressed');
});
