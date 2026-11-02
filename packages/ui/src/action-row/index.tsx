import { useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import './row.css';

/** The very same entries are registered with the desktop shortcut dispatcher. */
export type ActionKey = { key: string; label: string; run: () => void; disabled?: boolean };
type RowProps = { entries: readonly ActionKey[]; seal: ReactNode; open: boolean; on_open: (open: boolean) => void };
type RowRefs = { area: RefObject<HTMLDivElement | null>; measure: RefObject<HTMLDivElement | null>;
  more: RefObject<HTMLButtonElement | null>; menu: RefObject<HTMLDivElement | null> };

export function fitActionCount(widths: readonly number[], available: number, gap: number, more_width: number): number {
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (total <= available) return widths.length;
  let used = more_width;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width; count++;
  }
  return count;
}

export function ActionRow({ entries, seal, open, on_open }: RowProps) {
  const area = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(entries.length);
  useLayoutEffect(() => {
    function fit() {
      const target = area.current; const sizes = measure.current;
      if (!target || !sizes) return;
      const widths = [...sizes.querySelectorAll<HTMLElement>('[data-measure-key]')].map(node => node.getBoundingClientRect().width);
      const reserved = sizes.querySelector<HTMLElement>('[data-measure-more]')?.getBoundingClientRect().width ?? 0;
      const gap = Number.parseFloat(getComputedStyle(target).columnGap) || 0;
      setCount(fitActionCount(widths, target.getBoundingClientRect().width, gap, reserved));
    }
    fit();
    const observer = new ResizeObserver(fit);
    if (area.current) observer.observe(area.current);
    if (measure.current) observer.observe(measure.current);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [entries]);
  useLayoutEffect(() => { if (open) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [open]);
  return <ActionRowView entries={entries} seal={seal} open={open} on_open={on_open} count={count} area={area} measure={measure} more={more} menu={menu} />;
}

/** Rendering is independent of measurement so overflow is also reviewable without a layout engine. */
export function ActionRowView({ entries, seal, open, on_open, count, area, measure, more, menu }: RowProps & RowRefs & { count: number }) {
  const overflow = entries.slice(count);
  function key(entry: ActionKey, menu_item = false) {
    return <button key={entry.key} type="button" className="cc-action-key" data-role="action-key" disabled={entry.disabled}
      role={menu_item ? 'menuitem' : undefined}
      onClick={() => { on_open(false); entry.run(); }}><kbd>{entry.key}</kbd><span>{entry.label}</span></button>;
  }
  return <div className="cc-action-row" data-role="action-row" aria-label="Room action keys">
    <div className="cc-action-keys" ref={area}>
      {entries.slice(0, count).map(entry => key(entry))}
      {overflow.length > 0 && <button ref={more} type="button" className="cc-action-more" aria-expanded={open} aria-haspopup="menu"
        onClick={() => on_open(!open)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); on_open(true); }
        }}>more · {overflow.length}</button>}
    </div>
    <div className="cc-action-measure" ref={measure} aria-hidden="true">
      {entries.map(entry => <span className="cc-action-key" data-measure-key key={entry.key}><kbd>{entry.key}</kbd><span>{entry.label}</span></span>)}
      <span className="cc-action-more" data-measure-more>more · {entries.length}</span>
    </div>
    {open && overflow.length > 0 && <div ref={menu} className="cc-action-popover" role="menu" aria-label="More room keys"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); on_open(false); more.current?.focus(); }
        if (event.key === 'Tab') on_open(false);
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (step) { event.preventDefault(); buttons[(index + step + buttons.length) % buttons.length]?.focus(); }
      }} onBlur={event => {
        if (!(event.relatedTarget instanceof Node) || (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== more.current)) on_open(false);
      }}>
      <p role="presentation">More keys · also work from the keyboard</p>{overflow.map(entry => key(entry, true))}
    </div>}
    <div className="cc-action-seal">{seal}</div>
  </div>;
}
