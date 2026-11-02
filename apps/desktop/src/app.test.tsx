import * as React from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import { DesktopApp } from './app.jsx';
import { initialNavigation } from './navigation.js';
import { Keep } from './keep/keep.jsx';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type HitProps = { children?: ReactNode; 'data-room-tile'?: string; onClick: () => void };
function hits(node: ReactNode): ReactElement<HitProps>[] {
  return React.Children.toArray(node).flatMap(child => !React.isValidElement<HitProps>(child) ? []
    : child.props['data-room-tile'] ? [child] : hits(child.props.children));
}

class ShortcutRoot {
  querySelector = vi.fn<Element['querySelector']>();
  closest = vi.fn<Element['closest']>().mockReturnValue(null);
}

// Drive the app's real dispatch door through the actual Keep button handler and
// camera hook. Only mounting hooks and DOM lookups are supplied by this Node host.
function shortcutApp(hash: string, reduced = false) {
  const root = new ShortcutRoot();
  const location = { hash };
  const snapshot = { mode: 'fixture', phase: 'ready' } as const;
  vi.stubGlobal('window', { location, matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal('HTMLElement', ShortcutRoot);
  vi.spyOn(React, 'useSyncExternalStore').mockReturnValueOnce(snapshot).mockReturnValue(proposalQueue.getSnapshot());
  const selected = vi.fn();
  vi.spyOn(React, 'useState')
    .mockReturnValueOnce([initialNavigation(hash), vi.fn()])
    .mockReturnValueOnce(['day', vi.fn()]).mockReturnValueOnce(['lottery', selected])
    .mockReturnValueOnce([undefined, vi.fn()]).mockReturnValueOnce([undefined, vi.fn()]);
  const refs = vi.spyOn(React, 'useRef').mockImplementation(value => ({ current: value }));
  refs.mockReturnValueOnce({ current: root });
  const effects = vi.spyOn(React, 'useEffect').mockImplementation(() => undefined);
  const app = DesktopApp({ client: { getSnapshot: () => snapshot, subscribe: vi.fn(), start: () => vi.fn() } });
  const cleanup: (() => void)[] = [];
  effects.mockImplementation(effect => { const dispose = effect(); if (dispose) cleanup.push(dispose); });
  refs.mockReturnValueOnce({ current: null }).mockReturnValueOnce({ current: { querySelectorAll: () => [] } });
  const keep = Keep({ on_open: app.props.children.props.on_navigate, on_enter: vi.fn() });
  const buttons = hits(keep);
  root.querySelector.mockImplementation(selector => {
    const hit = buttons.find(button => selector === `.keep-home button[data-room-tile="${button.props['data-room-tile']}"]`);
    return hit ? { click: hit.props.onClick } as HTMLButtonElement : null;
  });
  function key(number: string) {
    const preventDefault = vi.fn();
    app.props.onKeyDown(Object.assign({} as KeyboardEvent<HTMLDivElement>, {
      key: number, target: root, nativeEvent: { isComposing: false }, preventDefault,
    }));
    expect(preventDefault).toHaveBeenCalledOnce();
  }
  return { key, root, location, selected, cleanup: () => cleanup.forEach(dispose => dispose()) };
}

test.each(chambers)('Keep key $number opens the $id chamber at once through its hit', ({ id, number }) => {
  vi.useFakeTimers();
  const app = shortcutApp('#/keep');
  app.key(number);
  expect(app.root.querySelector).toHaveBeenCalledExactlyOnceWith(`.keep-home button[data-room-tile="${id}"]`);
  expect(app.location.hash).toBe(`#/chamber/${id}`);
  expect(app.selected).toHaveBeenCalledExactlyOnceWith(id);
  expect(vi.getTimerCount()).toBe(0);
  app.cleanup();
});

test.each(chambers)('room key $number navigates directly to $id without a Keep dolly', ({ id, number }) => {
  vi.useFakeTimers();
  const app = shortcutApp('#/chamber/moderator');
  app.key(number);
  expect(app.location.hash).toBe(`#/chamber/${id}`);
  expect(app.selected).toHaveBeenCalledExactlyOnceWith(id);
  expect(app.root.querySelector).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  app.cleanup();
});
