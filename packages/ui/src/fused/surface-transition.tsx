import { Component, createRef } from 'react';
import type { ReactNode } from 'react';

type Props = { surface: string; children: ReactNode };
type Outgoing = { node: HTMLElement; bounds: DOMRect };

/** Opacity only. The incoming route commits immediately; the copy has no React
 * tree, handlers, focus targets or subscriptions. No product state is replayed. */
export function surfaceMotion(reduced: boolean) {
  return {
    out_copy: !reduced,
    incoming: reduced ? [{ opacity: .4 }, { opacity: 1 }]
      : [{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }],
    outgoing: [{ opacity: 1 }, { opacity: 0 }],
    duration: reduced ? '--m-settle' : '--m-enter',
  };
}

function duration(style: CSSStyleDeclaration, token: string) {
  const value = style.getPropertyValue(token).trim();
  return Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
}

export class SurfaceTransition extends Component<Props> {
  readonly surface = createRef<HTMLElement>();
  private outgoing: HTMLElement | undefined;
  private animations: Animation[] = [];

  getSnapshotBeforeUpdate(previous: Props): Outgoing | null {
    const node = this.surface.current;
    if (previous.surface === this.props.surface || !node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    return { node: node.cloneNode(true) as HTMLElement, bounds: node.getBoundingClientRect() };
  }

  componentDidUpdate(previous: Props, _state: Readonly<object>, outgoing: Outgoing | null) {
    if (previous.surface === this.props.surface) return;
    this.clear();
    const node = this.surface.current;
    if (!node || typeof node.animate !== 'function') return;
    const motion = surfaceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const style = getComputedStyle(node);
    if (outgoing && motion.out_copy) {
      const copy = outgoing.node;
      copy.classList.add('cc-surface-out');
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      // Duplicate IDs, roles and form names must never enter the live document.
      for (const element of [copy, ...copy.querySelectorAll('*')]) {
        for (const attribute of ['id', 'name', 'role', 'data-role', 'data-room-tile', 'data-proposal-focused']) element.removeAttribute(attribute);
      }
      const { left, top, width, height } = outgoing.bounds;
      Object.assign(copy.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      node.after(copy);
      this.outgoing = copy;
      const animation = copy.animate(motion.outgoing, { duration: duration(style, '--m-exit'), easing: style.getPropertyValue('--ease-in').trim(), fill: 'forwards' });
      animation.onfinish = () => { copy.remove(); if (this.outgoing === copy) this.outgoing = undefined; };
      this.animations.push(animation);
    }
    this.animations.push(node.animate(motion.incoming, { duration: duration(style, motion.duration), easing: 'ease-out' }));
  }

  componentWillUnmount() { this.clear(); }

  private clear() {
    for (const animation of this.animations) { animation.onfinish = null; animation.cancel(); }
    this.animations = [];
    this.outgoing?.remove();
    this.outgoing = undefined;
  }

  render() {
    const { surface, children } = this.props;
    const module = ['keep', 'lottery', 'moderator', 'visuals', 'studio'].includes(surface) ? surface : undefined;
    return <main ref={this.surface} className="desktop-surface" data-surface={surface} data-module={module}>{children}</main>;
  }
}
