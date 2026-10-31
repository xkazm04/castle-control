import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';
import { createBeaconsView } from './core-view.js';

test('a rate_limited load renders a failure alert naming rate_limited and not the text No visuals loaded from the core.', async () => {
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: vi.fn().mockRejectedValue({ code: 'rate_limited', message: 'Simulated failure', retry_after_ms: 500 }) });
  await port.load();
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  expect(html).toMatch(/role="alert"[^>]*>[^<]*rate_limited/);
  expect(html).toContain('Refresh');
  expect(html).not.toContain('No visuals loaded from the core.');
});

test.each(['rate_limited', 'unavailable', 'malformed'] as const)('%s refresh keeps the last confirmed list and selection, labels failure, then replaces it after recovery', async failure => {
  const rpc = vi.fn().mockResolvedValue({ visuals: [
    { visual_id: 'synthetic-first', name: 'Synthetic first',
      curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
    { visual_id: 'synthetic-last', name: 'Synthetic last',
      curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
  ] });
  const core = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  const port = createBeaconsView(core);
  const unsubscribe = core.subscribe(() => { port.getSnapshot(); });
  await port.load();
  const confirmed = port.getSnapshot().visuals;
  const last = confirmed[1];
  if (!last) throw new Error('Missing synthetic last visual');
  port.select(last.visual_id);
  if (failure === 'malformed') rpc.mockResolvedValueOnce({ visuals: [{ invalid: true }] });
  else rpc.mockRejectedValueOnce({ code: failure, message: 'Private simulated upstream prose', retry_after_ms: 100 });
  const pending = port.load();
  expect(port.getSnapshot()).toMatchObject({ busy: true, visuals: confirmed, selected: last.visual_id });
  await pending;
  expect(core.getSnapshot().visuals).toEqual([]); // Keep the transport's clear-on-load contract.
  expect(port.getSnapshot().visuals).toBe(confirmed);
  expect(port.getSnapshot().selected).toBe(last.visual_id);
  expect(port.getSnapshot()).toBe(port.getSnapshot());
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  expect(html).toMatch(/role="alert"[^>]*>[^<]*(rate_limited|unavailable)/);
  expect(html).toContain('Showing the last confirmed configurations.');
  expect(html).toContain('Synthetic first'); expect(html).toContain('Synthetic last');
  expect(html).not.toContain('No visuals loaded from the core.');
  expect(html).not.toContain('Private simulated upstream prose');
  expect(html).toMatch(/<button disabled=""[^>]*>New visual<\/button>/);
  expect(html).toMatch(/<button[^>]*>Refresh Beacons<\/button>/);
  rpc.mockResolvedValueOnce({ visuals: [] });
  await port.load();
  expect(port.getSnapshot().visuals).toEqual([]);
  expect(port.getSnapshot().selected).toBeUndefined();
  const recovered = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  expect(recovered).toContain('No visuals loaded from the core.');
  expect(recovered).not.toContain('role="alert"');
  expect(recovered).not.toContain('Synthetic last');
  unsubscribe();
});

test('a successful empty list still renders No visuals loaded from the core.', async () => {
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async () => ({ visuals: [] }) });
  await port.load();
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  expect(html).toContain('No visuals loaded from the core.');
  expect(html).not.toContain('role="alert"');
});
