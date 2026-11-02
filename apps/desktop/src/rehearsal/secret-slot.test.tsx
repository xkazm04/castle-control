import { Children, isValidElement } from 'react';
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createDockStore } from '@castle-control/ui/steward-flow';
import { placeSecret, secretStep, SecretField, wantsSecret } from './secret-slot.jsx';
import type { SlotNode } from './secret-slot.jsx';
import { connectFlow } from './steward-flows.js';
import { RehearsalConnectionCard, submitConnection } from './rehearsal.jsx';
import { simulatedRehearsal } from './rehearsal-test-support.js';
import { attachRehearsal } from './rehearsal-bridge.js';
import { createRehearsalModel } from './rehearsal-model.js';

interface Fake extends SlotNode<Fake> { name: string; children: Fake[]; parentElement: Fake | null; readonly nextElementSibling: Fake | null }

/** A tiny tree of fake elements: enough to check where the one host lands, never a browser. */
function node(name: string): Fake {
  const self: Fake = {
    name, children: [], parentElement: null,
    get nextElementSibling() {
      const siblings = (self.parentElement as Fake | null)?.children ?? [];
      return siblings[siblings.indexOf(self) + 1] ?? null;
    },
    querySelector: () => null,
    after(next) {
      const parent = self.parentElement as Fake;
      next.remove(); parent.children.splice(parent.children.indexOf(self) + 1, 0, next); next.parentElement = parent;
    },
    append(next) { next.remove(); self.children.push(next); next.parentElement = self; },
    remove() {
      const parent = self.parentElement as Fake | null;
      if (parent) parent.children.splice(parent.children.indexOf(self), 1);
      self.parentElement = null;
    },
  };
  return self;
}

function inputProps(element: ReactNode): InputHTMLAttributes<HTMLInputElement> | undefined {
  for (const child of Children.toArray(element)) {
    if (!isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) continue;
    if (child.type === 'input') return child.props;
    const found = inputProps(child.props.children);
    if (found) return found;
  }
  return undefined;
}

test('the field is page-owned, masked, never autofilled and uncontrolled', () => {
  const element = SecretField({ disabled: false }) as ReactElement;
  const props = inputProps(element);
  expect(props).toMatchObject({ type: 'password', autoComplete: 'off', name: 'password' });
  for (const prop of ['value', 'defaultValue', 'onChange', 'onInput']) expect(props).not.toHaveProperty(prop);
  expect(renderToStaticMarkup(element)).toContain('Read once at your hold, then cleared');
});

test('the host moves into the hold card under the Steward line only while the draft wants a password', () => {
  const page = node('page'); const home = node('home'); const step = node('step'); const prompt = node('prompt'); const card = node('card');
  step.append(prompt); step.append(card);
  const selectors: string[] = [];
  page.querySelector = selector => { selectors.push(selector); return step; };
  step.querySelector = selector => selector.includes('cc-steward-step__prompt') ? prompt : null;
  const host = node('host');

  expect(placeSecret(host, home, page, false)).toBe('home');
  expect(home.children).toEqual([host]);
  expect(placeSecret(host, home, page, true)).toBe('step');
  expect(step.children).toEqual([prompt, host, card]); expect(home.children).toEqual([]);
  expect(selectors[0]).toBe(`.cc-steward-dock[data-chamber="rehearsal"] .cc-steward-step[data-step="${secretStep}"]`);
  // Idempotent: a re-check (every DOM change triggers one) leaves the host where it stands.
  expect(placeSecret(host, home, page, true)).toBe('step'); expect(step.children).toEqual([prompt, host, card]);
  // The dock lowered or moved on: the same host returns home with whatever was typed in it.
  page.querySelector = () => null;
  expect(placeSecret(host, home, page, true)).toBe('home'); expect(home.children).toEqual([host]);
  // The page form gone (outside the rehearsal): the host is simply detached.
  expect(placeSecret(host, null, page, false)).toBe('none'); expect(host.parentElement).toBeNull();
});

test('only the connect draft that says OBS asks for a password wants the field', () => {
  expect(wantsSecret(undefined)).toBe(false);
  expect(wantsSecret({ secret: 'no' })).toBe(false);
  expect(wantsSecret({ secret: 'yes' })).toBe(true);
  expect(connectFlow.steps.find(step => step.id === secretStep)?.kind).toBe('confirm');
});

test('the page card with a host renders the slot, not a second field', async () => {
  const { model } = simulatedRehearsal(); await model.refresh();
  const html = renderToStaticMarkup(RehearsalConnectionCard({ model, state: model.getSnapshot(), draft: { secret: 'yes' }, secret_home: vi.fn(), secret: () => null }));
  expect(html).toContain('class="rh-secret-home"'); expect(html).not.toContain('name="password"');
});

test('a typed value never reaches the draft, beats or read model, and the hold clears it', async () => {
  const { model } = simulatedRehearsal(); await model.refresh();
  const store = createDockStore();
  store.open(connectFlow);
  for (const answer of ['local', 'default', 'yes', 'once']) store.answer('rehearsal', answer);
  const secret = ['SIMULATED', 'slot', 'only'].join('-');
  const field = { value: secret };
  const draft = store.getSnapshot().drafts.rehearsal?.draft;
  expect(wantsSecret(draft as Parameters<typeof wantsSecret>[0])).toBe(true);
  const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => vi.spyOn(console, level));
  const connect = vi.spyOn(model, 'connect').mockImplementation(async params => { expect(params.password).toBe(secret); expect(field.value).toBe(''); });
  await submitConnection({ host: '127.0.0.1', port: '4455', password: field, remember: false }, model);
  expect(connect).toHaveBeenCalledOnce(); expect(field.value).toBe('');
  for (const surface of [store.getSnapshot(), model.getSnapshot()]) expect(JSON.stringify(surface)).not.toContain(secret);
  for (const log of logs) { expect(JSON.stringify(log.mock.calls)).not.toContain(secret); log.mockRestore(); }
});

test('a seal that sends nothing (no desktop rehearsal) still clears the field without reading it', async () => {
  const field = { value: ['SIMULATED', 'unsent'].join('-') };
  const hasPassword = vi.fn(() => field.value.length > 0);
  const detach = attachRehearsal({ model: createRehearsalModel({ mode: 'fixture' }), connect: vi.fn(), hasPassword, notify: vi.fn(),
    forget: () => { field.value = ''; } });
  try {
    const store = createDockStore();
    store.open(connectFlow);
    for (const answer of ['local', 'default', 'yes', 'once']) store.answer('rehearsal', answer);
    await store.seal('rehearsal');
    expect(field.value).toBe(''); expect(hasPassword).not.toHaveBeenCalled();
    expect(JSON.stringify(store.getSnapshot())).not.toContain('SIMULATED-unsent');
  } finally { detach(); }
});
