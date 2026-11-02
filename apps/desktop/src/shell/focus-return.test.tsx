import * as React from 'react';
import type { EffectCallback, KeyboardEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { DesktopApp } from '../app.jsx';
import { initialNavigation } from '../navigation.js';
import { Keep } from '../keep/keep.jsx';
import { PersistentStrip } from './strip.jsx';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const snapshot = { mode: 'fixture', phase: 'ready' } as const;
class Root {
  querySelector = vi.fn<Element['querySelector']>();
  closest = vi.fn<Element['closest']>().mockReturnValue(null);
  focus = vi.fn();
}

test('opening a Keep hit then Escape returns focus to that hit, with the persistent strip before it', () => {
  const root = new Root();
  const location = { hash: '#/keep' };
  const tileOrigin: { current: string | undefined } = { current: undefined };
  vi.stubGlobal('window', { location, matchMedia: () => ({ matches: true }) });
  vi.stubGlobal('HTMLElement', Root);
  function app() {
    const effects: EffectCallback[] = [];
    vi.spyOn(React, 'useSyncExternalStore').mockReturnValue(snapshot);
    vi.spyOn(React, 'useState').mockReturnValueOnce([initialNavigation(location.hash), vi.fn()])
      .mockReturnValueOnce(['day', vi.fn()]).mockReturnValueOnce(['lottery', vi.fn()]);
    vi.spyOn(React, 'useRef').mockReturnValueOnce({ current: root }).mockReturnValueOnce({ current: null })
      .mockReturnValueOnce(tileOrigin).mockReturnValueOnce({ current: false });
    vi.spyOn(React, 'useEffect').mockImplementation(effect => { effects.push(effect); });
    const tree = DesktopApp({ client: { getSnapshot: () => snapshot, subscribe: vi.fn(), start: () => vi.fn() } });
    vi.restoreAllMocks();
    return { tree, focus_return: () => effects.at(-1)?.() };
  }
  const initial = app();
  let open_hit: (() => void) | undefined;
  const visit = (node: ReactNode) => React.Children.forEach(node, child => {
    if (!React.isValidElement<{ children?: ReactNode; 'data-room-tile'?: string; onClick?: () => void }>(child)) return;
    if (child.props['data-room-tile'] === 'lottery') open_hit = child.props.onClick;
    visit(child.props.children);
  });
  function KeepProbe() {
    const tree = Keep({ snapshot, on_open: initial.tree.props.children.props.on_navigate, on_enter: vi.fn() });
    visit(tree); return tree;
  }
  const markup = renderToStaticMarkup(<><PersistentStrip snapshot={snapshot} current="keep" on_open={vi.fn()} on_keep={vi.fn()} /><KeepProbe /></>);
  const strip_focus = vi.fn(); const hit_focus = vi.fn();
  root.querySelector.mockImplementation(selector => {
    if (selector !== '[data-room-tile="lottery"]') return null;
    const first = markup.match(/<button[^>]*data-room-tile="lottery"[^>]*>/)?.[0];
    const target: Partial<HTMLElement> = { focus: first?.includes('keep-hit') ? hit_focus : strip_focus };
    return first ? target as HTMLElement : null;
  });
  expect(markup.indexOf('data-role="strip"')).toBeLessThan(markup.indexOf('class="keep-hit kw-hit"'));
  if (!open_hit) throw new Error('Missing Keep hit');
  open_hit();
  expect(location.hash).toBe('#/chamber/lottery');
  const room = app();
  room.focus_return();
  const preventDefault = vi.fn();
  room.tree.props.onKeyDown(Object.assign({} as KeyboardEvent<HTMLDivElement>, {
    key: 'Escape', target: root, nativeEvent: { isComposing: false }, preventDefault,
  }));
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(location.hash).toBe('#/keep');
  app().focus_return();
  expect(hit_focus).toHaveBeenCalledOnce();
  expect(strip_focus).not.toHaveBeenCalled();
  expect(tileOrigin.current).toBeUndefined();
});
