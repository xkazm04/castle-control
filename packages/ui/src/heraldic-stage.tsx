import type { HTMLAttributes, ReactNode } from 'react';
import { printStyle } from './heraldic-options.js';
import type { PrintOptions, PrintStyle } from './heraldic-options.js';
import './heraldic-stage.css';

export type StageFrameProps = Omit<HTMLAttributes<HTMLElement>, 'style'> & PrintOptions & {
  variant?: 'stage' | 'print'; children?: ReactNode; style?: PrintStyle;
};
export function StageFrame({ variant = 'stage', ink, offset, shadow_ink, border_ink, style, children, className = '', ...props }: StageFrameProps) {
  return <figure {...props} className={`cc-stage ${className}`} data-frame={variant}
    style={printStyle({ ink, offset, shadow_ink, border_ink }, style)}>
    {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <i key={corner} className="cc-crop" data-corner={corner} aria-hidden="true" />)}
    {children}
  </figure>;
}
