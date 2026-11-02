import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { StewardChip } from './registry.js';

const key = (chip: StewardChip) => chip.action.kind === 'flow' ? `flow:${chip.action.flow}` : `${chip.action.kind}:${chip.action.chamber}`;

/**
 * "More flows": the dock fits only a few quick chips, so every flow of the
 * chamber is one menu away. A menu button: Enter, Space or ArrowUp opens it,
 * arrows walk it, Esc closes it back onto the button (never the sheet).
 */
export function FlowMenu({ items, current, on_pick }: {
  items: readonly StewardChip[]; current?: string | undefined; on_pick: (chip: StewardChip) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, [open]);

  function close() { setOpen(false); button.current?.focus(); }
  function walk(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : undefined;
    if (next === undefined || !entries.length) return;
    event.preventDefault();
    entries[(next + entries.length) % entries.length]?.focus();
  }
  return <span className="cc-flow-menu">
    <button ref={button} type="button" className="cc-btn cc-btn--quiet cc-flow-menu__button" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      More flows<span className="cc-flow-menu__caret" aria-hidden="true" /></button>
    {open && <div id={id} ref={menu} role="menu" aria-label="Every Steward flow in this chamber" className="cc-flow-menu__list" onKeyDown={walk}
      onBlur={event => {
        const target = event.relatedTarget;
        if (!(target instanceof Node) || (!event.currentTarget.contains(target) && target !== button.current)) setOpen(false);
      }}>
      {items.map(item => <button key={key(item)} type="button" role="menuitem" tabIndex={-1} className="cc-flow-menu__item"
        onClick={() => { setOpen(false); on_pick(item); }}>
        <span>{item.label}</span>
        {current === key(item) && <span className="cc-flow-menu__tag">in progress</span>}
        {item.action.kind === 'demo' && <span className="cc-flow-menu__tag">simulated</span>}
      </button>)}
    </div>}
  </span>;
}

export { key as chipKey };
