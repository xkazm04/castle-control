import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, MouseEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { createSealHold, SealControl, sealHoldDurationMs } from '../seal-button.jsx';
import { StepCard } from './cards.jsx';
import { defineFlow, walkFlow } from './flow.js';
import { createDockStore } from './store.js';

afterEach(() => vi.useRealTimers());
function buttons(node: ReactNode): ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>[] {
  const found: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === 'button' && isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(child)) found.push(child);
    found.push(...buttons(child.props.children));
  });
  return found;
}

test('the draft reply chip leaves its ready draft in Preview; click and early release cannot seal it', async () => {
  vi.useFakeTimers();
  const seal = vi.fn(() => ({ say: 'Applied in the SIMULATED sandbox.' }));
  const flow = defineFlow({ id: 'simulated-draft', chamber: 'lottery', title: 'SIMULATED draw', simulated: true,
    initial: () => ({ winners: 3 }), steps: [{ id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Review this draft.',
      lines: () => [{ label: 'Winners', value: '3' }] }], seal });
  const store = createDockStore(); store.open(flow);
  const session = store.getSnapshot().sessions.lottery;
  const entry = session && walkFlow(session.flow, session.state).active;
  if (!session || !entry) throw new Error('Missing ready reply');
  const reply = StepCard({ session, entry, chamber: 'lottery', store, on_preview: () => { store.preview('lottery'); } });
  const chip = buttons(reply).find(button => renderToStaticMarkup(button).includes('Draft this'));
  if (!chip) throw new Error('Missing draft action chip');
  chip.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
  expect(store.getSnapshot().expanded).toBe(false);
  expect(store.getSnapshot().drafts.lottery).toMatchObject({ ready: true, simulated: true, draft: { winners: 3 } });
  expect(seal).not.toHaveBeenCalled();
  const hold = createSealHold(() => { void store.seal('lottery'); }, vi.fn());
  const control = SealControl({ hold, progress: 0, size: 'key', draft_count: 1 });
  expect(control.props.onClick).toBeUndefined();
  hold.start('keyboard'); await vi.advanceTimersByTimeAsync(sealHoldDurationMs - 1); hold.cancel('keyboard');
  expect(seal).not.toHaveBeenCalled();
  hold.start('keyboard'); await vi.advanceTimersByTimeAsync(sealHoldDurationMs);
  expect(seal).toHaveBeenCalledExactlyOnceWith({ winners: 3 });
  expect(store.getSnapshot().drafts.lottery).toBeUndefined();
});

test('withdraw removes the draft through the reply chip without an action', () => {
  const seal = vi.fn(() => ({ say: 'Sealed.' }));
  const flow = defineFlow({ id: 'simulated-withdraw', chamber: 'lottery', title: 'SIMULATED draft', simulated: true,
    initial: () => ({}), steps: [{ id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Review.', lines: () => [] }], seal });
  const store = createDockStore(); store.open(flow);
  const session = store.getSnapshot().sessions.lottery;
  const entry = session && walkFlow(session.flow, session.state).active;
  if (!session || !entry) throw new Error('Missing draft');
  const reply = StepCard({ session, entry, chamber: 'lottery', store });
  const chip = buttons(reply).find(button => renderToStaticMarkup(button).includes('Withdraw this draft'));
  if (!chip) throw new Error('Missing withdraw chip');
  chip.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
  expect(store.getSnapshot().drafts.lottery).toBeUndefined();
  expect(seal).not.toHaveBeenCalled();
});

test('conversation reads advance on open; generated replies retain UTC timestamps for bubbles', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T13:00:00Z'));
  const store = createDockStore();
  const first = store.say({ chamber: 'moderator', who: 'steward', text: 'SIMULATED reply', simulated: true });
  expect(store.getSnapshot().beats.at(-1)?.at).toBe('2026-11-02T13:00:00.000Z');
  expect(store.getSnapshot().read_through).toBeLessThan(first);
  store.expand(); expect(store.getSnapshot().read_through).toBe(first);
  store.collapse(); expect(store.getSnapshot().expanded).toBe(false);
  const delayed = defineFlow({ id: 'simulated-delayed-reply', chamber: 'moderator', title: 'SIMULATED delayed reply', simulated: true,
    initial: () => ({}), steps: [], seal: () => ({ say: 'No action.' }) });
  // A reply that arrives after Escape stays closed and unread, ready to peek.
  store.open(delayed, false);
  expect(store.getSnapshot().expanded).toBe(false);
  expect(store.getSnapshot().beats.at(-1)?.id).toBeGreaterThan(store.getSnapshot().read_through);
});
