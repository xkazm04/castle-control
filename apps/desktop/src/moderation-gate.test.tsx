import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode, ReactElement, ButtonHTMLAttributes, SelectHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { gatehouseHeldResolve, gatehouseDelaySet, gatehouseShieldSet, gatehouseLeaseEnd, parseMethodParams } from '@castle-control/contract';
import { createModerationPreview } from './moderation-model.js';
import { fixtureConfirmationMs, fixtureHeld, fixtureHoldReasons, fixtureRules } from './moderation-fixture.js';
import { GateControls, HeldActions, HeldQueue, Rules } from './rooms/moderator/controls.jsx';
import { GateLog } from './rooms/moderator/log.jsx';
import { moderationSession, proposeCommand, sealModerationProposal } from './rooms/moderator/session.js';
import { moderationCopy as copy } from './moderation-copy.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function find<T>(tree: ReactNode, predicate: (props: T) => boolean): ReactElement<T> {
  let found: ReactElement<T> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<T & { children?: ReactNode }>(child)) return;
    if (predicate(child.props)) found = child;
    else visit(child.props.children);
  });
  visit(tree);
  if (!found) throw new Error('Control missing');
  return found;
}
const state = (queue: ProposalQueue) => moderationSession(queue).port.getSnapshot();
const controls = (queue: ProposalQueue) => renderToStaticMarkup(<GateControls state={state(queue)} queue={queue} />);
const heldQueue = (queue: ProposalQueue) => renderToStaticMarkup(<HeldQueue state={state(queue)} queue={queue} />);
function seal(queue: ProposalQueue) {
  const proposal = queue.pending('moderator').at(-1);
  if (!proposal) throw new Error('Proposal missing');
  sealModerationProposal(queue, proposal);
}
const click = (props: ButtonHTMLAttributes<HTMLButtonElement>) => props.onClick?.({ detail: 0 } as Parameters<NonNullable<typeof props.onClick>>[0]);

test('gate handles validate only public requests and the four ChatDelay choices', () => {
  expect([gatehouseHeldResolve, gatehouseDelaySet, gatehouseShieldSet, gatehouseLeaseEnd].map(item => item.method))
    .toEqual(['gatehouse.held.resolve', 'gatehouse.delay.set', 'gatehouse.shield.set', 'gatehouse.lease.end']);
  expect(parseMethodParams(gatehouseDelaySet, { delay_s: 6 })).toEqual({ delay_s: 6 });
  expect(() => parseMethodParams(gatehouseDelaySet, { delay_s: 3 })).toThrow();
});

test('delay select drafts only; applied value waits for a seal and then fixture confirmation', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue();
  expect([...controls(queue).matchAll(/<option value="(\d+)"/g)].map(match => match[1])).toEqual(['0', '2', '4', '6']);
  const select = find<SelectHTMLAttributes<HTMLSelectElement>>(GateControls({ state: state(queue), queue }), props => props['aria-label'] === copy.delay_applied);
  select.props.onChange?.({ currentTarget: { value: '3' } } as ChangeEvent<HTMLSelectElement>);
  expect(queue.pending()).toHaveLength(0);
  select.props.onChange?.({ currentTarget: { value: '6' } } as ChangeEvent<HTMLSelectElement>);
  expect(state(queue).delay_s).toBe(4); expect(state(queue).delay_pending).toBe(false);
  expect(queue.pending()).toHaveLength(1);
  seal(queue);
  expect(state(queue).delay_s).toBe(4);
  expect(controls(queue)).toContain('value="4" selected=""');
  expect(controls(queue)).toContain(copy.gate_pending);
  expect(controls(queue)).not.toContain('generated fixtures only');
  expect(controls(queue)).toContain('aria-busy="true"');
  expect(find<SelectHTMLAttributes<HTMLSelectElement>>(GateControls({ state: state(queue), queue }), props => props['aria-label'] === copy.delay_applied).props.disabled).toBe(true);
  vi.advanceTimersByTime(fixtureConfirmationMs - 1); expect(state(queue).delay_s).toBe(4);
  vi.advanceTimersByTime(1); expect(state(queue).delay_s).toBe(6);
  expect(controls(queue)).toContain('value="6" selected=""');
  expect(controls(queue)).toContain('aria-busy="false"');
});

