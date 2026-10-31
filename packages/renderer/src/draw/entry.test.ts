import { afterEach, expect, it, vi } from 'vitest';
import { mountDraw } from './host.ts';
import { connectOverlay } from '../overlay.ts';

vi.mock('./host.ts', () => ({ mountDraw: vi.fn() }));
vi.mock('../overlay.ts', () => ({ connectOverlay: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it('routes lots through the shared page grammar without parsing query values in the host', async () => {
  const draw = { dataset: { anchor: 'br' } };
  vi.stubGlobal('document', { createElement: () => ({ textContent: '' }), head: { append: vi.fn() },
    getElementById: (id: string) => id === 'draw' ? draw : null });
  vi.stubGlobal('__CC_OVERLAY_STYLES__', '');
  for (const search of ['', '?scale=2&anchor=tl', '?scale=bogus&anchor=wrong']) {
    vi.stubGlobal('location', { pathname: '/lots/simulated-draw', search });
    await import('../overlay-entry.ts');
    expect(mountDraw).toHaveBeenLastCalledWith(draw, 'simulated-draw');
    vi.resetModules();
  }
  expect(mountDraw).toHaveBeenCalledTimes(3);
  expect(connectOverlay).not.toHaveBeenCalled();
});

it.each(['?shape=wheel', '?motion=reduced', '?chrome=card', '?unknown=1'])(
  'refuses extra lots query keys before mounting: %s', async (search) => {
    vi.stubGlobal('document', { createElement: () => ({ textContent: '' }), head: { append: vi.fn() },
      getElementById: () => ({}) });
    vi.stubGlobal('__CC_OVERLAY_STYLES__', '');
    vi.stubGlobal('location', { pathname: '/lots/simulated-draw', search });
    await import('../overlay-entry.ts');
    expect(mountDraw).not.toHaveBeenCalled();
    expect(connectOverlay).not.toHaveBeenCalled();
  },
);
