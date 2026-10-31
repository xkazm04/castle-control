/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { parseJson } from '@castle-control/contract/door';
import { afterEach, expect, it, vi } from 'vitest';
import { parseOverlayPath } from './overlay-path.ts';

const input = parseJson(readFileSync(new URL('../../../crates/cc-obs/tests/fixtures/overlay-paths.json', import.meta.url), 'utf8'));
if (!Array.isArray(input) || input.length === 0) throw new Error('empty overlay path cases');
const cases: unknown[] = input;
for (const row of cases) {
  if (typeof row !== 'object' || row === null || !('target' in row) || typeof row.target !== 'string'
    || !('kind' in row) || !('canonical' in row)) throw new Error('invalid overlay path case');
  const target = row.target;
  const kind = row.kind;
  const canonical = row.canonical;
  it(`agrees with the shared Rust grammar: ${target}`, () => {
    const mark = target.indexOf('?');
    const page = parseOverlayPath(mark < 0 ? target : target.slice(0, mark), mark < 0 ? '' : target.slice(mark));
    expect(page?.kind ?? null).toBe(kind);
    if (page) {
      const actual = page.kind === 'vote_bar' ? '/gatehouse/current' : page.kind === 'spike' ? '/' : page.kind === 'lots' ? `/lots/${page.draw}`
        : `/beacons/${page.visual}${page.package_hash === undefined ? '' : `?package_hash=${page.package_hash}`}`;
      expect(actual).toBe(canonical);
    }
  });
}

vi.mock('./overlay.ts', () => ({ connectOverlay: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });
it('connects Beacons only, never Lots, spike or a rejected page/query', async () => {
  const { connectOverlay } = await import('./overlay.ts');
  const root = {};
  for (const [pathname, search] of [
    ['/lots/simulated-draw', '?scale=2&anchor=tl'], ['/', ''],
    ['/beacons/Upper', ''], ['/beacons/simulated-frame', '?other=1'],
    ['/beacons/simulated-frame', '?scale=0.5&anchor=br'],
  ]) {
    vi.stubGlobal('document', { createElement: () => ({ textContent: '' }), head: { append: vi.fn() }, getElementById: () => root });
    vi.stubGlobal('location', { pathname, search });
    vi.stubGlobal('__CC_OVERLAY_STYLES__', '');
    await import('./overlay-entry.ts');
    vi.resetModules();
  }
  expect(connectOverlay).toHaveBeenCalledExactlyOnceWith(root, 'simulated-frame', { scale: 0.5, anchor: 'br' });
});
