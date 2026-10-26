import { lazy, Suspense } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import Room, { StudioWork } from './room.jsx';
import { fixtureTiles } from './fixture.js';

test('fixture studio shows all 54 hexes and the local-only test ladder', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  expect(fixtureTiles).toHaveLength(54);
  expect(html.match(/data-hex-tile=/g)).toHaveLength(54);
  for (const text of ['9 × 6', 'Sand table', 'Muster', 'Proclaimed', 'WP 4.0', 'SIMULATED']) expect(html).toContain(text);
  expect(html).not.toContain('Hold to seal');
  expect(html).not.toContain('Approve the move');
});

test('core studio is honestly unconfigured and hides all sample controls', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'connecting' }} />);
  expect(html).toContain('Map Room is not configured');
  expect(html).not.toContain('data-hex-tile');
  expect(html).not.toContain('<button');
});

test('war-table proposals stay in dashed draft layers without claiming a tile or advancing the ladder', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  const before = JSON.stringify(fixtureTiles);
  await steward.ask('what should the next turn be', { surface: 'room', chamber: 'studio' });
  await steward.ask('test fire 50 gifts', { surface: 'room', chamber: 'visuals' });
  const html = renderToStaticMarkup(<StudioWork queue={queue} />);
  expect(html).toContain('room-proposal-draft');
  expect(html).toContain('DRAFT · NOT ON AIR');
  expect(html).toContain('data-on-air="false"');
  expect(html).not.toContain('50 gifts');
  expect(html).toContain('Current stage: Sand table');
  expect(queue.pending('studio')).toHaveLength(1);
  expect(JSON.stringify(fixtureTiles)).toBe(before);
});

test('default module loads lazily with no network or submission action', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const LazyRoom = lazy(() => import('./room.jsx'));
    const stream = await renderToReadableStream(<Suspense fallback={<p>Opening</p>}>
      <LazyRoom snapshot={{ mode: 'fixture', phase: 'ready' }} />
    </Suspense>);
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(html).toContain('WP 4.0');
    expect(html).not.toContain('\u2014');
    expect(html).not.toContain('Submit');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
