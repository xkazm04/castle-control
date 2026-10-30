import type { HTMLAttributes, ReactNode } from 'react';
import { printStyle } from './heraldic-options.js';
import type { PrintOptions, PrintStyle } from './heraldic-options.js';
import './heraldic-shadow.css';
import './heraldic-card.css';

export type HeraldicCardProps = Omit<HTMLAttributes<HTMLElement>, 'style'> & PrintOptions & {
  variant?: 'plain' | 'raised' | 'selectable' | 'tablet' | 'panel';
  tone?: 'neutral' | 'seal' | 'bar'; selected?: boolean; current?: boolean; locked?: boolean;
  on_select?: () => void; disabled?: boolean; children?: ReactNode; style?: PrintStyle;
};
export function HeraldicCard({ variant = 'plain', tone = 'neutral', selected, current, locked, on_select, disabled,
  ink, offset, shadow_ink, border_ink, style, className = '', children, ...props }: HeraldicCardProps) {
  const shared = { ...props, className: `cc-card cc-offset-shadow ${className}`, 'data-card': variant,
    'data-tone': tone, 'data-selected': selected, 'data-current': current, 'data-locked': locked,
    style: printStyle({ ink, offset, shadow_ink, border_ink }, style) };
  return on_select ? <button {...shared} type="button" aria-pressed={selected} disabled={disabled} onClick={on_select}>{children}</button>
    : <article {...shared}>{children}</article>;
}
export function CardHead({ title, gloss }: { title: string; gloss?: string }) {
  return <header className="cc-card-head"><h2>{title}</h2>{gloss && <span>{gloss}</span>}</header>;
}
export function CardBody({ children }: { children: ReactNode }) {
  return <div className="cc-card-body">{children}</div>;
}
export function CardCopy({ title, meta, reasons = [] }: { title: string; meta?: string; reasons?: readonly string[] }) {
  return <span className="cc-card-copy"><b className="cc-card-title">{title}</b>
    {meta && <span className="cc-card-meta">{meta}</span>}
    {reasons.map(reason => <span className="cc-card-reason" key={reason}>{reason}</span>)}</span>;
}
export function CardSide({ children, action }: { children: ReactNode; action?: string }) {
  return <span className="cc-card-side">{children}{action && <span className="cc-card-action">{action}</span>}</span>;
}
