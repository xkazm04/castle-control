import { afterEach, expect, it, vi } from 'vitest';
import { parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { OverlayScene, receiveSnapshot } from './overlay.ts';

const text = (intensity = 0.5, hash = 'a'.repeat(64), simulated = true) => JSON.stringify({
  simulated,
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
  hidden = false;
  nextElementSibling: Element | null = null;
  children: Element[] = [];
  after = vi.fn((element: Element) => { this.nextElementSibling = element; });
  append = vi.fn((...children: Element[]) => { this.children.push(...children); });
  replaceChildren = vi.fn((...children: Element[]) => { this.children = children; });
  setAttribute = vi.fn();
  ownerDocument = { createElement: () => new Element() };
}

afterEach(() => { vi.unstubAllGlobals(); });

function createScene(): { root: HTMLElement; scene: OverlayScene } {
  vi.stubGlobal('document', { createElement: () => new Element() });
  const root = document.createElement('main');
  return { root, scene: new OverlayScene(root) };
}

it('shows a dedicated SIMULATED badge for an accepted simulated snapshot', () => {
  const { root, scene } = createScene();
  scene.apply(parseBeaconsRenderSnapshot(text()));
  const badge = root.nextElementSibling as HTMLElement;
  expect(badge).not.toBeNull();
  expect(badge.dataset['simulatedBadge']).toBe('');
  expect(badge.textContent).toBe('SIMULATED');
  expect(badge.hidden).toBe(false);
  expect(root.dataset['simulated']).toBe('true');
  expect(root.children).toHaveLength(1);
});

it('hides the badge when the next accepted snapshot is live', () => {
  const { root, scene } = createScene();
  scene.apply(parseBeaconsRenderSnapshot(text()));
  const badge = root.nextElementSibling as HTMLElement;
  scene.apply(parseBeaconsRenderSnapshot(text(0.5, 'a'.repeat(64), false)));
  expect(badge.hidden).toBe(true);
  expect(badge.textContent).toBe('SIMULATED');
  expect(root.dataset['simulated']).toBe('false');
});

it('keeps the same visible badge when a simulated package is rebuilt', () => {
  const { root, scene } = createScene();
  scene.apply(parseBeaconsRenderSnapshot(text()));
  const badge = root.nextElementSibling as HTMLElement;
  const layer = root.children[0];
  scene.apply(parseBeaconsRenderSnapshot(text(0.8, 'b'.repeat(64))));
  expect(root.children[0]).not.toBe(layer);
  expect(root.replaceChildren).toHaveBeenCalledTimes(2);
  expect(root.nextElementSibling).toBe(badge);
  expect(root.after).toHaveBeenCalledOnce();
  expect(badge.hidden).toBe(false);
  expect(root.dataset['simulated']).toBe('true');
  expect(root.dataset['packageHash']).toBe('b'.repeat(64));
});

it('retains the simulated badge and diagnostics when a later snapshot is rejected', () => {
  const { root, scene } = createScene();
  const apply = (snapshot: Parameters<OverlayScene['apply']>[0]) => scene.apply(snapshot);
  expect(receiveSnapshot(text(), 'simulated-frame', apply)).toBe(true);
  const badge = root.nextElementSibling as HTMLElement;
  const invalid = text(2, 'b'.repeat(64), false);
  expect(receiveSnapshot(invalid, 'simulated-frame', apply)).toBe(false);
  expect(root.nextElementSibling).toBe(badge);
  expect(badge.hidden).toBe(false);
  expect(root.dataset['simulated']).toBe('true');
  expect(root.dataset['packageHash']).toBe('a'.repeat(64));
  expect(root.dataset['intensity']).toBe('0.5');
  expect(root.replaceChildren).toHaveBeenCalledOnce();
});

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
});
