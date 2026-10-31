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
/** WindowedRows owns row/cell semantics and height; this wrapper only lays out content. */
export function RuledRow({ mark, children, trailing, detail, actions, layout = 'line', style }: RuledRowProps) {
  return <div className="cc-ruled-row" role="presentation" data-layout={layout} style={style}>
    {mark !== undefined && <span className="cc-feed-mark">{mark}</span>}
    <span className="cc-feed-text">{children}</span>
    {trailing !== undefined && <span className="cc-feed-trailing">{trailing}</span>}
    {detail !== undefined && <span className="cc-feed-detail">{detail}</span>}
    {actions !== undefined && <span className="cc-feed-actions">{actions}</span>}
  </div>;
}