test('duplicate requests cannot replace pending settings; Shield pressed state waits in both directions', () => {
  vi.useFakeTimers(); const port = createModerationPreview();
  port.send({ kind: 'delay', delay_s: 2 }); port.send({ kind: 'delay', delay_s: 6 });
  port.send({ kind: 'shield' }); port.send({ kind: 'shield' }); vi.runAllTimers();
  expect(port.getSnapshot().delay_s).toBe(2); expect(port.getSnapshot().shield).toBe(true);
  const queue = new ProposalQueue();
  for (const enabled of [true, false]) {
    proposeCommand(queue, { kind: 'shield' }, 'Shield proposal');
    expect(state(queue).shield).toBe(!enabled); seal(queue);
    expect(controls(queue)).toContain(`aria-pressed="${!enabled}"`);
    vi.advanceTimersByTime(fixtureConfirmationMs); expect(state(queue).shield).toBe(enabled);
    expect(controls(queue)).toContain(`aria-pressed="${enabled}"`);
  }
  expect(controls(queue).match(/aria-label="Shield Mode/g)).toHaveLength(1);
});

test.each(['release', 'remove'] as const)('%s proposes via a native keyboard button and stays held until confirmed', kind => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const held = fixtureHeld[0];
  if (!held?.message_text) throw new Error('Missing original');
  const label = kind === 'release' ? 'Propose Pass' : 'Propose Bar';
  const button = find<ButtonHTMLAttributes<HTMLButtonElement>>(HeldActions({ item: held, pending: false, queue }), props => props.children === label);
  expect(button.type).toBe('button'); expect(button.props.type).toBe('button');
  expect(button.props.disabled).toBe(false); expect(button.props.tabIndex ?? 0).toBeGreaterThanOrEqual(0);
  click(button.props);
  expect(state(queue).held_pending.size).toBe(0);
  expect(state(queue).messages[0]?.verdict).toBe('hold');
  expect(queue.pending()[0]?.fields.some(field => field.value === held.message_text)).toBe(true);
  seal(queue);
  for (const text of [held.message_text, fixtureHoldReasons.get(held.message_id), copy.held_pending, 'data-verdict="hold"']) expect(heldQueue(queue)).toContain(text);
  expect(heldQueue(queue).match(/disabled=""/g)).toHaveLength(2);
  expect(state(queue).messages[0]?.verdict).toBe('hold');
  expect(state(queue).ledger.some(item => item.message_id === held.message_id)).toBe(false);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(state(queue).held).toHaveLength(0);
  expect(state(queue).messages[0]?.verdict).toBe(kind === 'release' ? 'pass' : 'bar');
  expect(state(queue).ledger[0]?.kind).toBe(kind === 'release' ? 'released' : 'removed');
  expect(state(queue).ledger[0]?.message_text).toBe(held.message_text);
});

test('opposing resolutions cannot replace an in-flight held decision', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const held = fixtureHeld[0];
  if (!held) throw new Error('Missing fixture');
  proposeCommand(queue, { kind: 'release', decision_id: held.decision_id }, 'Pass'); seal(queue);
  proposeCommand(queue, { kind: 'remove', decision_id: held.decision_id }, 'Bar');
  expect(() => seal(queue)).toThrow('confirmation');
  moderationSession(queue).port.send({ kind: 'remove', decision_id: held.decision_id });
  vi.runAllTimers(); expect(state(queue).messages[0]?.verdict).toBe('pass');
  expect(state(queue).ledger.filter(item => item.message_id === held.message_id)).toHaveLength(1);
});

test('mode button only proposes; sealed mode is preview only and every actual rule stays shadow', () => {
  const queue = new ProposalQueue();
  const button = find<ButtonHTMLAttributes<HTMLButtonElement> & { 'data-mode'?: string }>(Rules({ state: state(queue), queue }), props => props['data-mode'] === 'shadow');
  click(button.props); expect([...state(queue).preview_modes.values()].every(mode => mode === 'shadow')).toBe(true);
  seal(queue); expect([...state(queue).preview_modes.values()]).toContain('armed');
  expect(fixtureRules.rules.every(rule => rule.mode === 'shadow')).toBe(true);
});

test('two old Shield proposals cannot toggle a confirmed setting back by accident', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue();
  proposeCommand(queue, { kind: 'shield' }, 'Raise the drawbridge');
  proposeCommand(queue, { kind: 'shield' }, 'Raise the drawbridge');
  seal(queue); vi.runAllTimers();
  expect(state(queue).shield).toBe(true);
  expect(() => seal(queue)).toThrow('already matches');
  expect(state(queue).shield).toBe(true);
});

test('Steward verdict/shield draft through the same fixture port; unknown targets remain unsealed', async () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  await steward.ask('pass all as proposed', { surface: 'room' });
  expect(state(queue).held_pending.size).toBe(0); seal(queue); vi.runAllTimers(); expect(state(queue).held).toHaveLength(0);
  await steward.ask('bar unknown line', { surface: 'room' });
  expect(() => seal(queue)).toThrow('original held message'); expect(queue.pending().at(-1)?.state).toBe('drafted');
  await steward.ask('raise the drawbridge', { surface: 'room' }); seal(queue); vi.runAllTimers(); expect(state(queue).shield).toBe(true);
});

test('missing original blocks review; Twitch-origin actions stay labelled and operations never use fetch', () => {
  const queue = new ProposalQueue(); const original = fixtureHeld[0];
  if (!original) throw new Error('Missing fixture');
  const withoutText = { ...original }; delete withoutText.message_text;
  expect(renderToStaticMarkup(<HeldActions item={withoutText} pending={false} queue={queue} />).match(/disabled=""/g)).toHaveLength(2);
  const network = vi.spyOn(globalThis, 'fetch');
  expect(renderToStaticMarkup(<GateLog state={state(queue)} queue={queue} />)).toContain(copy.twitch_human);
  expect(network).not.toHaveBeenCalled();
});
