import { afterEach, expect, test, vi } from 'vitest';
import { mountTiltyard, paintTiltyard, timerText } from './tiltyard.ts';
import { parseTiltyardRenderSnapshot } from '@castle-control/contract/tiltyard-render';

class Element {
  children: Element[] = [];
  textContent = '';
  className = '';
  replaceChildren(...children: Element[]) { this.children = children; }
}
const value = { left: { label: '<img src=x onerror=alert(1)>', count: 2 }, right: { label: 'Sample: Sky', count: 1 },
  ballots: 3, phase: 'called', round_label: 'Final', match_label: 'Match 1', simulated: true,
  verdict: { side: 'right', how: 'call' }, at: '2026-11-01T12:00:00Z' };
class Stream extends EventTarget {
  static latest: Stream;
  onerror: (() => void) | undefined;
  url: string;
  close = vi.fn();
  constructor(url: string) { super(); this.url = url; Stream.latest = this; }
  push(value: unknown) { this.dispatchEvent(new MessageEvent('tiltyard.render.snapshot', { data: JSON.stringify(value) })); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  vi.stubGlobal('document', { createElement: () => new Element(), getElementById: () => ({ textContent: JSON.stringify(value) }) });
  vi.stubGlobal('EventSource', Stream);
  return document.createElement('main');
}
test('aggregate replacement escapes labels through text nodes, discloses simulation and shows the winning side', () => {
  const root = setup();
  paintTiltyard(root, parseTiltyardRenderSnapshot(JSON.stringify(value)));
  const text = Array.from(root.children).map(node => node.textContent);
  expect(text).toContain('SIMULATED');
  expect(text).toContain('1 · <img src=x onerror=alert(1)> · 2');
  expect(text).toContain('Winner: Sample: Sky · call');
  const finished = { ...value, phase: 'finished', champion: { id: 'sky', title: 'Sample: Sky', by: 'Simulated', seed: '1' } };
  paintTiltyard(root, parseTiltyardRenderSnapshot(JSON.stringify(finished)));
  expect(Array.from(root.children).at(-1)?.textContent).toBe('Champion: Sample: Sky');
});
test('SSE replacements validate, clear stale cards on invalid data/disconnect, and dispose timers', () => {
  vi.useFakeTimers();
  const root = setup();
  const dispose = mountTiltyard(root);
  expect(Stream.latest.url).toBe('/push/tiltyard');
  expect(root.children[0]?.textContent).toBe('SIMULATED');
  Stream.latest.push({ ...value, simulated: false });
  expect(root.children[0]?.textContent).not.toBe('SIMULATED');
  Stream.latest.push({ ...value, viewer: 'simulated private data' });
  expect(root.children).toHaveLength(0);
  Stream.latest.push(value); Stream.latest.onerror?.();
  expect(root.children).toHaveLength(0);
  dispose(); expect(Stream.latest.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
test('open and paused timers round upwards and never go negative', () => {
  const parsed = parseTiltyardRenderSnapshot(JSON.stringify(value));
  expect(timerText({ ...parsed, window_ends_at: '2026-11-01T12:00:01Z' }, Date.parse(parsed.at))).toBe('1s remaining');
  expect(timerText({ ...parsed, window_ends_at: parsed.at }, Date.parse(parsed.at) + 5000)).toBe('0s remaining');
  expect(timerText({ ...parsed, window_remaining_ms: 1001 })).toBe('Paused · 2s remaining');
});
