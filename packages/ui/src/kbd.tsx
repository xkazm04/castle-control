import type { ComponentPropsWithoutRef } from 'react';
import './kbd.css';

export type KbdProps = ComponentPropsWithoutRef<'kbd'>;

/** One readable keycap for the shell, its navigation and the kit. */
export function Kbd({ className = '', ...props }: KbdProps) {
  return <kbd {...props} className={`cc-kbd${className ? ` ${className}` : ''}`} />;
}
