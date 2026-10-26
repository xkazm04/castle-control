import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode, ReactElement, MouseEvent, SelectHTMLAttributes } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { InkButton } from '@castle-control/ui';
import type { InkButtonProps } from '@castle-control/ui';
import { gatehouseHeldResolve, gatehouseDelaySet, gatehouseShieldSet, gatehouseLeaseEnd, parseMethodParams } from '@castle-control/contract';
import { createModerationPreview } from './moderation-model.js';
import { fixtureConfirmationMs, fixtureHeld, fixtureHoldReasons } from './moderation-fixture.js';
import { GateControls, ShieldControl } from './moderation-gate-controls.jsx';
import { ModerationPage } from './moderation-page.jsx';
import { HeldQueue, HeldActions } from './moderation-held.jsx';
import { DecisionList } from './moderation-review.jsx';
import { fixtureRules } from './moderation-fixture.js';
import { moderationCopy as copy } from './moderation-copy.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const controls = (port: ReturnType<typeof createModerationPreview>) => renderToStaticMarkup(
  <GateControls snapshot={port.getSnapshot()} send={port.send} />);
const queue = (port: ReturnType<typeof createModerationPreview>) => renderToStaticMarkup(
  <HeldQueue snapshot={port.getSnapshot()} send={port.send} />);

function delayControl(tree: ReactNode): ReactElement<SelectHTMLAttributes<HTMLSelectElement>> {
  let found: ReactElement<SelectHTMLAttributes<HTMLSelectElement>> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<SelectHTMLAttributes<HTMLSelectElement>>(child)) return;
    if (child.type === 'select') found = child;
    else visit(child.props.children);
  });
  visit(tree);
  if (!found) throw new Error('Missing delay select');
  return found;
}

test('Gatehouse has one Shield toggle in the room hero and keeps the delay select in 2.4', async () => {
  const port = createModerationPreview();
  const stream = await renderToReadableStream(<ModerationPage port={port} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(buttons.filter(button => button.includes(`aria-label="${copy.shield_label}"`))).toHaveLength(1);
  expect(buttons.filter(button => button.includes(copy.shield))).toHaveLength(1);
  const hero = html.match(/<section class="cc-room-status"[\s\S]*?<\/section>/)?.[0];
  expect(hero).toContain(`aria-label="${copy.shield_label}"`);
  const held = queue(port);
  expect(held).toContain(`aria-label="${copy.delay_applied}"`);
  expect(held).not.toContain(`aria-label="${copy.shield_label}"`);
});

test('all four gate handles are public and validate requests without invoking transport', () => {
  expect([gatehouseHeldResolve, gatehouseDelaySet, gatehouseShieldSet, gatehouseLeaseEnd].map(item => item.method))
    .toEqual(['gatehouse.held.resolve', 'gatehouse.delay.set', 'gatehouse.shield.set', 'gatehouse.lease.end']);
  expect(parseMethodParams(gatehouseDelaySet, { delay_s: 6 })).toEqual({ delay_s: 6 });
  expect(() => parseMethodParams(gatehouseDelaySet, { delay_s: 3 })).toThrow();
});

test('delay keeps its applied value until the fixture confirms and exposes only ChatDelay choices', () => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  const before = controls(port);
  expect([...before.matchAll(/<option value="(\d+)"/g)].map(match => match[1])).toEqual(['0', '2', '4', '6']);
  const send = vi.fn(port.send);
  const select = delayControl(GateControls({ snapshot: port.getSnapshot(), send }));
  select.props.onChange?.({ currentTarget: { value: '6' } } as ChangeEvent<HTMLSelectElement>);
  expect(send).toHaveBeenCalledExactlyOnceWith({ kind: 'delay', delay_s: 6 });
  expect(port.getSnapshot().delay_s).toBe(4);
  expect(controls(port)).toContain('value="4" selected=""');
  expect(controls(port)).toContain(copy.gate_pending);
  expect(controls(port)).toContain('aria-busy="true"');
  expect(delayControl(GateControls({ snapshot: port.getSnapshot(), send })).props.disabled).toBe(true);
  vi.advanceTimersByTime(fixtureConfirmationMs - 1);
  expect(port.getSnapshot().delay_s).toBe(4);
  vi.advanceTimersByTime(1);
  expect(port.getSnapshot().delay_s).toBe(6);
  expect(controls(port)).toContain('value="6" selected=""');
  expect(controls(port)).toContain('aria-busy="false"');
  expect(controls(port)).toContain(copy.shield_label);
});

test('unsupported select values and duplicate pending requests do not change applied settings', () => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  const select = delayControl(GateControls({ snapshot: port.getSnapshot(), send: port.send }));
  select.props.onChange?.({ currentTarget: { value: '3' } } as ChangeEvent<HTMLSelectElement>);
  expect(port.getSnapshot().delay_pending).toBe(false);
  port.send({ kind: 'delay', delay_s: 2 });
  port.send({ kind: 'delay', delay_s: 6 });
  port.send({ kind: 'shield' });
  port.send({ kind: 'shield' });
  vi.runAllTimers();
  expect(port.getSnapshot().delay_s).toBe(2);
  expect(port.getSnapshot().shield).toBe(true);
});

