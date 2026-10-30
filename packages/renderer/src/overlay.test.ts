import { expect, it, vi } from 'vitest';
import { parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { OverlayScene, receiveSnapshot } from './overlay.ts';

const text = (intensity = 0.5, hash = 'a'.repeat(64)) => JSON.stringify({
  simulated: true,
  visual: { visual_id: 'simulated-frame', name: 'Simulated frame', design_id: 'simulated-art',
    curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
  intensity: { visual_id: 'simulated-frame', intensity },
  package: { design_id: 'simulated-art', content_hash: hash, layers: [{ kind: 'text', text: '<b>Literal</b>',
    properties: { x: 0, y: 0, width: 100, height: 80, scale: 1, opacity: 1 },
    bindings: [{ property: 'opacity', output_range: { at_zero: 0, at_one: 1 } }] }] },
});

it('rejects invalid payloads and a different visual without applying them', () => {
  const apply = vi.fn();
  for (const invalid of ['null', '{}', text().replace('"intensity":0.5', '"intensity":2'), text().replace('simulated-art', 'other-art')]) {
    expect(receiveSnapshot(invalid, 'simulated-frame', apply)).toBe(false);
  }
  expect(receiveSnapshot(text(), 'another-frame', apply)).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  expect(receiveSnapshot(text(), 'simulated-frame', apply)).toBe(true);
  expect(apply).toHaveBeenCalledOnce();
});

// Minimal owned DOM surface: no dependency or simulated browser claim.
class Element {
  style = { setProperty: vi.fn() };
  dataset: Record<string, string> = {};
  textContent = '';
  children: Element[] = [];
  append = vi.fn((...children: Element[]) => { this.children.push(...children); });
  replaceChildren = vi.fn((...children: Element[]) => { this.children = children; });
  setAttribute = vi.fn();
  ownerDocument = { createElement: () => new Element() };
}

it('retains scene nodes and writes nothing for unchanged intensity', () => {
  vi.stubGlobal('document', { createElement: () => new Element() });
  const root = document.createElement('main');
  const scene = new OverlayScene(root);
  scene.apply(parseBeaconsRenderSnapshot(text()));
  const node = root.children[0] as HTMLElement;
  expect(node.textContent).toBe('<b>Literal</b>');
  const writes = vi.mocked(node.style.setProperty).mock.calls.length;
  scene.apply(parseBeaconsRenderSnapshot(text()));
  expect(root.replaceChildren).toHaveBeenCalledOnce();
  expect(vi.mocked(node.style.setProperty).mock.calls).toHaveLength(writes);
  scene.apply(parseBeaconsRenderSnapshot(text(0.8)));
  expect(node.style.setProperty).toHaveBeenLastCalledWith('--opacity', '0.8');
  expect(root.children[0]).toBe(node);
  expect(root.replaceChildren).toHaveBeenCalledOnce();
  scene.apply(parseBeaconsRenderSnapshot(text(0.8, 'b'.repeat(64))));
  expect(root.replaceChildren).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});
