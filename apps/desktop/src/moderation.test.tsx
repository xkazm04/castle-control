import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import ModeratorRoom from './rooms/moderator/index.jsx';
import { Consensus } from './rooms/moderator/consensus.jsx';
import { HeldQueue } from './rooms/moderator/controls.jsx';
import { MessageList, messageWindow } from './rooms/moderator/messages.jsx';
import { Drill } from './rooms/moderator/drill.jsx';
import { moderationSession } from './rooms/moderator/session.js';
import { fixtureBans, fixtureCharts, fixtureConfirmationMs, fixtureMessages, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { createModerationPreview } from './moderation-model.js';
import { initialNavigation } from './navigation.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof React>() }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
  const series = fixtureCharts[0]?.directions[0]?.series;
  expect(series).toHaveLength(16);
  expect(series?.[0]?.share).toBeCloseTo(0.3785166613518237, 12);
  expect(series?.[15]?.share).toBeCloseTo(0.366743278225684, 12);
  const html = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
  for (const text of ['17 messages shed', 'Go left', '3 min', 'illustrative', '<svg']) expect(html).toContain(text);
});

test('consensus caption agrees with the Go left tile share instead of 51.3%', () => {
  const html = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
  const share = ((fixtureCharts[0]?.directions[0]?.share ?? 0) * 100).toFixed(1);
  expect(share).toBe('36.7');
  expect(html).toContain(`<span>Go left</span><b>${share}%</b>`);
  expect(html.match(/moderator-reference">([^<]*)</)?.[1]).toContain(`Go left ${share}%`);
  expect(html).not.toContain('51.3%');
});

test('selecting Emotes only changes the consensus polygon points compared with All', () => {
  const all = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
  vi.spyOn(React, 'useState').mockReturnValue([1, vi.fn()]);
  const emotes = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
  expect(emotes).toContain('aria-pressed="true">Emotes only');
  const points = (html: string) => [...html.matchAll(/<polygon[^>]*points="([^"]*)"/g)].map(match => match[1]);
  expect(points(all).length).toBeGreaterThan(0);
  expect(points(emotes)).not.toEqual(points(all));
});

test('every fixture chart sums to one including Other at every series point', () => {
  for (const chart of fixtureCharts) {
    expect(chart.directions.reduce((sum, direction) => sum + direction.share, 0)).toBeCloseTo(1, 3);
    if (chart.filter.kind !== 'all') expect(chart.directions.some(direction => direction.label === 'Other')).toBe(true);
    for (let index = 0; index < 16; index++) {
      expect(chart.directions.reduce((sum, direction) => sum + (direction.series[index]?.share ?? 0), 0)).toBeCloseTo(1, 3);
    }
  }
});

test('each filter draws every stacked series point and its selected reference and remainder', () => {
  const selection = vi.spyOn(React, 'useState');
  for (const [selected, chart] of fixtureCharts.entries()) {
    selection.mockReturnValue([selected, vi.fn()]);
    const html = renderToStaticMarkup(<Consensus results={fixtureCharts} />);
    const polygons = [...html.matchAll(/<polygon[^>]*points="([^"]*)"/g)];
    expect(polygons).toHaveLength(chart.directions.length);
    for (const [index, direction] of chart.directions.entries()) {
      const points = polygons[index]?.[1]?.split(' ').map(point => point.split(',').map(Number)) ?? [];
      expect(points).toHaveLength(direction.series.length * 2);
      for (const [minute, point] of direction.series.entries()) {
        const lower = chart.directions.slice(0, index).reduce((sum, item) => sum + (item.series[minute]?.share ?? 0), 0);
        expect(points[minute]?.[0]).toBeCloseTo(minute / 15 * 560, 10);
        expect(points[minute]?.[1]).toBeCloseTo(170 - (lower + point.share) * 170, 10);
        expect(points.at(-1 - minute)?.[1]).toBeCloseTo(170 - lower * 170, 10);
      }
    }
    const share = ((chart.directions[0]?.share ?? 0) * 100).toFixed(1);
    expect(html.match(/moderator-reference">([^<]*)</)?.[1]).toContain(`min 0 → min 15 · Go left ${share}% · illustrative`);
    const other = chart.directions.find(direction => direction.label === 'Other');
    if (other) expect(html).toContain(`Other · ${(other.share * 100).toFixed(1)}%`);
  }
});

test('consensus axis and caption follow the available series timestamps', () => {
  const chart = fixtureCharts[0];
  if (!chart) throw new Error('Missing consensus fixture');
  const result = { ...chart, directions: chart.directions.map(direction => ({ ...direction, series: direction.series.slice(5, 11) })) };
  const html = renderToStaticMarkup(<Consensus results={[result]} />);
  expect(html).toContain('<span>min 0</span><span>min 5</span>');
  expect(html).toContain('min 0 → min 5');
  expect(html).not.toContain('min 14');
  expect(renderToStaticMarkup(<Consensus results={[]} />)).toContain('No consensus history available.');
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
    expect(port.getSnapshot().bans).toHaveLength(1);
    vi.advanceTimersByTime(fixtureConfirmationMs);
    expect(port.getSnapshot().bans).toHaveLength(0);
    expect(port.getSnapshot().phases.get(ban.decision_id)).toEqual({ kind: 'dismissed' });
    port.send({ kind: 'mode', rule_id: rule.rule_id, mode: 'armed' });
    expect(port.getSnapshot().preview_modes.get(rule.rule_id)).toBe('armed');
    expect(fixtureRules.rules.every(item => item.mode === 'shadow')).toBe(true);
    port.send({ kind: 'shield' });
    expect(port.getSnapshot().shield.value).toBe(false);
    vi.advanceTimersByTime(fixtureConfirmationMs);
    expect(port.getSnapshot().shield.value).toBe(true);
    expect(listener).toHaveBeenCalledTimes(5);
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
  expect(port.getSnapshot().bans).toHaveLength(1);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().bans).toHaveLength(0);
  expect(port.getSnapshot().messages.find(item => item.message_id === ban.message_id)?.verdict).toBe('bar');
  expect(port.getSnapshot().ledger[0]?.message_text).toBe(ban.message_text);
  port.send({ kind: 'release', decision_id: held.decision_id });
  expect(port.getSnapshot().held).toHaveLength(1);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().held).toHaveLength(0);
  expect(port.getSnapshot().messages.find(item => item.message_id === held.message_id)?.verdict).toBe('pass');
  port.send({ kind: 'undo', decision_id: timeout.decision_id });
  expect(port.getSnapshot().phases.get(timeout.decision_id)).toMatchObject({ kind: 'confirming', op: 'undo' });
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().phases.get(timeout.decision_id)).toMatchObject({ kind: 'undone' });
  port.send({ kind: 'petition', decision_id: timeout.decision_id });
  expect(port.getSnapshot().phases.get(timeout.decision_id)).toMatchObject({ kind: 'confirming', op: 'petition' });
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().phases.get(timeout.decision_id)).toMatchObject({ kind: 'petitioned' });
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

test('capture and replay instrument hashes show matching and differing instruments without claiming a live exit', () => {
  for (const matching of [true, false]) {
    const capture_hash = matching ? fixtureReplay.instrument_hash : 'f'.repeat(64);
    const html = renderToStaticMarkup(<Drill result={fixtureReplay} origin="core" capture_hash={capture_hash} />);
    expect(html).toContain('Stored capture instrument hash');
    expect(html).toContain(capture_hash); expect(html).toContain(fixtureReplay.instrument_hash);
    expect(html).toContain(matching ? 'Capture and replay instrument hashes match.' : 'Capture and replay instrument hashes differ.');
    expect(html).toContain('Matching instruments alone do not prove matching decisions or the two-hour live exit.');
    expect(html).not.toContain('live parity: pending capture evidence');
  }
});
