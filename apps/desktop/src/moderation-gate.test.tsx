import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode, ReactElement, ButtonHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { InkButton } from '@castle-control/ui';
import type { InkButtonProps } from '@castle-control/ui';
import { gatehouseHeldResolve, gatehouseDelaySet, gatehouseShieldSet, gatehouseLeaseEnd, parseMethodParams } from '@castle-control/contract';
import { createModerationPreview } from './moderation-model.js';
import { fixtureBans, fixtureConfirmationMs, fixtureHeld, fixtureHoldReasons, fixtureRules } from './moderation-fixture.js';
import { GateControls, HeldActions, HeldQueue, Rules } from './rooms/moderator/controls.jsx';
import { GateLog } from './rooms/moderator/log.jsx';
import { moderationSession, proposeCommand, sealModerationProposal } from './rooms/moderator/session.js';
import { moderationCopy as copy } from './moderation-copy.js';
import { decisionTransition, LifecycleRefusal } from './moderation-lifecycle.js';

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
function delaySelect(queue: ProposalQueue) {
  let tree: ReactNode;
  function Probe() {
    tree = GateControls({ state: state(queue), queue });
    return tree;
  }
  renderToStaticMarkup(<Probe />);
  const label = find<LabelHTMLAttributes<HTMLLabelElement>>(tree, props => props.children === copy.propose_delay);
  expect(label.props.children).toBe('Propose chat delay');
  expect(label.props.htmlFor).toBeTruthy();
  const select = find<SelectHTMLAttributes<HTMLSelectElement>>(tree, props => props.id === label.props.htmlFor);
  expect(select.props['aria-label']).toBeUndefined();
  expect(select.props['aria-labelledby']).toBeUndefined();
  return select;
}
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
  for (const delay_s of [0, 2, 4, 6]) expect(parseMethodParams(gatehouseDelaySet, { delay_s })).toEqual({ delay_s });
  expect(() => parseMethodParams(gatehouseDelaySet, { delay_s: 3 })).toThrow();
});

test('delay select drafts only; applied value waits for a seal and then fixture confirmation', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue();
  expect([...controls(queue).matchAll(/<option value="(\d+)"/g)].map(match => match[1])).toEqual(['0', '2', '4', '6']);
  const select = delaySelect(queue);
  select.props.onChange?.({ currentTarget: { value: '3' } } as ChangeEvent<HTMLSelectElement>);
  expect(queue.pending()).toHaveLength(0);
  select.props.onChange?.({ currentTarget: { value: '6' } } as ChangeEvent<HTMLSelectElement>);
  expect(state(queue).delay.value).toBe(4); expect(state(queue).delay.kind).toBe('applied');
  expect(queue.pending()).toHaveLength(1);
  seal(queue);
  expect(state(queue).delay.value).toBe(4);
  expect(controls(queue)).toContain('value="4" selected=""');
  expect(controls(queue)).toContain(copy.gate_pending);
  expect(controls(queue)).not.toContain('generated fixtures only');
  expect(controls(queue)).toContain('aria-busy="true"');
  expect(delaySelect(queue).props.disabled).toBe(true);
  vi.advanceTimersByTime(fixtureConfirmationMs - 1); expect(state(queue).delay.value).toBe(4);
  vi.advanceTimersByTime(1); expect(state(queue).delay.value).toBe(6);
  expect(controls(queue)).toContain('value="6" selected=""');
  expect(controls(queue)).toContain('aria-busy="false"');
});

