import type { KeyboardEvent, PointerEvent } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { keymap } from './shell.jsx';
import { createSealHold, SealButton, SealControl, sealHoldDurationMs } from './seal-button.jsx';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
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

test('each seal describes its visible hold instruction, keymap hint and initially quiet live line', () => {
  // Exercise the client snapshot while React's server dispatcher supplies hooks.
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot());
  const html = renderToStaticMarkup(<><SealButton on_seal={() => undefined} />
    <SealButton variant="proclaim" on_seal={() => undefined} /></>);
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  expect(buttons).toHaveLength(2);
  const all_ids: string[] = [];
  for (const button of buttons) {
    const ids = button.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];
    expect(ids).toHaveLength(2);
    const [instruction_id, release_id] = ids;
    const instruction = button.match(/<span[^>]*class="cc-seal-instruction"[^>]*>[\s\S]*?<\/span>/)?.[0] ?? '';
    expect(instruction).toContain(`id="${instruction_id}"`);
    expect(instruction).toContain('Press and hold');
    expect(instruction).toContain('for 1 second');
    expect(instruction).not.toContain('Hold to seal');
    const seal_key = keymap.find(binding => binding.action === 'seal')?.key;
    expect(instruction).toContain(`<kbd>${seal_key === ' ' ? 'Space' : seal_key}</kbd>`);
    expect(instruction).not.toMatch(/hidden|display:\s*none/);
    expect(button).toContain(`id="${release_id}"`);
    expect(button).toMatch(/aria-live="polite"[^>]*><\/span>/);
    expect(button).not.toContain('Released, not sealed');
    all_ids.push(...ids);
  }
  expect(new Set(all_ids).size).toBe(4);
});

test('static slot markup stays composable independently of the surrounding React tree', () => {
  const slot = <SealButton on_seal={() => undefined} />;
  expect(renderToStaticMarkup(<section><div /><aside>{slot}</aside></section>)).toContain(renderToStaticMarkup(slot));
});

function feedbackControl() {
  let released = false;
  const seal = vi.fn();
  const feedback = vi.fn((value: boolean) => { released = value; });
  const hold = createSealHold(seal, () => undefined, feedback);
  const control = () => SealControl({ hold, progress: 0, released, description_id: 'test-seal' });
  const live = () => renderToStaticMarkup(control()).match(/aria-live="polite"[^>]*>(.*?)<\/span>/)?.[1];
  return { seal, feedback, hold, control, live };
}

test.each(['pointer', 'keyboard'] as const)('early %s release reports cancellation and the next hold clears it', input => {
  vi.useFakeTimers();
  const { seal, feedback, control, live } = feedbackControl();
  const start = () => input === 'pointer' ? control().props.onPointerDown(pointer()) : control().props.onKeyDown(space());
  const release = () => input === 'pointer' ? control().props.onPointerUp() : control().props.onKeyUp(space());
  expect(live()).toBe('');
  expect(feedback).not.toHaveBeenCalled();
  start();
  vi.advanceTimersByTime(sealHoldDurationMs / 2);
  release();
  expect(live()).toBe('Released, not sealed');
  control().props.onLostPointerCapture();
  control().props.onBlur();
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(live()).toBe('Released, not sealed');
  expect(seal).not.toHaveBeenCalled();
  start();
  expect(live()).toBe('');
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(seal).toHaveBeenCalledOnce();
  expect(live()).toBe('');
  release();
  control().props.onBlur();
  expect(live()).toBe('');
  expect(feedback.mock.calls.filter(([value]) => value)).toHaveLength(1);
});

test('idle cancellation, Enter and repeat stay quiet; blur and lost capture cancel only an unfinished hold', () => {
  vi.useFakeTimers();
  const { seal, feedback, hold, control, live } = feedbackControl();
  hold.cancel();
  control().props.onKeyDown({ ...space(), key: 'Enter' });
  control().props.onKeyDown(space(true));
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(feedback).not.toHaveBeenCalled();
  expect(live()).toBe('');
  for (const cancel of [() => control().props.onBlur(), () => control().props.onLostPointerCapture(), () => hold.cancel()]) {
    control().props.onPointerDown(pointer());
    control().props.onKeyUp(space());
    expect(live()).toBe('');
    vi.advanceTimersByTime(sealHoldDurationMs / 2);
    cancel();
    expect(live()).toBe('Released, not sealed');
    vi.advanceTimersByTime(sealHoldDurationMs);
    expect(seal).not.toHaveBeenCalled();
  }
});

test.each(['pointer', 'keyboard'] as const)('%s seals exactly at 1000 ms, once, with the feedback handlers attached', input => {
  vi.useFakeTimers();
  const { seal, control, live } = feedbackControl();
  const start = () => input === 'pointer' ? control().props.onPointerDown(pointer()) : control().props.onKeyDown(space());
  const release = () => input === 'pointer' ? control().props.onPointerUp() : control().props.onKeyUp(space());
  expect(sealHoldDurationMs).toBe(1000);
  start();
  vi.advanceTimersByTime(999);
  expect(seal).not.toHaveBeenCalled();
  release();
  expect(live()).toBe('Released, not sealed');
  vi.advanceTimersByTime(1000);
  expect(seal).not.toHaveBeenCalled();
  start();
  vi.advanceTimersByTime(999);
  expect(seal).not.toHaveBeenCalled();
  // A release from the other input cannot shorten or cancel this hold.
  if (input === 'pointer') control().props.onKeyUp(space());
  else control().props.onPointerUp();
  control().props.onKeyDown(space(true));
  vi.advanceTimersByTime(1);
  expect(seal).toHaveBeenCalledOnce();
  expect(live()).toBe('');
  vi.advanceTimersByTime(1000);
  expect(seal).toHaveBeenCalledOnce();
  release();
  expect(live()).toBe('');
});
