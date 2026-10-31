import type { CSSProperties } from 'react';
import './entrance.css';

export type EntranceStyle = CSSProperties & { '--cc-entrance-index': number };

/** Supply the panel's position; CSS owns timings and reduced-motion handling. */
export function entranceStyle(index: number): EntranceStyle {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Entrance index must be a nonnegative safe integer');
  return { '--cc-entrance-index': index };
}
