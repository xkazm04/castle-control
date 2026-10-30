import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { printStyle } from './heraldic-options.js';
import type { PrintOptions, PrintStyle } from './heraldic-options.js';
import './heraldic-shadow.css';
import './heraldic-plate.css';

type PlateBase = PrintOptions & {
  band?: ReactNode; children?: ReactNode; style?: PrintStyle; className?: string;
  variant?: 'standard' | 'choice' | 'plain';
};
export type PlateProps = PlateBase & (
  | (Omit<HTMLAttributes<HTMLElement>, 'style'> & { selection?: never; as?: 'section' | 'article' | 'div'; selected?: boolean })
  | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & { selection: 'radio'; checked: boolean })
);

export function Plate(props: PlateProps) {
  const { ink, offset, shadow_ink, border_ink, style, className = '', variant = 'standard', band, children, ...rest } = props;
  const shared = { className: `cc-plate cc-offset-shadow ${className}`, 'data-variant': variant,
    style: printStyle({ ink, offset, shadow_ink, border_ink }, style) };
  if (rest.selection === 'radio') {
    const { selection, checked, ...button } = rest;
    return <button {...button} {...shared} type={button.type ?? 'button'} role={selection} aria-checked={checked}
      data-selected={checked}>{band}{children}</button>;
  }
  const { as: Element = 'section', selected, ...attributes } = rest;
  return <Element {...attributes} {...shared} data-selected={selected}>{band}{children}</Element>;
}

export type PlateBandProps = {
  title: string; gloss?: string; count?: ReactNode; count_label?: string;
  variant?: 'standard' | 'chief' | 'hero' | 'bench' | 'seal'; style?: PrintStyle;
};
export function PlateBand({ title, gloss, count, count_label, variant = 'standard', style }: PlateBandProps) {
  // A radio's chief uses phrasing content, so it stays valid inside a button.
  const Element = variant === 'chief' ? 'span' : 'header';
  return <Element className="cc-plate-band" data-band={variant} style={style}>
    {variant === 'standard' ? <h2 className="cc-plate-title">{title}</h2> : <b className="cc-plate-title">{title}</b>}
    {gloss && <span className="cc-plate-gloss">{gloss}</span>}
    {count !== undefined && <span className="cc-plate-count">{count}{count_label && <small>{count_label}</small>}</span>}
  </Element>;
}

export function PlateBody({ children, className = '', style, as: Element = 'div' }: { children: ReactNode; className?: string; style?: PrintStyle; as?: 'div' | 'span' }) {
  return <Element className={`cc-plate-body ${className}`} style={style}>{children}</Element>;
}
export function PlateActions({ children }: { children: ReactNode }) {
  return <div className="cc-plate-actions">{children}</div>;
}
