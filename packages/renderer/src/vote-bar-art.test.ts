import { afterEach, expect, it, vi } from 'vitest';
import { parseVoteBarSnapshot } from '@castle-control/contract/vote-bar';
import { paintVoteBar } from './vote-bar.ts';
import { segmentColour } from './vote-bar-art.ts';

// Owned DOM surface with generated, simulated shares; not a browser claim.
class Element {
  children: Element[] = [];
  parentNode: Element | null = null;
  style: Record<string, string> & { setProperty?: (key: string, value: string) => void } = {};
  textContent = '';
  className = '';
  hidden = false;
  alt = '';
  src = '';
  clientHeight = 40;
  readonly tagName: string;
  constructor(tagName: string) { this.tagName = tagName; }
  append(...children: Element[]) { children.forEach(child => { child.parentNode = this; }); this.children.push(...children); }
  replaceChildren(...children: Element[]) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = []; this.append(...children);
  }
}
const observers: (() => void)[] = [];
class Observer { readonly callback: () => void; constructor(callback: () => void) { this.callback = callback; } observe() { observers.push(this.callback); } }
afterEach(() => { vi.unstubAllGlobals(); observers.length = 0; });

const hash = 'd'.repeat(64);
const art = { asset_url: `/assets/simulated-bar/${hash}/housing.webp`, track_rect: { x: 0.0746, y: 0.3923, w: 0.95, h: 0.7 },
  track_radius: 0.5, segments: ['#20D9E8', '#FF9E32', '#B16CFF'] };
const snapshot = (shares: number[], extra: Record<string, unknown> = {}) => parseVoteBarSnapshot(JSON.stringify({
  directions: shares.map(share => ({ share })), simulated: true, at: '2026-11-02T12:00:00Z', art, ...extra }));
const all = (element: Element): Element[] => element.children.flatMap(child => [child, ...all(child)]);
function root() {
  const mock = new Element('main');
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag), getElementById: () => mock });
  vi.stubGlobal('ResizeObserver', Observer);
  return { main: document.getElementById('vote-bar')!, mock };
}

it('paints the housing and clamped, rounded track with aggregate segments only', () => {
  const { main, mock } = root();
  paintVoteBar(main, snapshot([0.5, 0.3, 0.2]));
  const nodes = all(mock);
  expect(nodes.find(node => node.tagName === 'img')?.src).toBe(art.asset_url);
  const track = nodes.find(node => node.className === 'vbt');
  expect(track?.style).toMatchObject({ left: '7.46%', top: '39.23%' });
  // x + w and y + h are clamped to the image.
  expect(parseFloat(track?.style['width'] ?? '')).toBeCloseTo(92.54);
  expect(parseFloat(track?.style['height'] ?? '')).toBeCloseTo(60.77);
  observers.forEach(callback => callback());
  expect(track?.style['borderRadius']).toBe('20px');
  const segs = track?.children ?? [];
  expect(segs.map(seg => seg.style['width'])).toEqual(['50%', '30%', '20%']);
  expect(segs.map(seg => seg.style['color'])).toEqual(art.segments);
  expect(segs.map(seg => seg.className)).toEqual(['lead', '', '']);
  // No direction text: only the SIMULATED badge and the stylesheet carry text.
  expect(nodes.filter(node => node.textContent && node.tagName !== 'style').map(node => node.textContent)).toEqual(['SIMULATED']);
});

it('retains nodes across share updates so widths transition, and moves the lead glow', () => {
  const { main, mock } = root();
  paintVoteBar(main, snapshot([0.5, 0.3, 0.2]));
  const [first] = all(mock).filter(node => node.tagName === 'i');
  paintVoteBar(main, snapshot([0.2, 0.3, 0.5], { simulated: false }));
  const segs = all(mock).filter(node => node.tagName === 'i');
  expect(segs[0]).toBe(first);
  expect(segs.map(seg => seg.className)).toEqual(['', '', 'lead']);
  expect(all(mock).find(node => node.className === 'vbs')?.hidden).toBe(true);
  // A cleared root (stream error) or a direction-count change rebuilds.
  main.replaceChildren();
  paintVoteBar(main, snapshot([0.2, 0.3, 0.5]));
  expect(all(mock).filter(node => node.tagName === 'i')[0]).not.toBe(first);
});

it('uses the first N colours and blends neighbours beyond three; no art keeps the labelled bars', () => {
  expect(segmentColour(art.segments, 0)).toBe('#20D9E8');
  expect(segmentColour(art.segments, 3)).toBe('#8fbb8d');
  expect(segmentColour(art.segments, 4)).toBe('#d78598');
  expect(segmentColour(['#000000', '#ffffff', '#ff0000'], 5)).toBe('#7f0000');
  const { main, mock } = root();
  paintVoteBar(main, snapshot([1]));
  expect(all(mock).filter(node => node.tagName === 'i')).toHaveLength(1);
  paintVoteBar(main, parseVoteBarSnapshot(JSON.stringify({ directions: [{ share: 1 }], simulated: false, at: '2026-11-02T12:00:00Z' })));
  expect(all(mock).find(node => node.tagName === 'span')?.textContent).toBe('Direction 1 · 100%');
  expect(all(mock).some(node => node.tagName === 'img')).toBe(false);
});
