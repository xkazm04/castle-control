import { afterEach, expect, test, vi } from 'vitest';
import { SurfaceTransition, surfaceMotion } from './surface-transition.jsx';

afterEach(() => { vi.unstubAllGlobals(); });

function fixture(reduced: boolean) {
  const incoming_animation: Animation = Object.assign({} as Animation, { cancel: vi.fn(), onfinish: null });
  const outgoing_animation: Animation = Object.assign({} as Animation, { cancel: vi.fn(), onfinish: null });
  const child = { removeAttribute: vi.fn() };
  const copy = { classList: { add: vi.fn() }, setAttribute: vi.fn(), removeAttribute: vi.fn(),
    querySelectorAll: () => [child], style: {}, remove: vi.fn(), animate: vi.fn(() => outgoing_animation) };
  const node = Object.assign({} as HTMLElement, { cloneNode: vi.fn(() => copy),
    getBoundingClientRect: () => ({ left: 14, top: 100, width: 1252, height: 520 }),
    after: vi.fn(), animate: vi.fn(() => incoming_animation) });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => ({
    '--m-enter': '.42s', '--m-exit': '.17s', '--m-settle': '.16s', '--ease-in': 'ease-in',
  })[name] }));
  const props = { surface: 'lottery', children: 'Simulated lot room' };
  const transition = new SurfaceTransition(props);
  transition.surface.current = node;
  const previous = { ...props };
  props.surface = 'moderator'; props.children = 'Simulated Gatehouse';
  return { transition, previous, copy, node, child, incoming_animation, outgoing_animation };
}

test('1 to 2 commits the incoming route synchronously and cross-fades opacity using motion tokens', () => {
  const { transition, previous, node, copy, child, outgoing_animation } = fixture(false);
  const outgoing = transition.getSnapshotBeforeUpdate(previous);
  expect(node.cloneNode).toHaveBeenCalledWith(true);
  expect(transition.render().props['data-surface']).toBe('moderator');
  transition.componentDidUpdate(previous, {}, outgoing);
  expect(node.after).toHaveBeenCalledWith(copy);
  expect(copy.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
  expect(copy).toHaveProperty('inert', true);
  for (const attribute of ['id', 'name', 'role', 'data-role', 'data-room-tile']) expect(child.removeAttribute).toHaveBeenCalledWith(attribute);
  expect(copy.animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.objectContaining({ duration: 170 }));
  expect(node.animate).toHaveBeenCalledWith(surfaceMotion(false).incoming, expect.objectContaining({ duration: 420 }));
  for (const frame of [...surfaceMotion(false).incoming, ...surfaceMotion(false).outgoing]) {
    expect(Object.keys(frame).every(name => name === 'opacity' || name === 'offset')).toBe(true);
  }
  // Completing the old copy never updates or delays the route.
  outgoing_animation.onfinish?.call(outgoing_animation, {} as AnimationPlaybackEvent);
  expect(copy.remove).toHaveBeenCalledOnce();
  expect(transition.render().props.children).toBe('Simulated Gatehouse');
});

test('reduced motion makes no outgoing copy and uses only the short opacity settle', () => {
  const { transition, previous, node, copy } = fixture(true);
  expect(surfaceMotion(true).out_copy).toBe(false);
  const outgoing = transition.getSnapshotBeforeUpdate(previous);
  expect(outgoing).toBeNull(); expect(node.cloneNode).not.toHaveBeenCalled();
  transition.componentDidUpdate(previous, {}, outgoing);
  expect(copy.animate).not.toHaveBeenCalled(); expect(node.after).not.toHaveBeenCalled();
  expect(node.animate).toHaveBeenCalledWith([{ opacity: .4 }, { opacity: 1 }], expect.objectContaining({ duration: 160 }));
});

test('rapid navigation and unmount cancel old animations and remove the previous copy', () => {
  const { transition, previous, copy, incoming_animation, outgoing_animation } = fixture(false);
  transition.componentDidUpdate(previous, {}, transition.getSnapshotBeforeUpdate(previous));
  transition.componentDidUpdate(previous, {}, transition.getSnapshotBeforeUpdate(previous));
  expect(copy.remove).toHaveBeenCalledOnce();
  expect(incoming_animation.cancel).toHaveBeenCalledOnce(); expect(outgoing_animation.cancel).toHaveBeenCalledOnce();
  transition.componentWillUnmount();
  expect(copy.remove).toHaveBeenCalledTimes(2);
  expect(incoming_animation.cancel).toHaveBeenCalledTimes(2); expect(outgoing_animation.cancel).toHaveBeenCalledTimes(2);
});

test('ordinary snapshot updates do not copy or animate the surface', () => {
  const { transition, node } = fixture(false);
  const previous = { surface: 'moderator', children: 'Earlier simulated reading' };
  expect(transition.getSnapshotBeforeUpdate(previous)).toBeNull();
  transition.componentDidUpdate(previous, {}, null);
  expect(node.animate).not.toHaveBeenCalled(); expect(node.cloneNode).not.toHaveBeenCalled();
});
