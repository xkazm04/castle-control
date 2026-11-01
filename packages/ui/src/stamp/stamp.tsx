import { inkEdgeFilter, stampParts } from './table.js';
import type { StampKind } from './table.js';
import './stamp.css';

export type StampProps = { kind: StampKind; word?: string; land?: boolean };

export function Stamp({ kind, word, land = false }: StampProps) {
  const parts = stampParts(kind, word);
  const stamp = <span className={parts.className} data-stamp={parts.dataset.stamp} data-land={land ? '' : undefined}
    role="img" aria-label={parts.ariaLabel}>
    {parts.dot !== 'none' && <i className="cc-stamp-dot" data-dot={parts.dot} aria-hidden="true" />}
    <span aria-hidden="true">{parts.word}</span>
  </span>;
  return land ? <span className="cc-stamp-impression">{stamp}
    <span className="cc-stamp-bleed" data-stamp={parts.dataset.stamp} aria-hidden="true" />
  </span> : stamp;
}

/** Install once per ThemeFrame; individual stamps share this print-edge treatment. */
export function InkEdgeFilter() {
  const { turbulence, displacement, ...region } = inkEdgeFilter;
  return <svg className="cc-inkedge-filter" width="0" height="0" aria-hidden="true" focusable="false">
    <defs><filter {...region}>
      <feTurbulence {...turbulence} />
      <feDisplacementMap {...displacement} />
    </filter></defs>
  </svg>;
}
