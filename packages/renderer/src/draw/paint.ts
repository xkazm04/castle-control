import type { DrawPlaybackState, DrawScene } from './model.ts';

/** Stable DOM: only append newly revealed winners. Foreground text never moves. */
export function paintDraw(root: HTMLElement, scene: DrawScene) {
  const doc = root.ownerDocument;
  const plate = doc.createElement('section');
  plate.className = 'draw-scene';
  const badge = doc.createElement('p');
  badge.className = 'simulated';
  badge.textContent = 'SIMULATED';
  badge.hidden = root.dataset['simulated'] !== 'true';
  plate.append(badge);
  const animations: Animation[] = [];
  for (const layer of scene.layers) {
    if (layer.kind === 'artwork') {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', layer.view_box);
      svg.setAttribute('aria-label', `${layer.shape} draw artwork`);
      svg.classList.add('draw-artwork');
      const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.style.transformOrigin = 'center';
      group.style.transformBox = 'fill-box';
      for (const path of layer.paths) {
        const node = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.setAttribute('d', path.d);
        node.setAttribute('fill', `var(--${path.ink})`);
        group.append(node);
      }
      svg.append(group);
      plate.append(svg);
      for (const motion of scene.motions) {
        const transform = (n: number): string => motion.property === 'rotate_deg' ? `rotate(${n}deg)`
          : motion.property === 'scale_x' ? `scaleX(${n})` : `translateY(${n}%)`;
        if (group.animate) animations.push(group.animate(
          [{ transform: transform(motion.from) }, { transform: transform(motion.to) }],
          { duration: motion.duration_ms, delay: motion.at_ms, easing: motion.easing },
        ));
      }
    } else {
      const text = doc.createElement(layer.kind === 'disclaimer' ? 'footer' : 'header');
      text.className = layer.kind === 'disclaimer' ? 'draw-disclaimer' : 'draw-label';
      text.textContent = layer.kind === 'disclaimer' ? `${layer.text} · ${layer.cast_label}` : layer.text;
      plate.append(text);
    }
  }
  const winners = doc.createElement('ol');
  winners.className = 'draw-winners';
  winners.setAttribute('aria-label', 'Winners in cast order');
  plate.append(winners);
  root.append(plate);
  let count = 0;
  return {
    update(state: DrawPlaybackState): void {
      for (const winner of state.revealed_winners.slice(count)) {
        const item = doc.createElement('li');
        item.textContent = winner;
        item.dataset['drawWinner'] = '';
        winners.append(item);
      }
      count = state.revealed_winners.length;
    },
    dispose(): void { animations.forEach((animation) => animation.cancel()); plate.remove(); },
  };
}