test('duplicate requests cannot replace pending settings; Shield pressed state waits in both directions', () => {
  vi.useFakeTimers(); const port = createModerationPreview();
  port.send({ kind: 'delay', delay_s: 2 }); port.send({ kind: 'delay', delay_s: 6 });
  port.send({ kind: 'shield' }); port.send({ kind: 'shield' }); vi.runAllTimers();
  expect(port.getSnapshot().delay.value).toBe(2); expect(port.getSnapshot().shield.value).toBe(true);
  const queue = new ProposalQueue();
  for (const enabled of [true, false]) {
    proposeCommand(queue, { kind: 'shield' }, 'Shield proposal');
    expect(state(queue).shield.value).toBe(!enabled); seal(queue);
    expect(controls(queue)).toContain(`aria-pressed="${!enabled}"`);
    vi.advanceTimersByTime(fixtureConfirmationMs); expect(state(queue).shield.value).toBe(enabled);
    expect(controls(queue)).toContain(`aria-pressed="${enabled}"`);
  }
  expect(controls(queue).match(/aria-label="Shield Mode/g)).toHaveLength(1);
});

test.each(['release', 'remove'] as const)('%s proposes via a native keyboard button and stays held until confirmed', kind => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const held = fixtureHeld[0];
  if (!held?.message_text) throw new Error('Missing original');
  const label = kind === 'release' ? 'Propose Pass' : 'Propose Bar';
  // C replaces the bare review button with InkButton plus a decorative icon.
  // Resolve that kit leaf to keep every native-button and proposal assertion.
  const button = InkButton(find<InkButtonProps>(HeldActions({ item: held, state: state(queue), queue }), props => props['aria-label'] === label).props);
  expect(button.type).toBe('button'); expect(button.props.type).toBe('button');
  expect(button.props.disabled).toBe(false); expect(button.props.tabIndex ?? 0).toBeGreaterThanOrEqual(0);
  click(button.props);
  expect([...state(queue).phases.values()].some(phase => phase.kind === 'confirming')).toBe(false);
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
  expect(state(queue).shield.value).toBe(true);
  expect(() => seal(queue)).toThrow('already matches');
  expect(state(queue).shield.value).toBe(true);
});

test('Steward verdict/shield draft through the same fixture port; unknown targets remain unsealed', async () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  await steward.ask('pass all as proposed', { surface: 'room' });
  expect([...state(queue).phases.values()].some(phase => phase.kind === 'confirming')).toBe(false); seal(queue); vi.runAllTimers(); expect(state(queue).held).toHaveLength(0);
  await steward.ask('bar unknown line', { surface: 'room' });
  expect(() => seal(queue)).toThrow('original held message'); expect(queue.pending().at(-1)?.state).toBe('drafted');
  await steward.ask('raise the drawbridge', { surface: 'room' }); seal(queue); vi.runAllTimers(); expect(state(queue).shield.value).toBe(true);
});

test('missing original blocks review; Twitch-origin actions stay labelled and operations never use fetch', () => {
  const queue = new ProposalQueue(); const original = fixtureHeld[0];
  if (!original) throw new Error('Missing fixture');
  const withoutText = { ...original }; delete withoutText.message_text;
  expect(renderToStaticMarkup(<HeldActions item={withoutText} state={{ ...state(queue), held: [withoutText] }} queue={queue} />).match(/disabled=""/g)).toHaveLength(2);
  const network = vi.spyOn(globalThis, 'fetch');
  expect(renderToStaticMarkup(<GateLog state={state(queue)} queue={queue} />)).toContain(copy.twitch_human);
  expect(network).not.toHaveBeenCalled();
});

test('a Ban draft waits for the human seal, then retains its queue entry until 400 ms confirmation', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const ban = fixtureBans[0];
  if (!ban) throw new Error('Missing simulated ban');
  proposeCommand(queue, { kind: 'ban', decision_id: ban.decision_id }, 'Ban · human review');
  vi.advanceTimersByTime(4000);
  expect(state(queue).bans).toContain(ban);
  seal(queue);
  expect(state(queue).bans).toContain(ban);
  expect(state(queue).phases.get(ban.decision_id)).toMatchObject({ kind: 'confirming', op: 'ban' });
  const confirming = heldQueue(queue);
  expect(confirming).toContain('Pending ban · Confirming ban');
  expect(confirming.match(/disabled=""/g)).toHaveLength(2);
  vi.advanceTimersByTime(fixtureConfirmationMs - 1); expect(state(queue).bans).toContain(ban);
  vi.advanceTimersByTime(1); expect(state(queue).bans).toHaveLength(0);
  expect(state(queue).phases.get(ban.decision_id)).toEqual({ kind: 'banned' });
});

