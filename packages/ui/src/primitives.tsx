import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Theme } from '@castle-control/tokens';
import { printStyle } from './heraldic-options.js';
import type { PrintOptions, PrintStyle } from './heraldic-options.js';
import { InkEdgeFilter } from './stamp/stamp.jsx';
import './primitives.css';

export type ModuleId = 'lottery' | 'moderator' | 'visuals' | 'studio';

export function ThemeFrame({ theme, module = 'moderator', children }: {
  theme: Theme; module?: ModuleId; children: ReactNode;
}) {
  return <div className="cc-frame" data-theme={theme} data-module={module}><InkEdgeFilter />{children}</div>;
}

export function Mark({ label = 'Castle Control mark: a chat bubble topped with battlements, its gate lit' }: { label?: string }) {
  // Reconstructed vector design, not the prototype's string/DOM implementation.
  const wall = 'M6 6h9v7h8V6h9v7h8V6h9v7h8V6h9v42a4 4 0 0 1-4 4H27l-12 10V52h-5a4 4 0 0 1-4-4Z';
  const gate = 'M28 52V39a8 8 0 0 1 16 0V52Z';
  return <svg className="cc-mark" viewBox="0 0 72 64" role="img" aria-label={label}>
    <path d={wall + gate} fill="var(--gules)" fillRule="evenodd" />
    <path d={gate} transform="translate(1.6 -1.4)" fill="var(--or)" className="cc-mark-gate" />
  </svg>;
}

export type ButtonVariant = 'outline' | 'primary' | 'plate' | 'ghost' | 'danger' | 'offset' | 'pass' | 'bar' | 'shield';
export type InkButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & PrintOptions & {
  variant?: ButtonVariant; size?: 'normal' | 'small' | 'icon' | 'room' | 'big' | 'wrap'; style?: PrintStyle;
};

export function InkButton({ variant = 'outline', size = 'normal', className = '', ink, offset, shadow_ink, border_ink, style, ...props }: InkButtonProps) {
  const heraldic = ['room', 'big', 'wrap'].includes(size) || ['offset', 'pass', 'bar', 'shield'].includes(variant);
  const classes = heraldic ? `cc-button cc-heraldic-button${variant === 'offset' ? ' cc-offset-shadow' : ''} ${className}` : `cc-button ${className}`;
  const print = ink || offset || shadow_ink || border_ink || style ? printStyle({ ink, offset, shadow_ink, border_ink }, style) : undefined;
  return <button {...props} type={props.type ?? 'button'} className={classes} data-variant={variant} data-size={size} style={print} />;
}

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <InkButton size="icon" aria-label="Toggle day and night" title="Day / night"
    aria-pressed={theme === 'night'} onClick={() => onChange(theme === 'night' ? 'day' : 'night')}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2a8 8 0 1 0 0 16V2Zm0 0a8 8 0 0 1 0 16" /></svg>
  </InkButton>;
}

/**
 * The one empty state: a leaded arch glyph, a title, one line of explanation and an optional action.
 * Every chamber, fixture and core mode, uses this and nothing else for "nothing here yet".
 * `compact` lays it out in a row for tight places (a table body, a column); `glyph={false}` drops the arch.
 */
export function EmptyState({ title, description, action, children, glyph = true, compact = false, announce = true }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; glyph?: boolean; compact?: boolean;
  /** False where the surrounding view already owns the one live region (the drill's inspector). */
  announce?: boolean;
}) {
  return <div className={`cc-empty${compact ? ' cc-empty--compact' : ''}`} {...(announce ? { role: 'status' } : {})}>
    {glyph && <svg className="cc-empty__glyph" viewBox="0 0 28 40" aria-hidden="true" focusable="false">
      <path d="M2 39V14C2 7 8 2 14 1c6 1 12 6 12 13v25Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M2 22h24M14 1v38" stroke="currentColor" strokeWidth="1.2" opacity=".7" /></svg>}
    <div className="cc-empty__body">
      <b className="cc-empty__title">{title}</b>
      {description && <p className="cc-empty__text">{description}</p>}
      {(action ?? children) && <div className="cc-empty__action">{action ?? children}</div>}
    </div>
  </div>;
}
