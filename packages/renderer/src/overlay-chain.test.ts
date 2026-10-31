import { afterEach, expect, it, vi } from 'vitest';
import { BEACONS_RENDER_SNAPSHOT_EVENT } from '@castle-control/contract/beacons-render';
import { connectOverlay } from './overlay.ts';

// Owned DOM/EventSource doubles; all payloads are generated simulated fixtures.
class Element extends EventTarget {
  style = { setProperty: vi.fn() };
  dataset: Record<string, string> = {};
  textContent = '';
  hidden = false;
  children: Element[] = [];
  nextElementSibling: Element | null = null;
  attributes = new Map<string, string>();
  after(element: Element): void { this.nextElementSibling = element; }
  replaceChildren(...children: Element[]): void { this.children = children; }
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  ownerDocument = { createElement: () => new Element() };
}

class Stream extends EventTarget {
  static instances: Stream[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = Stream.CONNECTING;
  url: string;
  close = vi.fn(() => { this.readyState = Stream.CLOSED; });
  constructor(url: string) { super(); this.url = url; Stream.instances.push(this); }
  fail(state: number): void { this.readyState = state; this.dispatchEvent(new Event('error')); }
  snapshot(data = wire()): void {
    this.dispatchEvent(new MessageEvent(BEACONS_RENDER_SNAPSHOT_EVENT, { data }));
  }
}

function wire(): string {
  return JSON.stringify({ simulated: true,
    visual: { visual_id: 'simulated-frame', name: 'Simulated frame', design_id: 'simulated-art',
      curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
    intensity: { visual_id: 'simulated-frame', intensity: 0.5 },
    package: { design_id: 'simulated-art', content_hash: 'a'.repeat(64), layers: [
      { kind: 'text', text: 'Simulated', properties: { x: 0, y: 0, width: 100, height: 80, scale: 1, opacity: 1 }, bindings: [] },
    ] },
  });
}

function connected(): { root: HTMLElement; stream: Stream; dispose: () => void } {
  Stream.instances = [];
  vi.stubGlobal('document', { createElement: () => new Element() });
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('EventSource', Stream);
  const root = document.createElement('main');
  const dispose = connectOverlay(root, 'simulated-frame');
  const stream = Stream.instances[0];
  if (!stream) throw new Error('Missing simulated stream');
  return { root, stream, dispose };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const state of [Stream.CONNECTING, Stream.CLOSED]) {
  it(`clears stale art and provenance on stream error in state ${state}, then rebuilds the same package`, () => {
    vi.useFakeTimers();
    const { root, stream, dispose } = connected();
    stream.snapshot();
    const badge = root.nextElementSibling as HTMLElement;
    expect(root.children).toHaveLength(1);
    expect(badge.hidden).toBe(false);
    stream.fail(state);
    expect(root.children).toHaveLength(0);
    expect(badge.hidden).toBe(true);
    expect(root.dataset['packageHash']).toBeUndefined();
    expect(root.dataset['intensity']).toBeUndefined();
    stream.snapshot('{}');
    expect(root.children).toHaveLength(0);
    if (state === Stream.CONNECTING) {
      stream.snapshot();
      expect(root.children).toHaveLength(1);
      expect(badge.hidden).toBe(false);
    }
    dispose();
    stream.snapshot();
    expect(root.children).toHaveLength(0);
  });
}

it('retries refused streams with 2s doubling backoff capped at 30s, then renders and resets on open', () => {
  vi.useFakeTimers();
  const { root, stream, dispose } = connected();
  let current = stream;
  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = Stream.instances.length;
    current.fail(Stream.CLOSED);
    current.fail(Stream.CLOSED); // One timer per failed instance.
    vi.advanceTimersByTime(delay - 1);
    expect(Stream.instances).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(Stream.instances).toHaveLength(count + 1);
    const next = Stream.instances.at(-1);
    if (!next) throw new Error('Missing retried stream');
    expect(next.url).toBe(stream.url);
    current = next;
  }
  current.readyState = Stream.OPEN;
  current.dispatchEvent(new Event('open'));
  current.snapshot();
  expect(root.children).toHaveLength(1);
  expect((root.nextElementSibling as HTMLElement).hidden).toBe(false);
  stream.snapshot(); // Superseded instances must not repaint.
  current.fail(Stream.CLOSED);
  vi.advanceTimersByTime(2000);
  expect(Stream.instances).toHaveLength(8);
  expect(root.children).toHaveLength(0);
  dispose();
});

it('cancels a pending closed-stream retry on disposal', () => {
  vi.useFakeTimers();
  const { stream, dispose } = connected();
  stream.fail(Stream.CLOSED);
  expect(vi.getTimerCount()).toBe(1);
  dispose();
  vi.advanceTimersByTime(60000);
  expect(Stream.instances).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(stream.close).toHaveBeenCalled();
});

it('lets CONNECTING streams reconnect natively without a second EventSource', () => {
  vi.useFakeTimers();
  const { stream, dispose } = connected();
  stream.fail(Stream.CONNECTING);
  vi.advanceTimersByTime(60000);
  expect(Stream.instances).toHaveLength(1);
  expect(stream.close).not.toHaveBeenCalled();
  dispose();
});

const imageWire = () => wire().replace('"kind":"text","text":"Simulated"', '"kind":"image","asset":"simulated.png"');

it('gives decorative image layers an empty alternative to suppress browser glyphs', () => {
  const { root, stream, dispose } = connected();
  stream.snapshot(imageWire());
  expect(root.children[0]?.getAttribute('alt')).toBe('');
  expect(root.children[0]?.getAttribute('src')).toContain('/assets/simulated-frame/');
  dispose();
});

it('hides a failed image layer and allows a replacement package to load a fresh image', () => {
  const { root, stream, dispose } = connected();
  stream.snapshot(imageWire());
  const image = root.children[0] as HTMLElement;
  expect(image.hidden).toBe(false);
  image.dispatchEvent(new Event('error'));
  expect(image.hidden).toBe(true);
  stream.snapshot(imageWire().replace('a'.repeat(64), 'b'.repeat(64)));
  expect(root.children[0]).not.toBe(image);
  expect((root.children[0] as HTMLElement).hidden).toBe(false);
  dispose();
});
