import { useState } from 'react';
import type { ReactNode } from 'react';
import { tokens } from '@castle-control/tokens';

export const messageHeight = Number.parseFloat(tokens.layout['row-h']);
const viewportHeight = Number.parseFloat(tokens.layout['table-window']);
const overscan = 3;
export function rowWindow(total: number, scroll_top: number, row_height = messageHeight) {
  const count = Math.ceil(viewportHeight / row_height) + overscan * 2;
  const start = Math.max(0, Math.min(Math.floor(scroll_top / row_height) - overscan, total - count));
  const end = Math.min(total, start + count);
  return { start, end, before: start * row_height, after: (total - end) * row_height };
}

/** Token-sized rows and matching spacer geometry bound DOM work for every growing list. */
export function WindowedRows<T>({ rows, label, row_key, children, row_height = messageHeight, scroll_top = 0 }: {
  rows: readonly T[]; label: string; row_key: (row: T) => string; children: (row: T) => ReactNode;
  row_height?: number; scroll_top?: number;
}) {
  const [position, setPosition] = useState(scroll_top);
  const range = rowWindow(rows.length, position, row_height);
  return <div className="moderation-window" role="table" aria-label={label} aria-rowcount={rows.length}
    tabIndex={0} onScroll={event => setPosition(event.currentTarget.scrollTop)}>
    <div aria-hidden="true" style={{ height: range.before }} />
    {rows.slice(range.start, range.end).map((row, index) => <div key={row_key(row)} role="row"
      aria-rowindex={range.start + index + 1} className="moderation-window-row" style={{ height: row_height }}>
      {children(row)}
    </div>)}
    <div aria-hidden="true" style={{ height: range.after }} />
    {rows.length === 0 && <p role="status">No matching entries.</p>}
  </div>;
}
