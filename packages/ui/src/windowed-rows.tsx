import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { tokens } from '@castle-control/tokens';
import './windowed-rows.css';

export const rowHeight = Number.parseFloat(tokens.layout['row-h']);
const viewportHeight = Number.parseFloat(tokens.layout['table-window']);
const overscan = 3;
export function rowWindow(total: number, scroll_top: number, row_height = rowHeight) {
  const count = Math.ceil(viewportHeight / row_height) + overscan * 2;
  const start = Math.max(0, Math.min(Math.floor(scroll_top / row_height) - overscan, total - count));
  const end = Math.min(total, start + count);
  return { start, end, before: start * row_height, after: (total - end) * row_height };
}

/** Scroll offset that puts a row in the middle of the window, never before the first row. */
export function revealTop(index: number, row_height = rowHeight, viewport = viewportHeight) {
  return Math.max(0, index * row_height - (viewport - row_height) / 2);
}

export type WindowedRowsProps<T> = {
  rows: readonly T[]; label: string; row_key: (row: T) => string; children: (row: T) => ReactNode;
  row_height?: number; scroll_top?: number; empty_state?: ReactNode;
  /** A new object scrolls the row with this key to the middle of the window, once. */
  reveal?: { readonly key: string } | undefined;
};

/** Owns row and cell semantics; children supply content inside the full-height cell. */
export function WindowedRows<T>({ rows, label, row_key, children, row_height = rowHeight, scroll_top = 0, empty_state, reveal }: WindowedRowsProps<T>) {
  const [position, setPosition] = useState(scroll_top);
  const box = useRef<HTMLDivElement>(null);
  // Keyed on the request alone: later row changes must not drag a reader back.
  useEffect(() => {
    const index = reveal ? rows.findIndex(row => row_key(row) === reveal.key) : -1;
    if (index < 0 || !box.current) return;
    const top = revealTop(index, row_height);
    box.current.scrollTop = top;
    setPosition(top);
  }, [reveal]);
  const range = rowWindow(rows.length, position, row_height);
  return <div ref={box} className="cc-window" role="table" aria-label={label} aria-rowcount={rows.length}
    tabIndex={0} onScroll={event => setPosition(event.currentTarget.scrollTop)}>
    <div aria-hidden="true" style={{ height: range.before }} />
    {rows.slice(range.start, range.end).map((row, index) => <div key={row_key(row)} role="row"
      aria-rowindex={range.start + index + 1} className="cc-window-row" style={{ height: row_height }}>
      <div role="cell" className="cc-window-cell">{children(row)}</div>
    </div>)}
    <div aria-hidden="true" style={{ height: range.after }} />
    {rows.length === 0 && empty_state !== undefined && <p role="status">{empty_state}</p>}
  </div>;
}
