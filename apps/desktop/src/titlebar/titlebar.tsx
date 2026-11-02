import { useEffect, useState } from 'react';
import { Mark } from '@castle-control/ui';
import './titlebar.css';

// The Tauri SDK stays out of the first-load chunk. The window module's own typings do not compile under
// this repo's strict resolution, so the same window plugin commands are invoked through core.
const label = 'main';
const load = async () => {
  const { invoke: nativeInvoke } = await import('@tauri-apps/api/core');
  const call = <T,>(cmd: string) => nativeInvoke<T>('plugin:window|' + cmd, { label });
  return {
    title: () => call<string>('title'), isMaximized: () => call<boolean>('is_maximized'),
    minimize: () => call<void>('minimize'), toggleMaximize: () => call<void>('toggle_maximize'), close: () => call<void>('close'),
  };
};
type WindowApi = Awaited<ReturnType<typeof load>>;

const glyph = {
  min: 'M2 6h8',
  max: 'M2.5 2.5h7v7h-7z',
  restore: 'M4 2.5h5.5V8M2.5 4h5.5v5.5H2.5z',
  close: 'M2.5 2.5l7 7M9.5 2.5l-7 7',
};

function Glyph({ d }: { d: string }) {
  return <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" />
  </svg>;
}

/** A failed window command leaves the window as it was; say so in the console rather than swallow it. */
function report(error: unknown) { console.error('Title bar: window command failed', error); }

/** Native window chrome: rendered only inside the Tauri window (see TitleBarHost). */
export default function TitleBar() {
  const [win, setWin] = useState<WindowApi | undefined>();
  const [title, setTitle] = useState('Castle Control');
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let live = true;
    void load().then(async w => {
      if (!live) return;
      setWin(w);
      setTitle(await w.title());
      setMaximized(await w.isMaximized());
    }).catch(report);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!win) return;
    const sync = () => { void win.isMaximized().then(setMaximized).catch(report); };
    window.addEventListener('resize', sync);
    return () => { window.removeEventListener('resize', sync); };
  }, [win]);
  useEffect(() => {
    document.documentElement.dataset.titlebar = '';
    return () => { delete document.documentElement.dataset.titlebar; };
  }, []);
  const run = (fn: (w: WindowApi) => Promise<void>) => () => { if (win) void fn(win).catch(report); };
  const parts = title.split(' — ');
  return <header className="cc-titlebar" data-role="title-bar">
    <div className="cc-titlebar__drag" data-tauri-drag-region onDoubleClick={run(w => w.toggleMaximize())}>
      <span className="cc-titlebar__mark" data-tauri-drag-region><Mark /></span>
      <span className="cc-titlebar__name" data-tauri-drag-region>{parts[0]}</span>
      {parts.length > 1 && <span className="cc-titlebar__tag" data-tauri-drag-region>{parts.slice(1).join(' — ')}</span>}
    </div>
    <div className="cc-titlebar__controls">
      <button type="button" className="cc-titlebar__btn" aria-label="Minimize" onClick={run(w => w.minimize())}><Glyph d={glyph.min} /></button>
      <button type="button" className="cc-titlebar__btn" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={run(w => w.toggleMaximize())}>
        <Glyph d={maximized ? glyph.restore : glyph.max} /></button>
      <button type="button" className="cc-titlebar__btn cc-titlebar__btn--close" aria-label="Close" onClick={run(w => w.close())}><Glyph d={glyph.close} /></button>
    </div>
  </header>;
}
