import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { ModuleId } from '@castle-control/ui';
import { ConsensusChart } from './moderation-chart.jsx';
import { ReviewQueues } from './moderation-review.jsx';
import { MessageList, messageWindow } from './moderation-messages.jsx';
import { ReplayPage } from './moderation-replay.jsx';
import { fixtureBans, fixtureCharts, fixtureMessages, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { createModerationPreview } from './moderation-model.js';
import { dispatchShortcut, routeFromHash } from './navigation.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';

test('4,200 generated chat lines mount only a window, including the final row on scroll', () => {
  expect(fixtureMessages).toHaveLength(4200);
  const initial = renderToStaticMarkup(<MessageList messages={fixtureMessages} />);
  expect(initial).toContain('aria-rowcount="4200"');
  expect(initial.match(/data-message-row=/g)?.length).toBeLessThan(30);
  expect(initial).toContain('simulated-message-0');
  expect(initial).not.toContain('simulated-message-4199');
  const end = messageWindow(4200, 4200 * 32);
  expect(end.end).toBe(4200);
  const scrolled = renderToStaticMarkup(<MessageList messages={fixtureMessages} scroll_top={4200 * 32} />);
  expect(scrolled).toContain('simulated-message-4199');
  expect(scrolled.match(/data-message-row=/g)?.length).toBeLessThan(30);
});

test('pending ban displays original message_text and rule name with Ban and Dismiss', () => {
  const port = createModerationPreview();
  const html = renderToStaticMarkup(<ReviewQueues snapshot={port.getSnapshot()} rules={fixtureRules.rules} send={port.send} />);
  const original = fixtureBans[0];
  expect(original).toBeDefined();
  expect(html).toContain(original?.message_text);
  expect(html).toContain('Blocked terms');
  expect(html).toMatch(/>Ban<\/button>/);
  expect(html).toMatch(/>Dismiss<\/button>/);
});

test('consensus module has no action/client imports and exposes shed count and history', () => {
  const code = readFileSync(new URL('./moderation-chart.tsx', import.meta.url), 'utf8');
  const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  expect(imports).toEqual(['@castle-control/contract', '@castle-control/ui', './moderation-copy.js']);
  expect(code).not.toMatch(/\b(fetch|invoke|send|WebSocket|XMLHttpRequest)\s*\(/);
  const html = renderToStaticMarkup(<ConsensusChart results={fixtureCharts} />);
  expect(html).toContain('17 messages shed');
  expect(html).toContain('Go left');
  expect(html).toContain('3 min');
  expect(html).toContain('<svg');
});

test('key 2 opens the complete simulated page through the existing navigation registry', async () => {
  let current: ModuleId = 'lottery';
  dispatchShortcut({ key: '2', preventDefault: () => undefined }, false, id => { current = id; }, () => undefined);
  const stream = await renderToReadableStream(<DesktopView current={current} snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }}
    theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  for (const text of ['The live room', 'The Herald', 'At the portcullis', 'Ban queue', 'Gate rules', 'The gate roll', 'The drill', 'SIMULATED']) expect(html).toContain(text);
  expect(routeFromHash('#/moderator/drill')).toBe('moderator');
});

test('fixture commands are observable local state; all contract rules remain shadow', () => {
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
    expect(port.getSnapshot().shield).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('review operations resolve only local queues and preserve the original text for review', () => {
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
  expect(port.getSnapshot().held).toHaveLength(0);
  expect(port.getSnapshot().messages.find(item => item.message_id === held.message_id)?.verdict).toBe('pass');
  port.send({ kind: 'undo', decision_id: timeout.decision_id });
  expect(port.getSnapshot().operations.get(timeout.decision_id)).toBe('undo');
  port.send({ kind: 'petition', decision_id: timeout.decision_id });
  expect(port.getSnapshot().operations.get(timeout.decision_id)).toBe('petition');
  expect(createModerationPreview().getSnapshot().bans).toHaveLength(1);
});

test('nested replay route keeps shell context and does not render the overview', async () => {
  const stream = await renderToReadableStream(<DesktopView current="moderator" replay snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }}
    theme="stock" on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('Back to the Gatehouse');
  expect(html).toContain('aria-label="Breadcrumb"');
  expect(html).toContain('Twitch: connected');
  expect(html).toContain('3 watching');
  expect(html).not.toContain('data-message-row');
});

test('replay is a separate simulated page with provenance, gaps, states and instrument', () => {
  const html = renderToStaticMarkup(<ReplayPage result={fixtureReplay} />);
  for (const text of ['Back to the Gatehouse', 'simulated-generated-room', fixtureReplay.instrument_hash, 'judge pending', 'engine failed', 'Recording gap', '1 / 20']) expect(html).toContain(text);
  expect(html).not.toContain('Apply to');
});

test('core mode never exposes the fixture page or action controls', () => {
  const html = renderToStaticMarkup(<DesktopView current="moderator" snapshot={{ mode: 'core', phase: 'connecting' }}
    theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
  expect(html).not.toContain('data-message-row');
  expect(html).not.toContain('>Ban</button>');
});
