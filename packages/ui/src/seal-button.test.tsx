import type { KeyboardEvent, PointerEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { keymap } from './shell.jsx';
import { createSealHold, SealButton, SealControl, sealHoldDurationMs } from './seal-button.jsx';

afterEach(() => { vi.useRealTimers(); });
const pointer = () => Object.assign({} as PointerEvent<HTMLButtonElement>, {
  button: 0, pointerId: 1, currentTarget: { focus: vi.fn(), setPointerCapture: vi.fn() },
});
const space = (repeat = false) => Object.assign({} as KeyboardEvent<HTMLButtonElement>, {
  key: keymap.find(binding => binding.action === 'seal')?.key,
  repeat, preventDefault: vi.fn(), nativeEvent: { isComposing: false },
});

test('SealButton renders both labels and visible progress, with no click-to-seal path', () => {
  for (const variant of ['seal', 'proclaim'] as const) {
    const html = renderToStaticMarkup(<SealButton variant={variant} on_seal={() => undefined} />);
    expect(html).toContain(variant === 'proclaim' ? 'Hold to seal and proclaim' : 'Hold to seal');
    expect(html).toContain('<progress');
    expect(html).toContain('value="0"');
  }
});

test('real pointer handlers cancel an early release and seal exactly once after a continuous full hold', () => {
  vi.useFakeTimers();
  const seal = vi.fn(); const progress = vi.fn();
  const hold = createSealHold(seal, progress);
  const button = SealControl({ hold, progress: 0 });
  expect(button.props.onClick).toBeUndefined();
  button.props.onPointerDown(pointer());
  vi.advanceTimersByTime(sealHoldDurationMs / 2);
  expect(progress.mock.lastCall?.[0]).toBeGreaterThan(0);
  button.props.onPointerUp();
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(0);
  button.props.onPointerDown(pointer());
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(progress).toHaveBeenLastCalledWith(1);
  expect(seal).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(sealHoldDurationMs * 3);
  expect(seal).toHaveBeenCalledOnce();
  button.props.onPointerUp();
});

test('Space must stay held; repeat, Enter, disabled, blur and lost capture never bypass the hold', () => {
  vi.useFakeTimers();
  const seal = vi.fn(); const hold = createSealHold(seal, () => undefined);
  const button = SealControl({ hold, progress: 0 });
  button.props.onKeyDown({ ...space(), key: 'Enter' });
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).not.toHaveBeenCalled();
  for (const cancel of [button.props.onBlur,
    button.props.onPointerCancel, button.props.onPointerLeave, button.props.onLostPointerCapture]) {
    button.props.onPointerDown(pointer());
    vi.advanceTimersByTime(sealHoldDurationMs / 2);
    cancel();
    vi.advanceTimersByTime(sealHoldDurationMs);
    expect(seal).not.toHaveBeenCalled();
  }
  button.props.onKeyDown(space());
  vi.advanceTimersByTime(sealHoldDurationMs / 2);
  button.props.onKeyUp(space());
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).not.toHaveBeenCalled();
  button.props.onKeyDown(space());
  button.props.onKeyDown(space(true));
  vi.advanceTimersByTime(sealHoldDurationMs);
  button.props.onKeyDown(space(true));
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).toHaveBeenCalledOnce();
  hold.cancel();
  const disabled = SealControl({ hold, progress: 0, disabled: true });
  disabled.props.onPointerDown(pointer()); disabled.props.onKeyDown(space());
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).toHaveBeenCalledOnce();
});
