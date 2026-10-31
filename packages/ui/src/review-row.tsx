import type { ReactNode } from 'react';
import './review-row.css';

export type ReviewRowProps = {
  heading?: ReactNode; quote?: ReactNode; detail?: ReactNode; actions?: ReactNode; children?: ReactNode;
};

export function ReviewRow({ heading, quote, detail, actions, children }: ReviewRowProps) {
  return <div className="cc-review-row">
    {heading !== undefined && <div>{heading}</div>}
    {quote !== undefined && <blockquote tabIndex={0}>{quote}</blockquote>}
    {detail !== undefined && <span>{detail}</span>}
    {children}
    {actions !== undefined && <div className="cc-review-actions">{actions}</div>}
  </div>;
}
