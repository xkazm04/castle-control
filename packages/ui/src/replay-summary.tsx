import type { ReactNode } from 'react';
import './replay-summary.css';

export type ReplaySummaryItem = { id: string; value: ReactNode; label: ReactNode };

export function ReplaySummary({ items }: { items: readonly ReplaySummaryItem[] }) {
  return <div className="cc-replay-summary">{items.map(item => <div key={item.id}><b>{item.value}</b><span>{item.label}</span></div>)}</div>;
}
