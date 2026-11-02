import { afterEach, expect, it, vi } from 'vitest';
import { mountDraw } from './host.ts';

// Owned DOM surface with generated, simulated draw data; not a browser claim.
const rect = { left: 0, top: 0, width: 100, height: 100 };
class Element {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  className = '';
  classList = { add: (name: string) => { this.className += ` ${name}`; } };
  textContent = '';
  hidden = false;
  box = rect;
  ownerDocument: Doc;
  readonly tagName: string;
  constructor(tagName: string, doc: Doc) { this.tagName = tagName; this.ownerDocument = doc; }
  append(...nodes: Element[]): void { this.children.push(...nodes); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  querySelector(): Element | undefined { return this.children.find((child) => 'drawFallback' in child.dataset); }
  getBoundingClientRect() { return this.box; }
  animate = vi.fn<(frames: Keyframe[], options?: KeyframeAnimationOptions) => { cancel: () => void; addEventListener: () => void }>(
    () => ({ cancel: vi.fn(), addEventListener: vi.fn() }));
  remove = vi.fn();
}

class Doc {
  ids = new Map<string, Element>();
  callbacks = new Map<number, FrameRequestCallback>();
  counter = 0;
  reduced = false;
  defaultView = {
    sessionStorage: { getItem: () => null, setItem: vi.fn() },
    performance: { now: () => 0 },
    matchMedia: (query: string) => ({ matches: this.reduced && query === '(prefers-reduced-motion: reduce)' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = ++this.counter; this.callbacks.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => { this.callbacks.delete(id); },
  };
  createElement(tag: string): Element { return new Element(tag, this); }
  createElementNS(_namespace: string, tag: string): Element { return this.createElement(tag); }
  getElementById(id: string): Element | undefined { return this.ids.get(id); }
  advance(ms: number): void {
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    callbacks.forEach((callback) => callback(ms));
  }
}

const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const entries = Array.from({ length: 12 }, (_, index) => ({ handle: `sim_entry_${index}`, weight: 1 }));
const seal = { draw_id: 'simulated-draw', draw_run_id: id,
  sealed: { seal: 'a'.repeat(64), roll: { version: 1, sealed_at: '2026-10-25T12:00:00Z', margin_s: 6,
    randomness: { source: 'streamer_commit', commitment: 'b'.repeat(64) }, winner_count: 2, entries } } };
const cast = { draw_run_id: id, writ_id: id,
  cast: { seal: seal.sealed.seal, label: 'streamer-controlled', winners: ['sim_entry_3', 'sim_entry_7'] } };
const hash = 'c'.repeat(64);
const vessel = { asset_url: `/assets/simulated-vessel/${hash}/base.webp`, token_url: `/assets/simulated-vessel/${hash}/token.webp`,
  chamber_rect: { x: 0.29, y: 0.32, w: 0.41, h: 0.335 }, mouth: { x: 0.374, y: 0.86 } };

function setup(island: unknown, reduced = false) {
  const doc = new Doc();
  doc.reduced = reduced;
  const root = doc.createElement('main');
  root.dataset = { content: 'question', simulated: 'true' };
  const fallback = doc.createElement('section');
  fallback.dataset['drawFallback'] = '';
  root.append(fallback);
  for (const [name, value] of [['cc-seal', seal], ['cc-cast', cast], ['cc-vessel', island]] as const) {
    if (value === undefined) continue;
    const node = doc.createElement('script');
    node.textContent = typeof value === 'string' ? value : JSON.stringify(value);
    doc.ids.set(name, node);
  }
  doc.ids.set('draw', root);
  vi.stubGlobal('document', doc);
  const dispose = mountDraw(document.getElementById('draw')!, 'simulated-draw');
  return { doc, root, dispose };
}
const all = (element: Element): Element[] => element.children.flatMap((child) => [child, ...all(child)]);
const tokens = (root: Element) => all(root).filter((node) => node.className.startsWith('draw-token'));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('replaces the vector artwork with the island vessel and idles at most nine entries inside chamber_rect', () => {
  const { root } = setup({ vessel });
  const nodes = all(root);
  expect(nodes.some((node) => node.tagName === 'svg')).toBe(false);
  const figure = nodes.find((node) => node.className === 'draw-vessel');
  expect(figure?.children[0]?.attributes['src']).toBe(vessel.asset_url);
  const idle = tokens(root);
  expect(idle).toHaveLength(9);
  for (const token of idle) {
    expect(token.tagName).toBe('img');
    expect(token.attributes['src']).toBe(vessel.token_url);
    const left = parseFloat(token.style['left'] ?? '') / 100, top = parseFloat(token.style['top'] ?? '') / 100;
    const size = parseFloat(token.style['width'] ?? '') / 100;
    expect(left).toBeGreaterThanOrEqual(0.29); expect(left + size).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(top).toBeGreaterThanOrEqual(0.32); expect(top + size).toBeLessThanOrEqual(0.655 + 1e-9);
  }
  // Text layers stay foreground and unchanged.
  expect(nodes.find((node) => node.tagName === 'header')?.textContent).toBe('streamer-controlled');
});

it('flies one token from the mouth to each revealed winner row, then the row stays', () => {
  const { root, doc } = setup({ vessel });
  doc.advance(1200);
  const fly = () => tokens(root).filter((node) => node.className.includes('draw-fly'));
  expect(fly()).toHaveLength(1);
  const [frames, options] = fly()[0]?.animate.mock.calls[0] ?? [[]];
  expect(frames[0]?.transform).toBe('translate(37.4px,86px) translate(-50%,-50%) scale(0.6)');
  expect(options?.duration).toBe(900);
  doc.advance(2100);
  expect(fly()).toHaveLength(2);
  expect(all(root).filter((node) => 'drawWinner' in node.dataset).map((node) => node.textContent)).toEqual(cast.cast.winners);
});

it('uses CSS orbs without a token sprite and never flies under reduced motion', () => {
  const orbs = { asset_url: vessel.asset_url, chamber_rect: vessel.chamber_rect, mouth: vessel.mouth };
  const { root, doc } = setup({ vessel: orbs }, true);
  expect(tokens(root).length).toBeGreaterThan(0);
  expect(tokens(root).every((node) => node.tagName === 'b' && !('src' in node.attributes))).toBe(true);
  expect(all(root).filter((node) => 'drawWinner' in node.dataset)).toHaveLength(2);
  expect(all(root).every((node) => node.animate.mock.calls.length === 0)).toBe(true);
  expect(doc.callbacks.size).toBe(0);
});

it.each([
  ['absent island', undefined], ['empty plate', {}], ['malformed JSON', '{'],
  ['unknown key', { vessel: { ...vessel, extra: 1 } }], ['external url', { vessel: { ...vessel, asset_url: 'https://example.invalid/a.webp' } }],
  ['traversal', { vessel: { ...vessel, token_url: `/assets/simulated-vessel/${hash}/../x.webp` } }],
  ['out of range', { vessel: { ...vessel, mouth: { x: 1.2, y: 0.5 } } }], ['plate extra', { vessel, more: true }],
])('keeps the vector plate for %s', (_name, island) => {
  const { root } = setup(island);
  expect(all(root).some((node) => node.tagName === 'svg')).toBe(true);
  expect(tokens(root)).toHaveLength(0);
});
