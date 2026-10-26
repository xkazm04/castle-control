import { useState } from 'react';
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

export type WindowedRowsProps<T> = {
  rows: readonly T[]; label: string; row_key: (row: T) => string; children: (row: T) => ReactNode;
  row_height?: number; scroll_top?: number; empty_state?: ReactNode;
};

/** Fixed token-sized rows and spacers bound DOM work independently of the input size. */
export function WindowedRows<T>({ rows, label, row_key, children, row_height = rowHeight, scroll_top = 0, empty_state }: WindowedRowsProps<T>) {
  const [position, setPosition] = useState(scroll_top);
  const range = rowWindow(rows.length, position, row_height);
  return <div className="cc-window" role="table" aria-label={label} aria-rowcount={rows.length}
    tabIndex={0} onScroll={event => setPosition(event.currentTarget.scrollTop)}>
    <div aria-hidden="true" style={{ height: range.before }} />
    {rows.slice(range.start, range.end).map((row, index) => <div key={row_key(row)} role="row"
      aria-rowindex={range.start + index + 1} className="cc-window-row" style={{ height: row_height }}>
      {children(row)}
    </div>)}
    <div aria-hidden="true" style={{ height: range.after }} />
    {rows.length === 0 && empty_state !== undefined && <p role="status">{empty_state}</p>}
  </div>;
}
