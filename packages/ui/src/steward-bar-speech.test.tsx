import { expect, test, vi } from 'vitest';
import { StewardBar } from './steward-bar.jsx';

function speechButton() {
  const start = vi.fn(); const end = vi.fn();
  const tree = StewardBar({ message: '', value: '', suggestions: [], on_change: vi.fn(), on_tell: vi.fn(), on_suggest: vi.fn(),
    on_speak_start: start, on_speak_end: end });
  const button = tree.props.children[1].props.children[1].props.children[1];
  const element = { dataset: {} as Record<string, string>, setPointerCapture: vi.fn() };
  const event = (extra: object = {}) => ({ currentTarget: element, pointerId: 7, key: '', repeat: false, preventDefault: vi.fn(), ...extra });
  return { start, end, props: button.props, element, event };
}

test('hold to speak captures the pointer and ends once when released anywhere', () => {
  const { start, end, props, element, event } = speechButton();
  props.onPointerDown(event());
  expect(element.setPointerCapture).toHaveBeenCalledWith(7);
  expect(start).toHaveBeenCalledOnce();
  // Captured release outside the button still reaches this button, then the capture is lost.
  props.onPointerUp(event());
  props.onLostPointerCapture(event());
  props.onBlur(event());
  expect(end).toHaveBeenCalledOnce();
});

test('capture lost without a pointerup still ends the hold', () => {
  const { end, props, event } = speechButton();
  props.onPointerDown(event());
  props.onLostPointerCapture(event());
  expect(end).toHaveBeenCalledOnce();
});

test.each([' ', 'Enter'])('holding the %s key speaks: repeat is ignored and release ends once', key => {
  const { start, end, props, event } = speechButton();
  const down = event({ key });
  props.onKeyDown(down);
  props.onKeyDown(event({ key, repeat: true }));
  expect(down.preventDefault).toHaveBeenCalled();
  expect(start).toHaveBeenCalledOnce();
  props.onKeyUp(event({ key }));
  props.onKeyUp(event({ key }));
  expect(end).toHaveBeenCalledOnce();
});

test('other keys and an unheld blur do not speak or end', () => {
  const { start, end, props, event } = speechButton();
  props.onKeyDown(event({ key: 'a' }));
  props.onBlur(event());
  expect(start).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});
