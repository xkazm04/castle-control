import { printStyle } from './heraldic-options.js';
import type { PrintInk, PrintStyle } from './heraldic-options.js';
import './heraldic-marks.css';

export function Pennant({ word, ink, count, variant = 'flag', style }: {
  word: string; ink?: PrintInk; count?: string; variant?: 'flag' | 'standing'; style?: PrintStyle;
}) {
  if (!word.trim()) throw new Error('A pennant needs its word');
  return <span className="cc-pennant" data-pennant={variant} style={printStyle({ ink }, style)}>
    <i aria-hidden="true" />{count !== undefined && <b>{count}</b>}<span>{word}</span>
  </span>;
}
export function Ribbon({ label, word, note, ink = 'ink', signal = 'ok' }: {
  label: string; word: string; note?: string; ink?: PrintInk; signal?: 'ok' | 'warn' | 'danger';
}) {
  return <div className="cc-ribbon" role="status" style={printStyle({ ink }, { '--cc-signal-ink': `var(--${signal})` })}>
    <span className="cc-ribbon-label">{label}</span><b className="cc-ribbon-word">{word}</b>
    {note && <span className="cc-ribbon-note">{note}</span>}
  </div>;
}
export type ShieldChargeKind = 'question' | 'cup' | 'struck-coin';
export function ShieldCharge({ charge }: { charge: ShieldChargeKind }) {
  return <svg className="cc-shield" viewBox="0 0 40 46" aria-hidden="true">
    <path d="M3 3h34v19c0 11-7 18-17 21C10 40 3 33 3 22Z" />
    {charge === 'question' ? <text x="20" y="29">?</text> : charge === 'cup'
      ? <path className="cc-shield-charge" d="M13 12h14v5a7 7 0 0 1-14 0Zm7 12v6m-5 0h10M13 14h-3a3 3 0 0 0 3 4m14-4h3a3 3 0 0 1-3 4" />
      : <path className="cc-shield-charge" d="M20 13a8 8 0 1 0 0 16a8 8 0 1 0 0-16ZM13 28l14-14" />}
  </svg>;
}
