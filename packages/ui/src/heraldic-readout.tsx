import type { ReactNode } from 'react';
import { printStyle } from './heraldic-options.js';
import type { PrintInk, PrintSize, PrintStyle } from './heraldic-options.js';
import './heraldic-readout.css';

export type HeroReadoutProps = {
  value: string; caption: string; unit?: string; ink?: PrintInk; figure_size?: PrintSize;
  scale?: 'display' | 'viewport' | 'numeric'; ghost?: 'shadow' | 'overprint' | 'none'; style?: PrintStyle;
  caption_style?: 'serif' | 'label';
  as?: 'div' | 'span';
};
export function HeroReadout({ value, caption, unit, ink, figure_size, scale = 'display', ghost = 'shadow', caption_style = 'serif', as: Element = 'div', style }: HeroReadoutProps) {
  return <Element className="cc-hero-readout" data-scale={scale} data-ghost={ghost} data-caption={caption_style}
    style={printStyle({ ink }, { ...(figure_size ? { '--cc-figure-size': `var(--${figure_size})` } : {}), ...style })}>
    <b className="cc-hero-figure" data-text={value}>{value}{unit && <small>{unit}</small>}</b>
    <span className="cc-hero-caption">{caption}</span>
  </Element>;
}
export function MedalList({ children }: { children: ReactNode }) {
  return <ul className="cc-medals">{children}</ul>;
}
export function Medal({ value, label, detail, ink }: { value: ReactNode; label: string; detail?: string; ink?: PrintInk }) {
  return <li className="cc-medal" style={printStyle({ ink })}><span className="cc-medal-disc">{value}</span>
    <span className="cc-medal-copy"><b>{label}</b>{detail && <span>{detail}</span>}</span></li>;
}
export type NumberedDisc = { id: string; title: string; description: string };
export function NumberedDiscs({ items }: { items: readonly NumberedDisc[] }) {
  return <ol className="cc-numbered-discs">{items.map(item => <li key={item.id}><b>{item.title}</b><span>{item.description}</span></li>)}</ol>;
}
