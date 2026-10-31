import { afterEach, expect, it, vi } from 'vitest';
import { mountDraw } from './host.ts';

// The renderer's existing DOM-surface approach: no uninstalled jsdom dependency.
// A separate Chromium proof beside result.json requires permission to spawn Chrome.
class Element {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { transformOrigin: '', transformBox: '' };
  className = '';
  classList = { add: (name: string) => { this.className = name; } };
  textContent = '';
  hidden = false;
  ownerDocument: Doc;
  readonly tagName: string;
  constructor(tagName: string, doc: Doc) { this.tagName = tagName; this.ownerDocument = doc; }
  append(...nodes: Element[]): void { this.children.push(...nodes); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  querySelector(): Element | undefined { return this.children.find((child) => 'drawFallback' in child.dataset); }
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  remove = vi.fn();
}

class Doc {
  ids = new Map<string, Element>();
  storage = new Map<string, string>();
  callbacks = new Map<number, FrameRequestCallback>();
  counter = 0;
  reduced = false;
  defaultView = {
    sessionStorage: { getItem: (key: string) => this.storage.get(key) ?? null,
      setItem: (key: string, value: string) => { this.storage.set(key, value); } },
    performance: { now: () => 0 },
    matchMedia: (query: string) => ({ matches: this.reduced && query === '(prefers-reduced-motion: reduce)' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = ++this.counter; this.callbacks.set(id, callback); return id;
    },
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
const seal = { draw_id: 'simulated-draw', draw_run_id: id,
  sealed: { seal: 'a'.repeat(64), roll: { version: 1, sealed_at: '2026-10-25T12:00:00Z', margin_s: 6,
    randomness: { source: 'streamer_commit', commitment: 'b'.repeat(64) }, winner_count: 2,
    entries: [{ handle: 'sim_first', weight: 1 }, { handle: 'sim_second', weight: 1 }] } } };
const cast = { draw_run_id: id, writ_id: id,
  cast: { seal: seal.sealed.seal, label: 'streamer-controlled', winners: ['sim_second', 'sim_first'] } };

function setup(result: unknown = cast, content = 'prize') {
  const doc = new Doc();
  const root = doc.createElement('main');
  root.dataset = { content, simulated: 'true', anchor: 'tl' };
  const fallback = doc.createElement('section');
  fallback.dataset['drawFallback'] = '';
  fallback.textContent = 'Seal announced · Target round · Waiting for verified cast';
  root.append(fallback);
  for (const [name, value] of [['cc-seal', seal], ['cc-cast', result]] as const) {
    if (value === undefined) continue;
    const node = doc.createElement('script'); node.textContent = JSON.stringify(value); doc.ids.set(name, node);
  }
  doc.ids.set('draw', root);
  const mount = () => {
    vi.stubGlobal('document', doc);
    return mountDraw(document.getElementById('draw')!, 'simulated-draw');
  };
  return { doc, root, fallback, mount };
}

function descendants(element: Element): Element[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}
function winners(element: Element): string[] {
  return descendants(element).filter((child) => 'drawWinner' in child.dataset).map((child) => child.textContent);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('leaves the seal/target-round fallback and zero winner nodes until a cast arrives', () => {
  const { doc, root, fallback, mount } = setup();
  doc.ids.delete('cc-cast');
  expect(mount()).toBeUndefined();
  expect(fallback.hidden).toBe(false);
  expect(fallback.textContent).toContain('Target round');
  expect(winners(root)).toEqual([]);
  doc.ids.set('cc-cast', Object.assign(doc.createElement('script'), { textContent: JSON.stringify(cast) }));
  expect(mount()).toBeTypeOf('function');
  expect(fallback.hidden).toBe(true);
  expect(winners(root)).toEqual([]);
  doc.advance(1199); expect(winners(root)).toEqual([]);
  doc.advance(1200); expect(winners(root)).toEqual(['sim_second']);
  doc.advance(2100); expect(winners(root)).toEqual(cast.cast.winners);
  expect(doc.callbacks.size).toBe(0);
});

it('keeps prize disclaimer, cast label and simulated badge outside artwork animation throughout playback', () => {
  const { root, doc, mount } = setup();
  const dispose = mount();
  for (const ms of [0, 1200, 2100, 60000]) {
    doc.advance(ms);
    const nodes = descendants(root);
    expect(nodes.find((node) => node.tagName === 'footer')?.textContent)
      .toBe('Twitch does not sponsor this promotion · streamer-controlled');
    expect(nodes.find((node) => node.tagName === 'header')?.textContent).toBe('streamer-controlled');
    expect(nodes.find((node) => node.className === 'simulated')?.hidden).toBe(false);
    expect(nodes.filter((node) => node.animate.mock.calls.length > 0).map((node) => node.tagName)).toEqual(['g']);
    expect(nodes.filter((node) => node.tagName === 'path').every((node) => /^var\(--(key|gules|or|paper)\)$/.test(node.attributes['fill'] ?? ''))).toBe(true);
  }
  dispose?.();
  expect(root.dataset['drawMounted']).toBeUndefined();
});

it('OS reduced motion reveals all winners at zero with no animations or frame loop', () => {
  const { root, doc, mount } = setup(); doc.reduced = true;
  mount();
  expect(winners(root)).toEqual(cast.cast.winners);
  expect(descendants(root).every((node) => node.animate.mock.calls.length === 0)).toBe(true);
  expect(doc.callbacks.size).toBe(0);
});

it.each([{}, null, { ...cast, extra: true }, { ...cast, draw_run_id: 'bad' },
  { ...cast, draw_run_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' },
  { ...cast, cast: { ...cast.cast, seal: 'b'.repeat(64) } },
  { ...cast, cast: { ...cast.cast, winners: ['</script>'] } },
])('rejects invalid or mismatched cast %j without changing the fallback', (invalid) => {
  const { root, fallback, mount } = setup(invalid);
  expect(mount()).toBeUndefined();
  expect(root.dataset['drawError']).toBe('invalid_scene');
  expect(fallback.hidden).toBe(false);
  expect(root.children).toEqual([fallback]);
});

it('fails closed on a bad seal, a different draw or missing seal-time content', () => {
  for (const change of ['json', 'draw', 'content']) {
    const { doc, root, fallback, mount } = setup();
    if (change === 'json') doc.ids.get('cc-seal')!.textContent = '{';
    if (change === 'draw') doc.ids.get('cc-seal')!.textContent = JSON.stringify({ ...seal, draw_id: 'other-draw' });
    if (change === 'content') delete root.dataset['content'];
    expect(mount()).toBeUndefined();
    expect(fallback.hidden).toBe(false);
    expect(winners(root)).toEqual([]);
  }
});

it('records completed seals in sessionStorage; remount is final and a different seal plays again', () => {
  const { doc, root, mount } = setup();
  const dispose = mount(); doc.advance(2100); dispose?.(); root.children.splice(1);
  mount();
  expect(winners(root)).toEqual(cast.cast.winners);
  expect(descendants(root).every((node) => node.animate.mock.calls.length === 0)).toBe(true);
  expect(doc.storage.has(`cc-lots-played:simulated-draw:${seal.sealed.seal}`)).toBe(true);
  const other = setup(); other.doc.storage = doc.storage; other.mount();
  expect(winners(other.root)).toEqual(cast.cast.winners);
  const fresh = setup();
  fresh.doc.storage = doc.storage;
  fresh.doc.ids.get('cc-seal')!.textContent = JSON.stringify({ ...seal, sealed: { ...seal.sealed, seal: 'c'.repeat(64) } });
  fresh.doc.ids.get('cc-cast')!.textContent = JSON.stringify({ ...cast, cast: { ...cast.cast, seal: 'c'.repeat(64) } });
  fresh.mount(); expect(winners(fresh.root)).toEqual([]);
});

it('handles unavailable OBS storage and disposal without losing the fixed result', () => {
  const { doc, root, mount } = setup();
  vi.spyOn(doc.defaultView.sessionStorage, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
  const dispose = mount();
  expect(root.dataset['replayStorage']).toBe('unavailable');
  doc.advance(1200); expect(winners(root)).toEqual(['sim_second']);
  dispose?.(); expect(doc.callbacks.size).toBe(0);
});
