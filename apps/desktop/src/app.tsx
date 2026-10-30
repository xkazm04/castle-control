import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { ModuleId } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { DesktopClient } from './model.js';
import { backHash, canonicalHash, dispatchShortcut, initialNavigation, navigateHash } from './navigation.js';
import { DesktopView } from './view.jsx';

export function tearFocusedProposal(root: Pick<ParentNode, 'querySelector'> | null) {
  root?.querySelector<HTMLElement>('[data-proposal-focused="true"] [data-tear-proposal]')?.click();
}

export function DesktopApp({ client }: { client: DesktopClient }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [navigation, setNavigation] = useState(() => initialNavigation(window.location.hash));
  const [theme, setTheme] = useState<Theme>('paper');
  const [selected, setSelected] = useState<ModuleId>('lottery');
  const root = useRef<HTMLDivElement>(null);
  const stewardInput = useRef<HTMLInputElement>(null);
  const tileOrigin = useRef<ModuleId | undefined>(undefined);
  const demoOrigin = useRef(false);
  useEffect(() => client.start(), [client]);
  useEffect(() => {
    const sync = () => {
      const hash = canonicalHash(window.location.hash);
      if (hash !== window.location.hash) window.history.replaceState(null, '', hash);
      setNavigation(previous => navigateHash(previous, hash));
    };
    sync();
    window.addEventListener('hashchange', sync);
    root.current?.focus();
    return () => { window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => {
    if (navigation.current !== 'keep' && navigation.current !== 'overview') { root.current?.focus(); return; }
    if (navigation.current === 'keep' && demoOrigin.current) {
      root.current?.querySelector<HTMLElement>('[data-demo-entry]')?.focus();
      demoOrigin.current = false;
    }
    if (tileOrigin.current) {
      root.current?.querySelector<HTMLElement>(`[data-room-tile="${tileOrigin.current}"]`)?.focus();
      tileOrigin.current = undefined;
    }
  }, [navigation.current]);
  function go(hash: string) {
    const canonical = canonicalHash(hash);
    if (canonical === '#/demo') demoOrigin.current = true;
    setNavigation(previous => navigateHash(previous, canonical));
    if (window.location.hash !== canonical) window.location.hash = canonical;
  }
  function navigate(id: ModuleId) {
    tileOrigin.current = id;
    setSelected(id);
    go(`#/chamber/${id}`);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const editable = event.target instanceof HTMLElement && Boolean(event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
    const tile = event.target instanceof HTMLElement && event.target.closest('[data-room-tile]');
    dispatchShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing, defaultPrevented: event.defaultPrevented, repeat: event.repeat,
      preventDefault: () => { event.preventDefault(); } }, editable, navigate, () => { stewardInput.current?.focus(); },
    {
      overview: () => go('#/overview'),
      back: () => go(backHash(navigation)),
      ...(navigation.current === 'overview' && (tile || event.target === root.current) ? { open: () => navigate(selected) } : {}),
      // Only the focused shared-queue proposal may own Delete.
      tear: () => tearFocusedProposal(root.current),
    });
  }
  return <div className="desktop-root" ref={root} tabIndex={-1} onKeyDown={keyboard}>
    <DesktopView navigation={navigation} snapshot={snapshot} theme={theme} on_navigate={navigate}
      on_surface={surface => go(`#/${surface}`)} on_back={() => go(backHash(navigation))}
      on_theme_change={setTheme} selected={selected} on_select={setSelected} steward_ref={stewardInput} />
  </div>;
}
