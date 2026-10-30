import type { HTMLAttributes, ReactNode } from 'react';
import type { PrintStyle } from './heraldic-options.js';
import './heraldic-feed.css';

export function RuledFeed({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`cc-feed ${className}`}>{children}</div>;
}
export type RuledRowProps = {
  mark?: ReactNode; children: ReactNode; trailing?: ReactNode; detail?: ReactNode; actions?: ReactNode;
  layout?: 'line' | 'amount' | 'entry'; style?: PrintStyle;
};
/** WindowedRows owns role=row and the fixed outer height; this wrapper only lays out its cells. */
export function RuledRow({ mark, children, trailing, detail, actions, layout = 'line', style }: RuledRowProps) {
  return <div className="cc-ruled-row" role="presentation" data-layout={layout} style={style}>
    {mark !== undefined && <span role="cell" className="cc-feed-mark">{mark}</span>}
    <span role="cell" className="cc-feed-text">{children}</span>
    {trailing !== undefined && <span role="cell" className="cc-feed-trailing">{trailing}</span>}
    {detail !== undefined && <span role="cell" className="cc-feed-detail">{detail}</span>}
    {actions !== undefined && <span role="cell" className="cc-feed-actions">{actions}</span>}
  </div>;
}
