import type { ReactNode } from 'react';

export type NoticeTone = 'polite' | 'alert';
export type NoticeProps = {
  message?: ReactNode;
  tone?: NoticeTone;
  label?: string;
  className?: string;
};

export function outcomeTone(outcome: { ok: boolean }): NoticeTone {
  return outcome.ok ? 'polite' : 'alert';
}

// Keep both regions mounted so updates change text rather than roles or nodes.
export function Notice({ message, tone = 'polite', label, className = '' }: NoticeProps) {
  const classes = `cc-notice-region ${className}`.trim();
  return <>
    <p className={classes} role="status" aria-live="polite" aria-atomic="true" aria-label={label}>
      {tone === 'polite' ? message : undefined}
    </p>
    <p className={classes} role="alert" aria-label={label}>
      {tone === 'alert' ? message : undefined}
    </p>
  </>;
}
