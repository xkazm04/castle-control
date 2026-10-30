import type { ReactNode } from 'react';
import { printStyle } from './heraldic-options.js';
import type { PrintInk, PrintStyle } from './heraldic-options.js';
import './heraldic-heading.css';

export type SectionHeadingProps = {
  title: string; gloss?: string; count?: ReactNode; ink?: PrintInk;
  variant?: 'plain' | 'banner' | 'inline' | 'ruled'; ghost?: boolean;
  level?: 2 | 3; id?: string; style?: PrintStyle;
};
export function SectionHeading({ title, gloss, count, ink, variant = 'plain', ghost = variant === 'banner', level = 3, id, style }: SectionHeadingProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  if (variant === 'banner') return <div className="cc-section-heading" data-heading={variant} data-ghost={ghost} style={printStyle({ ink }, style)}>
    <div><Heading id={id} data-text={title}>{title}</Heading>{gloss && <p className="cc-section-gloss">{gloss}</p>}</div>
    {count !== undefined && <span className="cc-section-count">{count}</span>}
  </div>;
  return <div className="cc-section-heading" data-heading={variant} data-ghost={ghost} style={printStyle({ ink }, style)}>
    <Heading id={id} data-text={title}>{title}</Heading>{gloss && <span className="cc-section-gloss">{gloss}</span>}
    {count !== undefined && <span className="cc-section-count">{count}</span>}
  </div>;
}
