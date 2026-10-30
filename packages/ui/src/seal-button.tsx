import { useEffect, useMemo, useRef, useState } from 'react';
import { keymap } from './shell.jsx';
import './seal-button.css';
import './heraldic-shadow.css';

export const sealHoldDurationMs = 1000;
const progressIntervalMs = 16;
const sealKey = keymap.find(binding => binding.action === 'seal')?.key;
export type SealButtonProps = {
  on_seal: () => void;
  variant?: 'seal' | 'proclaim';
  disabled?: boolean;
  size?: 'normal' | 'large';
};

/** A release, lost focus/capture, or teardown always cancels unfinished work. */
export function createSealHold(on_seal: () => void, on_progress: (progress: number) => void) {
  let source: 'pointer' | 'keyboard' | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const clear = () => { clearTimeout(deadline); clearInterval(ticker); };
  return {
    start(input: 'pointer' | 'keyboard') {
      if (source) return;
      source = input;
      const started = Date.now();
      on_progress(0);
      ticker = setInterval(() => on_progress(Math.min(1, (Date.now() - started) / sealHoldDurationMs)), progressIntervalMs);
      deadline = setTimeout(() => { clear(); on_progress(1); on_seal(); }, sealHoldDurationMs);
    },
    cancel(input?: 'pointer' | 'keyboard') {
      if (input && source !== input) return;
      clear(); source = undefined; on_progress(0);
    },
  };
}

// Separate rendering lets the real event handlers be exercised without a DOM shim.
export function SealControl({ hold, progress, variant = 'seal', disabled = false, size }: {
  hold: ReturnType<typeof createSealHold>; progress: number; variant?: 'seal' | 'proclaim'; disabled?: boolean; size?: 'normal' | 'large';
}) {
  const label = variant === 'proclaim' ? 'Hold to seal and proclaim' : 'Hold to seal';
  return <button type="button" className={size === 'large' ? 'cc-seal-button cc-offset-shadow' : 'cc-seal-button'} data-size={size} disabled={disabled} aria-label={label}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      hold.start('pointer');
    }}
    onPointerUp={() => hold.cancel('pointer')} onPointerCancel={() => hold.cancel('pointer')}
    onPointerLeave={() => hold.cancel('pointer')} onLostPointerCapture={() => hold.cancel('pointer')}
    onBlur={() => hold.cancel()}
    onKeyDown={event => {
      if (disabled || event.key !== sealKey || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (!event.repeat) hold.start('keyboard');
    }}
    onKeyUp={event => { if (event.key === sealKey) { event.preventDefault(); hold.cancel('keyboard'); } }}>
    <span>{label}</span>
    <progress aria-label="Seal hold progress" max={1} value={progress} />
  </button>;
}

export function SealButton({ on_seal, variant, disabled, size }: SealButtonProps) {
  const [progress, setProgress] = useState(0);
  const callback = useRef(on_seal);
  callback.current = on_seal;
  const hold = useMemo(() => createSealHold(() => callback.current(), setProgress), []);
  useEffect(() => {
    const cancel = () => hold.cancel();
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); hold.cancel(); };
  }, [hold]);
  useEffect(() => { if (disabled) hold.cancel(); }, [disabled, hold]);
  return <SealControl hold={hold} progress={progress} {...(variant ? { variant } : {})} {...(size ? { size } : {})} {...(disabled === undefined ? {} : { disabled })} />;
}
