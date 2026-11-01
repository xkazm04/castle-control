import { Children, isValidElement } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup, renderToReadableStream } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { SealButton } from '@castle-control/ui';
import { createRehearsalModel } from './rehearsal-model.js';
import { RehearsalConnectionCard, RehearsalContent, RehearsalOutputRow, submitConnection } from './rehearsal.jsx';
import { simulatedRehearsal } from './rehearsal-test-support.js';
import { KeepEntrance } from '../keep/keep.jsx';
import { backHash, canonicalHash, dispatchShortcut, initialNavigation, navigateHash, routeFromHash } from '../navigation.js';
import { DesktopView } from '../view.jsx';

type Leaf = { children?: ReactNode; on_seal?: () => void; onClick?: () => void; disabled?: boolean; variant?: string };
function seals(node: ReactNode): Leaf[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Leaf>(child)) return [];
    return child.type === SealButton ? [child.props] : seals(child.props.children);
  });
}

// Inspect the rendered host input rather than serialized attribute order. This
// also distinguishes an uncontrolled input from value/defaultValue/onChange.
function input(node: ReactNode, name: string): InputHTMLAttributes<HTMLInputElement> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) continue;
    if (child.type === 'input' && child.props.name === name) return child.props;
    const found = input(child.props.children, name);
    if (found) return found;
  }
  return undefined;
}

test('fixture screen explains the real core, own OBS, SIMULATED chat and no login; disabled start has the kit Notice', () => {
  const model = createRehearsalModel({ mode: 'fixture' });
  const html = renderToStaticMarkup(RehearsalContent({ model, state: model.getSnapshot(), mode: 'fixture', on_back: vi.fn() }));
  for (const text of ['Dress rehearsal', 'real core', 'your own OBS', 'SIMULATED chat', 'No Twitch login', 'needs the desktop app', 'cc-notice-region']) expect(html).toContain(text);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start dress rehearsal<\/button>/);
  expect(html).not.toContain('name="password"');
});

test('workspace retains provenance, masked uncontrolled password, defaults and a separate preset per output', async () => {
  const { model } = simulatedRehearsal(); await model.refresh();
  const html = renderToStaticMarkup(RehearsalContent({ model, state: model.getSnapshot(), mode: 'core', on_back: vi.fn() }));
  expect(html).toContain('data-stamp="simulated"'); expect(html).toContain('>SIMULATED</span>');
  expect(html).toContain('Leave dress rehearsal');
  const card = RehearsalConnectionCard({ model, state: model.getSnapshot() });
  const password = input(card, 'password');
  expect(password).toMatchObject({ type: 'password', autoComplete: 'off' });
  for (const prop of ['value', 'defaultValue', 'onChange']) expect(password).not.toHaveProperty(prop);
  expect(input(card, 'host')).toMatchObject({ defaultValue: '127.0.0.1' });
  expect(input(card, 'port')).toMatchObject({ defaultValue: '4455' });
  expect(input(card, 'remember')).toMatchObject({ type: 'checkbox', defaultChecked: false });
  expect(html).toContain('Tools › WebSocket Server Settings › Show Connect Info');
  expect(html).toContain('Fill a Lot first'); expect(html).toContain('Duel'); expect(html).not.toContain('Duel overlay coming');
  expect(html.match(/source size"/g)).toHaveLength(4);
  for (const text of ['Fill a Lot', 'Run a vote', 'Fire beacon', 'Run a duel round', 'min="0" max="600"']) expect(html).toContain(text);
});

test('submit clears the masked input synchronously and sends the explicit remember choice only for that submit', async () => {
  const { model } = simulatedRehearsal(); await model.refresh();
  const field = { value: ['SIMULATED', 'input', 'only'].join('-') };
  let captured = false;
  const connect = vi.spyOn(model, 'connect').mockImplementation(async params => {
    captured = params.password.length > 0 && params.remember && params.host === '127.0.0.1' && params.port === 4466;
    expect(field.value).toBe('');
  });
  await submitConnection({ host: '127.0.0.1', port: '4466', password: field, remember: true }, model);
  expect(captured).toBe(true); expect(connect).toHaveBeenCalledOnce();
  expect(JSON.stringify(model.getSnapshot())).not.toContain('SIMULATED-input-only');
  connect.mockClear();
});

test('output add and cleanup expose only shared hold controls, and row clicks never add', async () => {
  const { model } = simulatedRehearsal(); await model.refresh(); await model.ensureScene();
  const row = model.getSnapshot().rows.find(row => row.kind === 'vote')!;
  const add = vi.spyOn(model, 'add'); const clear = vi.spyOn(model, 'clear');
  const element = RehearsalOutputRow({ row, state: model.getSnapshot(), model });
  expect(element.props.onClick).toBeUndefined();
  expect(seals(element)[0]).toMatchObject({ variant: 'proclaim', disabled: false });
  expect(add).not.toHaveBeenCalled();
  seals(element)[0]?.on_seal?.();
  expect(add).toHaveBeenCalledExactlyOnceWith('vote');
  // Wait for the add to finish before exposing the cleanup hold.
  await vi.waitFor(() => expect(model.getSnapshot().busy).toBe(false));
  const content = RehearsalContent({ model, state: model.getSnapshot(), mode: 'core', on_back: vi.fn() });
  const cleanup = seals(content).find(seal => seal.variant !== 'proclaim');
  expect(cleanup?.disabled).toBe(false); expect(clear).not.toHaveBeenCalled();
  cleanup?.on_seal?.(); expect(clear).toHaveBeenCalledOnce();
});

test('canonical route, Keep entry, lazy non-chamber view, Back and Escape all return to Keep', async () => {
  expect(canonicalHash('#/rehearsal')).toBe('#/rehearsal'); expect(routeFromHash('#/rehearsal')).toBe('rehearsal');
  let navigation = initialNavigation('#/overview');
  const entry = KeepEntrance({ on_enter: vi.fn(), on_rehearsal: () => { navigation = navigateHash(navigation, '#/rehearsal'); } });
  const entrance = Children.toArray(entry.props.children).find(button => isValidElement<Leaf>(button) && button.props.children === 'Dress rehearsal');
  if (!isValidElement<Leaf>(entrance)) throw new Error('Missing Dress rehearsal entrance');
  entrance.props.onClick?.();
  expect(backHash(navigation)).toBe('#/keep');
  const stream = await renderToReadableStream(<DesktopView navigation={navigation} snapshot={{ mode: 'fixture', phase: 'ready' }}
    theme="paper" on_navigate={vi.fn()} on_theme_change={vi.fn()} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('rehearsal-workspace'); expect(html).not.toContain('data-module="rehearsal"'); expect(html).not.toContain('shell-room');
  expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
  dispatchShortcut({ key: 'Escape', preventDefault: vi.fn() }, true, vi.fn(), vi.fn(),
    { back: () => { navigation = navigateHash(navigation, backHash(navigation)); } });
  expect(navigation.current).toBe('keep');
});

test('large output lists retain virtualization', async () => {
  const { model } = simulatedRehearsal(); await model.refresh();
  const state = model.getSnapshot();
  const rows = Array.from({ length: 100 }, (_, index) => ({ ...state.rows[1]!, id: `simulated-${index}` }));
  const html = renderToStaticMarkup(RehearsalContent({ model, state: { ...state, rows }, mode: 'core', on_back: vi.fn() }));
  expect(html).toContain('aria-rowcount="100"'); expect(html.match(/role="row"/g)?.length).toBeLessThan(100);
});
