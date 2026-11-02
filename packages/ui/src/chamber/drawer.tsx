import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import './drawer.css';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
};

/** Nonmodal detail layer. The shell owns Escape ordering and the open state. */
export function Drawer({ open, onClose, title, description, children }: DrawerProps) {
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    close.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  return <aside className="cc-chamber-drawer" role="dialog" aria-labelledby={`${id}-title`}
    aria-describedby={description ? `${id}-description` : undefined}>
    <header className="cc-chamber-drawer-heading">
      <div>{description && <p id={`${id}-description`}>{description}</p>}
        <h2 id={`${id}-title`}>{title}</h2></div>
      <button ref={close} type="button" onClick={onClose} aria-label={`Close ${title}`}>Close</button>
    </header>
    <div className="cc-chamber-drawer-body">{children}</div>
  </aside>;
}
