import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Theme } from '@castle-control/tokens';
import './primitives.css';

export type ModuleId = 'lottery' | 'moderator' | 'visuals' | 'studio';

export function ThemeFrame({ theme, module = 'moderator', children }: {
  theme: Theme; module?: ModuleId; children: ReactNode;
}) {
  return <div className="cc-frame" data-theme={theme} data-module={module}>{children}</div>;
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

export type ButtonVariant = 'outline' | 'primary' | 'plate' | 'ghost' | 'danger';
export type InkButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'normal' | 'small' | 'icon';
};

export function InkButton({ variant = 'outline', size = 'normal', className = '', ...props }: InkButtonProps) {
  return <button {...props} type={props.type ?? 'button'} className={`cc-button ${className}`} data-variant={variant} data-size={size} />;
}

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <InkButton size="icon" aria-label="Toggle paper and dark stock" title="Paper / dark stock"
    aria-pressed={theme === 'stock'} onClick={() => onChange(theme === 'stock' ? 'paper' : 'stock')}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2a8 8 0 1 0 0 16V2Zm0 0a8 8 0 0 1 0 16" /></svg>
  </InkButton>;
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="cc-empty" role="status">
    <Mark label="An empty castle gate" /><b>{title}</b><p>{description}</p>{children}
  </div>;
}