test('Shield keeps its applied pressed state until confirmation in both directions', () => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  for (const enabled of [true, false]) {
    port.send({ kind: 'shield' });
    expect(port.getSnapshot().shield).toBe(!enabled);
    expect(renderToStaticMarkup(<ShieldControl snapshot={port.getSnapshot()} send={port.send} />)).toContain(`aria-pressed="${!enabled}"`);
    expect(controls(port)).toContain(copy.gate_pending);
    vi.advanceTimersByTime(fixtureConfirmationMs);
    expect(port.getSnapshot().shield).toBe(enabled);
    expect(renderToStaticMarkup(<ShieldControl snapshot={port.getSnapshot()} send={port.send} />)).toContain(`aria-pressed="${enabled}"`);
  }
});

test.each(['release', 'remove'] as const)('%s remains held, with original text and hold reason, until confirmed', kind => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  const held = fixtureHeld[0];
  if (!held?.message_text) throw new Error('Missing generated held fixture');
  expect(queue(port)).toContain(held.message_text);
  expect(queue(port)).toContain(fixtureHoldReasons.get(held.message_id));
  port.send({ kind, decision_id: held.decision_id });
  const pending = queue(port);
  expect(pending).toContain(held.message_text);
  expect(pending).toContain(copy.held_pending);
  expect(pending).toContain('data-verdict="hold"');
  expect(port.getSnapshot().messages[0]?.verdict).toBe('hold');
  expect(port.getSnapshot().ledger.some(item => item.message_id === held.message_id)).toBe(false);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().held).toHaveLength(0);
  expect(port.getSnapshot().messages[0]?.verdict).toBe(kind === 'release' ? 'pass' : 'bar');
  expect(port.getSnapshot().ledger[0]?.kind).toBe(kind === 'release' ? 'released' : 'removed');
  expect(port.getSnapshot().ledger[0]?.message_text).toBe(held.message_text);
});

test('opposing resolutions cannot replace an in-flight held decision', () => {
  vi.useFakeTimers();
  const port = createModerationPreview();
  const held = fixtureHeld[0];
  if (!held) throw new Error('Missing held fixture');
  port.send({ kind: 'release', decision_id: held.decision_id });
  port.send({ kind: 'remove', decision_id: held.decision_id });
  expect(queue(port).match(/disabled=""/g)).toHaveLength(2);
  vi.runAllTimers();
  expect(port.getSnapshot().messages[0]?.verdict).toBe('pass');
  expect(port.getSnapshot().ledger.filter(item => item.message_id === held.message_id)).toHaveLength(1);
});

test('Allow and Deny use enabled native buttons in tab order and accept keyboard-generated clicks', () => {
  vi.useFakeTimers();
  for (const [label, verdict] of [[copy.allow, 'pass'], [copy.deny, 'bar']] as const) {
    const port = createModerationPreview();
    const held = fixtureHeld[0];
    if (!held) throw new Error('Missing held fixture');
    const buttons: ReactElement<InkButtonProps>[] = [];
    Children.forEach(HeldActions({ item: held, pending: false, send: port.send }).props.children as ReactNode, child => {
      if (isValidElement<InkButtonProps>(child)) buttons.push(child);
    });
    const action = buttons.find(button => button.props.children === label);
    if (!action) throw new Error(`Missing ${label} button`);
    const native = InkButton(action.props);
    expect(native.type).toBe('button');
    expect(native.props.type).toBe('button');
    expect(native.props.disabled).toBe(false);
    expect(native.props.tabIndex ?? 0).toBeGreaterThanOrEqual(0);
    // Native Enter/Space activation dispatches a click with detail 0; no pointer-only handler.
    native.props.onClick?.({ detail: 0 } as MouseEvent<HTMLButtonElement>);
    expect(queue(port)).toContain(copy.held_pending);
    vi.advanceTimersByTime(fixtureConfirmationMs);
    expect(port.getSnapshot().messages[0]?.verdict).toBe(verdict);
  }
});

test('Twitch UI actions are labelled human/from Twitch and preview operations never use fetch', () => {
  vi.useFakeTimers();
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No live calls'));
  const port = createModerationPreview();
  const html = renderToStaticMarkup(<DecisionList snapshot={port.getSnapshot()} rules={fixtureRules.rules} send={port.send} />);
  expect(html).toContain(copy.twitch_human);
  port.send({ kind: 'delay', delay_s: 0 });
  port.send({ kind: 'shield' });
  vi.runAllTimers();
  expect(network).not.toHaveBeenCalled();
});