test.each(['ban', 'dismiss', 'undo', 'release', 'remove', 'petition'] as const)('%s settlement keeps the gate-roll verdict aligned with chat', kind => {
  vi.useFakeTimers(); const queue = new ProposalQueue();
  const target = kind === 'ban' || kind === 'dismiss' ? state(queue).bans[0]
    : kind === 'release' || kind === 'remove' ? state(queue).held[0] : state(queue).ledger[0];
  if (!target) throw new Error('Missing simulated target');
  proposeCommand(queue, { kind, decision_id: target.decision_id }, 'Simulated review'); seal(queue);
  expect(state(queue).ledger.find(item => item.decision_id === target.decision_id)?.verdict).toBe(kind === 'undo' || kind === 'petition' ? 'bar' : undefined);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  const expected = kind === 'ban' || kind === 'remove' || kind === 'petition' ? 'bar' : 'pass';
  const entry = state(queue).ledger.find(item => item.decision_id === target.decision_id);
  expect(entry?.verdict).toBe(expected);
  const message = state(queue).messages.find(item => item.message_id === target.message_id);
  if (message) expect(message.verdict).toBe(entry?.verdict);
  expect(state(queue).ledger.filter(item => item.decision_id === target.decision_id)).toHaveLength(1);
});

test('recorded shadow entries explain that no action was taken instead of claiming Twitch cannot undo', () => {
  const queue = new ProposalQueue();
  const html = renderToStaticMarkup(<GateLog state={state(queue)} queue={queue} />);
  const row = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].find(match => match[1]?.includes('Simulated link awaiting review.'))?.[1];
  expect(row).toBeTruthy(); expect(row).not.toContain('No undo on Twitch'); expect(row).toContain('No action was taken');
  expect(html.replace(/<[^>]+>/g, '')).not.toContain('simulated_pattern_match');
});

test('two Undo drafts cannot both seal the same timed-out decision', () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); const timeout = state(queue).ledger[0];
  if (!timeout) throw new Error('Missing simulated timeout');
  proposeCommand(queue, { kind: 'undo', decision_id: timeout.decision_id }, 'First Undo');
  proposeCommand(queue, { kind: 'undo', decision_id: timeout.decision_id }, 'Second Undo');
  const [first, second] = queue.pending('moderator');
  if (!first || !second) throw new Error('Missing drafts');
  sealModerationProposal(queue, first); vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(() => sealModerationProposal(queue, second)).toThrow(copy.operation_unavailable);
  expect(() => sealModerationProposal(queue, second)).toThrow(LifecycleRefusal);
  expect(queue.pending('moderator')).toContain(second);
  expect(second.state).toBe('drafted');
});

test('an absent ban rule disables the room button and refuses a direct command at seal time', () => {
  const queue = new ProposalQueue(); const port = moderationSession(queue).port;
  const ban = state(queue).bans[0];
  if (!ban) throw new Error('Missing simulated ban');
  const missingRule = { ...state(queue), rules: state(queue).rules.filter(rule => rule.rule_id !== ban.rule_id) };
  vi.spyOn(port, 'getSnapshot').mockReturnValue(missingRule);
  const button = find<InkButtonProps>(HeldQueue({ state: missingRule, queue }), props => props.children === copy.propose_ban);
  expect(button.props.disabled).toBe(true);
  proposeCommand(queue, { kind: 'ban', decision_id: ban.decision_id }, 'Direct Ban');
  expect(decisionTransition(missingRule, ban.decision_id, 'ban')).toEqual({ ok: false, refusal: 'rule_unavailable' });
  expect(() => seal(queue)).toThrow(copy.rule_unavailable);
  expect(() => seal(queue)).toThrow(expect.objectContaining({ refusal: 'rule_unavailable' }));
  expect(queue.pending('moderator').at(-1)?.state).toBe('drafted');
});

test('a missing original refuses a proposal with visible feedback instead of a dead click', () => {
  const queue = new ProposalQueue(); const port = moderationSession(queue).port;
  const original = state(queue).held[0];
  if (!original) throw new Error('Missing simulated original');
  const withoutText = { ...original }; delete withoutText.message_text;
  const snapshot = { ...state(queue), held: [withoutText] };
  const read = vi.spyOn(port, 'getSnapshot').mockReturnValue(snapshot);
  proposeCommand(queue, { kind: 'release', decision_id: original.decision_id }, 'Unavailable original');
  read.mockRestore();
  expect(queue.pending('moderator')).toHaveLength(0);
  expect(state(queue).notice).toBe(copy.original_unavailable);
});
