import type { ReactNode } from 'react';
import type { Side } from '@castle-control/duel';

/** Shared frame for all three modes, including their boards and champion. */
export function Arena({ children, live = false, verdict = null, with_hill = false }: {
  children: ReactNode; live?: boolean; verdict?: Side | null; with_hill?: boolean;
}) {
  return <div className={`ty-arena${with_hill ? ' ty-with-hill' : ''}`} data-role="ty-arena"
    data-live={live ? '1' : '0'} data-verdict={verdict ?? -1}>
    <div className="ty-barrier" aria-hidden="true" />
    <div className="ty-cone ty-l" aria-hidden="true"><i /></div>
    <div className="ty-cone ty-r" aria-hidden="true"><i /></div>
    {children}
  </div>;
}
