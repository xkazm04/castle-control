import { readFileSync } from 'node:fs';
import { lazy, Suspense } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import Room, { VisualsWork } from './room.jsx';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { createBeaconsPreview } from '../../beacons-model.js';

test('fixture room contains the altar, frames, border, 60 offerings and local test fire', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  for (const text of ['Offering altar', 'Gilded camera frame', 'Hype border', '60 offerings', 'Test fire']) {
    expect(html).toContain(text);
  }
  expect(fixtureOfferings).toHaveLength(60);
  expect(html.match(/data-offering-mark=/g)).toHaveLength(60);
  expect(html).not.toContain('Hold to seal');
  expect(html).not.toContain('visuals-room-notice');
});

test('core mode never shows simulated controls or a fixture proposal', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'ready' }} />);
  expect(html).toContain('Beacons are not configured');
  expect(html).not.toContain('data-offering-mark');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('Test fire');
});

test('visual proposals remain dashed drafts, re-ink amendments and never change preview accounting', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  const port = createBeaconsPreview();
  const baseline = port.getSnapshot();
  const turn = await steward.ask('test fire 50 gifts', { surface: 'room', chamber: 'visuals' });
  const proposal = turn.proposals[0];
  if (!proposal) throw new Error('Expected simulated proposal');
  queue.amend(proposal.id, [{ key: 'gifts', value: 10 }]);
  const html = renderToStaticMarkup(<VisualsWork queue={queue} port={port} />);
  expect(html).toContain('room-proposal-draft');
  expect(html).toContain('DRAFT · NOT ON AIR');
  expect(html).toContain('data-on-air="false"');
  expect(html).toContain('<s>50</s>');
  expect(html).toContain('10');
  expect(queue.pending('visuals')).toHaveLength(1);
  expect(port.getSnapshot()).toBe(baseline);
  queue.tearUp(proposal.id);
  expect(renderToStaticMarkup(<VisualsWork queue={queue} port={port} />)).not.toContain('data-proposal-layer');
});

test('default module can load lazily without the shell or a transport and drafts have a dashed CSS border', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const LazyRoom = lazy(() => import('./room.jsx'));
    const stream = await renderToReadableStream(<Suspense fallback={<p>Opening</p>}>
      <LazyRoom snapshot={{ mode: 'fixture', phase: 'ready' }} />
    </Suspense>);
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(html).toContain('60 offerings');
    expect(html).not.toContain('\u2014');
    expect(network).not.toHaveBeenCalled();
    const style = readFileSync(new URL('./proposal-layers.css', import.meta.url), 'utf8');
    expect(style).toMatch(/\.room-proposal-draft\s*\{[^}]*border:[^;]*dashed/);
  } finally { network.mockRestore(); }
});
