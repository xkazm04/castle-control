import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import ModeratorRoom from './rooms/moderator/index.jsx';
import { Consensus } from './rooms/moderator/consensus.jsx';
import { HeldQueue } from './rooms/moderator/controls.jsx';
import { MessageList, messageWindow } from './rooms/moderator/messages.jsx';
import { Drill } from './rooms/moderator/drill.jsx';
import { moderationSession } from './rooms/moderator/session.js';
import { fixtureBans, fixtureCharts, fixtureConfirmationMs, fixtureMessages, fixtureReplay, fixtureRules, illustrativeConsensus } from './moderation-fixture.js';
import { createModerationPreview } from './moderation-model.js';
import { initialNavigation } from './navigation.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';

afterEach(() => { vi.useRealTimers(); });

test('4,200 generated chat lines mount a window including the final row; room uses 420 sample lines', () => {
  expect(fixtureMessages).toHaveLength(4200);
  const initial = renderToStaticMarkup(<MessageList messages={fixtureMessages} />);
  expect(initial).toContain('aria-rowcount="4200"');
  expect(initial.match(/data-message-row=/g)?.length).toBeLessThan(30);
  expect(initial).toContain('simulated-message-0');
  expect(initial).not.toContain('simulated-message-4199');
  expect(messageWindow(4200, 4200 * 32).end).toBe(4200);
  const scrolled = renderToStaticMarkup(<MessageList messages={fixtureMessages} scroll_top={4200 * 32} />);
  expect(scrolled).toContain('simulated-message-4199');
  expect(scrolled.match(/data-message-row=/g)?.length).toBeLessThan(30);
  const room = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />);
  expect(room).toContain('420 lines');
  expect(room).toContain('aria-rowcount="420"');
  expect(room).toContain('SIMULATED');
  expect(room).not.toContain('room-provenance');
  expect(room).not.toContain('generated fixtures only');
});

test('pending ban displays the original message and rule for a held human proposal', () => {
  const queue = new ProposalQueue();
  const html = renderToStaticMarkup(<HeldQueue state={moderationSession(queue).port.getSnapshot()} queue={queue} />);
  expect(html).toContain(fixtureBans[0]?.message_text);
  expect(html).toContain('Blocked terms');
  expect(html).toContain('Propose Ban');
  expect(html).toContain('Propose Dismiss');
});

test('consensus never imports an action port and labels per-minute reference data illustrative', () => {
  const code = readFileSync(new URL('./rooms/moderator/consensus.tsx', import.meta.url), 'utf8');
  expect(code).not.toMatch(/\b(fetch|invoke|send|WebSocket|XMLHttpRequest)\s*\(/);
  expect(code).not.toContain('./session');
  expect(illustrativeConsensus).toHaveLength(15);
  expect(illustrativeConsensus[0]['go-left']).toBe(37.8);
  expect(illustrativeConsensus[14]['go-left']).toBe(51.3);
  const html = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
  for (const text of ['17 messages shed', 'Go left', '3 min', 'illustrative', '<svg']) expect(html).toContain(text);
});

test('fixture commands are observable local state; all contract rules remain shadow', () => {
  vi.useFakeTimers();
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
  try {
    const port = createModerationPreview();
    const listener = vi.fn();
    const stop = port.subscribe(listener);
    const ban = fixtureBans[0];
    const rule = fixtureRules.rules[0];
    if (!ban || !rule) throw new Error('Missing generated fixture');
    port.send({ kind: 'dismiss', decision_id: ban.decision_id });
    expect(port.getSnapshot().bans).toHaveLength(0);
    expect(port.getSnapshot().operations.get(ban.decision_id)).toBe('dismiss');
    port.send({ kind: 'mode', rule_id: rule.rule_id, mode: 'armed' });
    expect(port.getSnapshot().preview_modes.get(rule.rule_id)).toBe('armed');
    expect(fixtureRules.rules.every(item => item.mode === 'shadow')).toBe(true);
    port.send({ kind: 'shield' });
    expect(port.getSnapshot().shield).toBe(false);
    vi.advanceTimersByTime(fixtureConfirmationMs);
    expect(port.getSnapshot().shield).toBe(true);
    expect(listener).toHaveBeenCalledTimes(4);
    stop();
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('review operations resolve only local queues and preserve the original text for review', () => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  const ban = port.getSnapshot().bans[0];
  const held = port.getSnapshot().held[0];
  const timeout = port.getSnapshot().ledger[0];
  if (!ban || !held || !timeout) throw new Error('Missing simulated review fixtures');
  port.send({ kind: 'ban', decision_id: ban.decision_id });
  expect(port.getSnapshot().bans).toHaveLength(0);
  expect(port.getSnapshot().messages.find(item => item.message_id === ban.message_id)?.verdict).toBe('bar');
  expect(port.getSnapshot().ledger[0]?.message_text).toBe(ban.message_text);
  port.send({ kind: 'release', decision_id: held.decision_id });
  expect(port.getSnapshot().held).toHaveLength(1);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().held).toHaveLength(0);
  expect(port.getSnapshot().messages.find(item => item.message_id === held.message_id)?.verdict).toBe('pass');
  port.send({ kind: 'undo', decision_id: timeout.decision_id });
  expect(port.getSnapshot().operations.get(timeout.decision_id)).toBe('undo');
  port.send({ kind: 'petition', decision_id: timeout.decision_id });
  expect(port.getSnapshot().operations.get(timeout.decision_id)).toBe('petition');
  expect(createModerationPreview().getSnapshot().bans).toHaveLength(1);
});


test('drill deep link retains shell context and opens simulated provenance, gaps and states', async () => {
  const stream = await renderToReadableStream(<DesktopView navigation={initialNavigation('#/chamber/moderator/drill')}
    snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }} theme="stock" on_navigate={() => undefined} on_theme_change={() => undefined} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  for (const text of ['Back to the Gatehouse', 'aria-label="Breadcrumb"', 'Twitch simulated', 'Gatehouse simulated', 'Proposal · awaiting your seal']) expect(html).toContain(text);
  expect(html).not.toContain('data-message-row');
  const drill = renderToStaticMarkup(<Drill result={fixtureReplay} />);
  for (const text of ['simulated-generated-room', fixtureReplay.instrument_hash, 'judge pending', 'engine failed', 'Recording gap', '1 / 20']) expect(drill).toContain(text);
  expect(drill).toContain('#/chamber/moderator');
  expect(drill).not.toContain('Apply to');
  expect(drill).toContain('live parity: pending capture evidence');
  expect(drill).not.toMatch(/live (?:match|mismatch)|parity (?:match|mismatch)/i);
});

test('core mode never exposes fixture chat or action controls', () => {
  const html = renderToStaticMarkup(<DesktopView current="moderator" snapshot={{ mode: 'core', phase: 'connecting' }}
    theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} />);
  expect(html).not.toContain('data-message-row');
  expect(html).not.toContain('Propose Ban');
});
