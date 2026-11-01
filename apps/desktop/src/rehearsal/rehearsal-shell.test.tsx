import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { createRehearsalModel } from './rehearsal-model.js';
import { RehearsalContent } from './rehearsal.jsx';
import { rehearsalShell } from './rehearsal-shell.js';
import { simulatedRehearsal } from './rehearsal-test-support.js';

const native = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined), loaded: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => { native.loaded(); return { invoke: native.invoke }; });
afterEach(() => { vi.unstubAllGlobals(); native.invoke.mockClear(); });

type Button = { children?: ReactNode; onClick?: () => void; disabled?: boolean };
function button(node: ReactNode, label: string): Button | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Button>(child)) continue;
    if (child.props.children === label) return child.props;
    const found = button(child.props.children, label);
    if (found) return found;
  }
  return undefined;
}

test('built native Start/Leave buttons call only the official two relaunch commands', async () => {
  vi.stubGlobal('isTauri', true);
  const shell = rehearsalShell('core');
  if (!shell) throw new Error('Missing simulated native shell');
  const outside = createRehearsalModel({ mode: 'core', shell });
  const start = button(RehearsalContent({ model: outside, state: outside.getSnapshot(), mode: 'core', on_back: vi.fn() }), 'Start dress rehearsal');
  expect(native.loaded).not.toHaveBeenCalled();
  expect(native.invoke).not.toHaveBeenCalled();
  expect(start?.disabled).toBe(false); start?.onClick?.();
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith('enter_rehearsal'));
  expect(native.loaded).toHaveBeenCalledTimes(1);
  native.invoke.mockClear();
  const { connection } = simulatedRehearsal();
  const inside = createRehearsalModel({ mode: 'core', connection, shell });
  await inside.refresh();
  const leave = button(RehearsalContent({ model: inside, state: inside.getSnapshot(), mode: 'core', on_back: vi.fn() }), 'Leave dress rehearsal');
  expect(leave?.disabled).toBe(false); leave?.onClick?.();
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith('leave_rehearsal'));
});

test('fixture and browser core modes never receive the native invoke door', () => {
  expect(rehearsalShell('fixture', true)).toBeUndefined();
  vi.stubGlobal('isTauri', false);
  expect(rehearsalShell('core')).toBeUndefined();
  expect(native.invoke).not.toHaveBeenCalled();
});
