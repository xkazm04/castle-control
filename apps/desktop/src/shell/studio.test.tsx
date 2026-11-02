import { renderToReadableStream } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { coreTiltyardConnection, createDesktopClient } from '../client.js';
import type { Network } from '../core-source.js';
import type { GatehouseNetwork } from '../gatehouse-core.js';
import type { Snapshot } from '../model.js';
import Room from './room.jsx';

async function render(snapshot: Snapshot) {
  const stream = await renderToReadableStream(<Room chamber="studio" replay={false} snapshot={snapshot}
    origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
  await stream.allReady;
  return new Response(stream).text();
}

test('the shell routes a core studio connection through the lazy duel stage', async () => {
  const network = { socket: vi.fn<Network['socket']>(), rpc: vi.fn<Network['rpc']>() };
  const gatehouse = { rpc: vi.fn<GatehouseNetwork['rpc']>() };
  const client = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    network, undefined, gatehouse);
  const snapshot = client.getSnapshot();
  expect(snapshot.mode).toBe('core'); expect(coreTiltyardConnection(snapshot)).toBeDefined();
  const html = await render(snapshot);
  expect(html).toContain('data-role="ty-duel"');
  expect(html).toContain('aria-label="The duel stage"');
  expect(html).toContain('No duel on the core yet');
  expect(html).toContain('The sample uses SAMPLE starter contestants.');
  expect(html).toContain('aria-label="Seal slot"');
  expect(html).not.toContain('The map table is bare');
  expect(network.socket).not.toHaveBeenCalled(); expect(network.rpc).not.toHaveBeenCalled();
  expect(gatehouse.rpc).not.toHaveBeenCalled();
});

test('the shell keeps the bare-map state when core studio has no connection', async () => {
  const snapshot = { mode: 'core', phase: 'ready' } as const;
  expect(coreTiltyardConnection(snapshot)).toBeUndefined();
  const html = await render(snapshot);
  expect(html).toContain('The map table is bare');
  expect(html).toContain('aria-label="Seal slot"');
  expect(html).not.toContain('data-role="ty-duel"');
});
