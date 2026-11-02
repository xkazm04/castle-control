import { afterEach, expect, it, vi } from 'vitest';
import { parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { applyLayerBindings } from './bindings.ts';
import { OverlayScene } from './overlay.ts';

// Library beacon-03 (effect over the base) and beacon-05 (effect behind it) as plain
// DesignLayer image layers: the existing layer order and intensity bindings carry them.
// Owned DOM surface with simulated data; no browser claim.
class Element {
  readonly tag: string;
  readonly writes = new Map<string, string>();
  style = { setProperty: (key: string, value: string) => { this.writes.set(key, value); } };
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: Element[] = [];
  textContent = '';
  hidden = false;
  constructor(tag: string) { this.tag = tag; }
  after = vi.fn();
  addEventListener = vi.fn();
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  replaceChildren(...children: Element[]) { this.children = children; }
  ownerDocument = { createElement: (tag: string) => new Element(tag) };
}
afterEach(() => { vi.unstubAllGlobals(); });

const hash = 'e'.repeat(64);
// Library core_rect {x:.368,y:.307,w:.264,h:.28} on a 576x768 base.
const core = { x: 212, y: 236, width: 152, height: 215 };
const base = { kind: 'image', asset: 'base.webp', properties: { x: 0, y: 0, width: 576, height: 768, scale: 1, opacity: 1 }, bindings: [] };
// Centre-preserving swell: scale is top-left anchored, so x/y bindings shift by half the growth.
const shift = (start: number, size: number, scale: number) => start + (size * (1 - scale)) / 2;
const effect = { kind: 'image', asset: 'effect.webp', properties: { ...core, scale: 1, opacity: 1 }, bindings: [
  { property: 'opacity', output_range: { at_zero: 0.18, at_one: 1 } },
  { property: 'scale', output_range: { at_zero: 0.8, at_one: 1.6 } },
  { property: 'x', output_range: { at_zero: shift(core.x, core.width, 0.8), at_one: shift(core.x, core.width, 1.6) } },
  { property: 'y', output_range: { at_zero: shift(core.y, core.height, 0.8), at_one: shift(core.y, core.height, 1.6) } },
] };
const snapshot = (layers: unknown[], intensity: number) => parseBeaconsRenderSnapshot(JSON.stringify({
  simulated: true,
  visual: { visual_id: 'simulated-beacon', name: 'Simulated beacon', design_id: 'simulated-art',
    curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
  intensity: { visual_id: 'simulated-beacon', intensity },
  package: { design_id: 'simulated-art', content_hash: hash, layers },
}));

function mount() {
  const root = new Element('main');
  vi.stubGlobal('document', { getElementById: () => root });
  const host = document.getElementById('scene')!;
  return { root, scene: new OverlayScene(host) };
}

it.each([
  ['beacon-03 effect over the base', [base, effect], ['base.webp', 'effect.webp']],
  ['beacon-05 effect behind the base', [effect, base], ['effect.webp', 'base.webp']],
])('%s paints in layer order with the effect bound to intensity', (_name, layers, order) => {
  const { root, scene } = mount();
  scene.apply(snapshot(layers, 0));
  expect(root.children.map(node => node.tag)).toEqual(['img', 'img']);
  expect(root.children.map(node => node.attributes['src'])).toEqual(order.map(file => `/assets/simulated-beacon/${hash}/${file}`));
  const glow = root.children[order.indexOf('effect.webp')];
  const still = root.children[order.indexOf('base.webp')];
  expect(glow?.writes.get('--opacity')).toBe('0.18');
  expect(glow?.writes.get('--scale')).toBe('0.8');
  scene.apply(snapshot(layers, 1));
  expect(glow?.writes.get('--opacity')).toBe('1');
  expect(glow?.writes.get('--scale')).toBe('1.6');
  // The base never moves with intensity, and the package is not rebuilt.
  expect(still?.writes.get('--opacity')).toBe('1');
  expect(still?.writes.get('--scale')).toBe('1');
  expect(root.children[0]?.attributes['src']).toContain(order[0]);
});

it('keeps the swelling effect centred on core_rect across the whole intensity range', () => {
  for (const intensity of [0, 0.25, 0.5, 1]) {
    const bindings = snapshot([effect], 0).package?.layers[0]?.bindings ?? [];
    expect(bindings).toHaveLength(4);
    const p = applyLayerBindings(effect.properties, bindings, intensity);
    expect(p.x + (p.width * p.scale) / 2).toBeCloseTo(core.x + core.width / 2);
    expect(p.y + (p.height * p.scale) / 2).toBeCloseTo(core.y + core.height / 2);
  }
});
