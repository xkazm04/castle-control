import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { counted } from './inventory.ts';

export const visualId = 'simulated-frame';
export const snapshotEvent = 'beacons.render.snapshot';

export async function simulatedSnapshots(): Promise<string[]> {
  // Import the worktree's real public parser implementation at runtime. This
  // avoids a root workspace dependency and never bypasses the contract door.
  const parserUrl = new URL('../packages/contract/src/generated/beacons-render-validation.ts', import.meta.url);
  const parser: unknown = await import(parserUrl.href);
  if (!parser || typeof parser !== 'object' || !('parseBeaconsRenderSnapshot' in parser)
    || typeof parser.parseBeaconsRenderSnapshot !== 'function') throw new Error('Snapshot contract parser unavailable');
  const parseSnapshot = parser.parseBeaconsRenderSnapshot;
  const layers = [{ kind: 'text', text: 'SIMULATED · Castle Control e2e',
    properties: { x: 24, y: 24, width: 360, height: 80, scale: 1, opacity: 1 },
    bindings: [{ property: 'opacity', output_range: { at_zero: 0.25, at_one: 1 } }] }];
  const content_hash = createHash('sha256').update(JSON.stringify(layers)).digest('hex');
  const snapshots = [0.25, 0.75].map(intensity => {
    const wire = JSON.stringify({
      simulated: true,
      visual: { visual_id: visualId, name: 'SIMULATED e2e visual', design_id: 'simulated-art',
        curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } } },
      intensity: { visual_id: visualId, intensity },
      package: { design_id: 'simulated-art', content_hash, layers },
    });
    const accepted: unknown = parseSnapshot(wire);
    return JSON.stringify(accepted);
  });
  counted('contract-parsed simulated snapshots', snapshots.length);
  return snapshots;
}

export async function startOverlay(): Promise<{ url: string; close: () => Promise<void>; pushes: () => number }> {
  const snapshots = await simulatedSnapshots();
  const html = readFileSync(new URL('../apps/overlay/index.html', import.meta.url));
  const bundle = readFileSync(new URL('../apps/overlay/bundle.js', import.meta.url));
  counted('static overlay assets', [html, bundle].filter(bytes => bytes.length > 0).length);
  const streams = new Set<ServerResponse>();
  let pushes = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'");
    if (url.pathname === `/beacons/${visualId}` || url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
    } else if (url.pathname === '/bundle.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(bundle);
    } else if (url.pathname === '/favicon.ico') {
      response.writeHead(204); response.end();
    } else if (url.pathname === '/push/beacons' && url.searchParams.get('visual_id') === visualId) {
      pushes++;
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      streams.add(response);
      response.write(`event: ${snapshotEvent}\ndata: ${snapshots[0]}\n\n`);
      const timer = setTimeout(() => response.write(`event: ${snapshotEvent}\ndata: ${snapshots[1]}\n\n`), 100);
      response.on('close', () => { clearTimeout(timer); streams.delete(response); });
    } else { response.writeHead(404); response.end('Not a simulated overlay resource'); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Overlay did not bind loopback');
  return {
    url: `http://127.0.0.1:${address.port}`,
    pushes: () => pushes,
    close: () => new Promise<void>((resolve, reject) => {
      for (const stream of streams) stream.end();
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
