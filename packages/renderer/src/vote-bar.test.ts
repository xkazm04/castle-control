import { afterEach, expect, test, vi } from 'vitest';
import { mountVoteBar } from './vote-bar.ts';

// Owned DOM surface, with generated simulated data; no browser claim.
class Element {
  children: Element[] = [];
  style = { width: '' };
  textContent = '';
  className = '';
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
}
const snapshot = { directions: [{ share: 0.75 }, { share: 0.25 }], simulated: true, at: '2026-10-31T12:00:00Z' };
class Stream extends EventTarget {
  static latest: Stream;
  onerror: (() => void) | undefined;
  url: string;
  close = vi.fn();
  constructor(url: string) { super(); this.url = url; Stream.latest = this; }
  push(value: unknown) { this.dispatchEvent(new MessageEvent('gatehouse.render.snapshot', { data: JSON.stringify(value) })); }
}
afterEach(() => vi.unstubAllGlobals());

test('renders only aggregate shares, replaces snapshots and clears stale output on invalid data or disconnect', () => {
  vi.stubGlobal('document', {
    createElement: () => new Element(),
    getElementById: () => ({ textContent: JSON.stringify(snapshot) }),
  });
  vi.stubGlobal('EventSource', Stream);
  const root = document.createElement('main');
  const dispose = mountVoteBar(root);
  const stream = Stream.latest;
  const children = () => Array.from(root.children);
  expect(stream.url).toBe('/push/gatehouse');
  expect(children()).toHaveLength(3);
  expect(children()[0]?.textContent).toBe('SIMULATED');
  // The DOM mock exposes the same public child/firstElement properties as needed.
  const row = children()[1];
  expect(row?.children[0]?.textContent).toBe('Direction 1 · 75%');
  stream.push({ ...snapshot, simulated: false, directions: [{ share: 1 }] });
  expect(children()).toHaveLength(1);
  stream.push({ ...snapshot, text: 'simulated private data' });
  expect(children()).toHaveLength(0);
  stream.push(snapshot); expect(children()).toHaveLength(3);
  stream.onerror?.(); expect(children()).toHaveLength(0);
  stream.push(snapshot); expect(children()).toHaveLength(3);
  dispose(); expect(stream.close).toHaveBeenCalledOnce(); expect(children()).toHaveLength(0);
});
