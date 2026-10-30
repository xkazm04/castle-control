import type { CSSProperties } from 'react';
import type { tokens } from '@castle-control/tokens';

export type PrintInk = 'gules' | 'azure' | 'or' | 'key' | 'ink' | 'ink-2' | 'paper' | 'paper-2' |
  'card' | 'press' | 'cream' | 'rule' | 'line' | 'hair' | 'hair-2' | 'muted' | 'ok' | 'warn' | 'danger' |
  'gules-text' | 'azure-text' | 'or-text';
export type PrintSize = Extract<keyof typeof tokens.layout, `space-${string}` | `text-${string}` | `rule-${string}` | 'title-ghost' | 'wordmark-ghost' | 'button-h' | 'row-h'>;
export type PrintStyle = CSSProperties & { [key: `--cc-${string}`]: string | number | undefined };
export type PrintOptions = {
  ink?: PrintInk | undefined; offset?: PrintSize | undefined; shadow_ink?: PrintInk | undefined; border_ink?: PrintInk | undefined;
};

/** Local custom properties reference generated tokens; no palette or sizing literals. */
export function printStyle({ ink, offset, shadow_ink, border_ink }: PrintOptions, style?: PrintStyle): PrintStyle {
  return {
    ...(ink ? { '--cc-ink': `var(--${ink})` } : {}),
    ...(offset ? { '--cc-shadow-offset': `var(--${offset})` } : {}),
    ...(shadow_ink ? { '--cc-shadow-ink': `var(--${shadow_ink})` } : {}),
    ...(border_ink ? { '--cc-border-ink': `var(--${border_ink})` } : {}),
    ...style,
  };
}
