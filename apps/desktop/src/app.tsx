import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { ModuleId } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { DesktopClient } from './model.js';
import { dispatchShortcut, routeFromHash } from './navigation.js';
import { DesktopView } from './view.jsx';

export function DesktopApp({ client }: { client: DesktopClient }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [current, setCurrent] = useState(() => routeFromHash(window.location.hash));
  const [theme, setTheme] = useState<Theme>('paper');
  const [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => client.start(), [client]);
  useEffect(() => {
    const sync = () => { if (window.location.hash.startsWith('#/')) setCurrent(routeFromHash(window.location.hash)); };
    window.addEventListener('hashchange', sync);
    root.current?.focus();
    return () => { window.removeEventListener('hashchange', sync); };
  }, []);
  function navigate(id: ModuleId) {
    setCurrent(id);
    window.location.hash = `/${id}`;
    setSearch('');
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const editable = event.target instanceof HTMLElement && Boolean(event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
    dispatchShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing, defaultPrevented: event.defaultPrevented, repeat: event.repeat,
      preventDefault: () => { event.preventDefault(); } }, editable, navigate, () => { searchInput.current?.focus(); });
  }
  return <div className="desktop-root" ref={root} tabIndex={-1} onKeyDown={keyboard}>
    <DesktopView current={current} snapshot={snapshot} theme={theme} on_navigate={navigate}
      on_theme_change={setTheme} search={search} on_search={setSearch} search_ref={searchInput} />
  </div>;
}
