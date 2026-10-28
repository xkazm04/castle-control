import { readFileSync } from 'node:fs';
import { lazy, Suspense } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import Room, { VisualsWork } from './room.jsx';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { tokens } from '@castle-control/tokens';

test('Beacons stage has an inner token inset, captioned artwork and a model-driven active tier', () => {
  const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  const inset = style.match(/\.visuals-room-workbench(?:,\s*\.visuals-room-details)?\s*\{[^}]*\bpadding:\s*var\(--(space-\d+)\)/)?.[1];
  expect(inset).toBeDefined();
  expect(Number.parseFloat(tokens.layout[inset as keyof typeof tokens.layout])).toBeGreaterThan(0);
  expect(style).not.toMatch(/\.visuals-room-workbench\s*\{[^}]*\bpadding:\s*0[;\s}]/);
  expect(style).toMatch(/\.visuals-room-tier-active\s*\{[^}]*background:\s*var\(--or\)/);
  const port = createBeaconsPreview();
  const markup = () => renderToStaticMarkup(<VisualsWork port={port} />);
  const before = markup();
  expect(before).toContain('<figcaption');
  expect(before).toContain('The kindling curve');
  expect(before.match(/class="visuals-room-tier-active"/g)).toHaveLength(3);
  expect(before).toContain('Now:');
  // Each model selects its own interval. A burst moves only the selected card's tier.
  const firstCard = (html: string) => html.match(/<article>[\s\S]*?<\/article>/)?.[0] ?? '';
  expect(firstCard(before)).toContain('data-tier-start="10" class="visuals-room-tier-active"');
  port.fire('gift', 50);
  const after = markup();
  expect(firstCard(after)).toContain('data-tier-start="30" class="visuals-room-tier-active"');
  expect(firstCard(after)).not.toContain('data-tier-start="100" class="visuals-room-tier-active"');
  port.fire('gift', 50);
  expect(firstCard(markup())).toContain('data-tier-start="100" class="visuals-room-tier-active"');
});

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

test('Beacons columns share even panel insets and a section rhythm without changing region order', () => {
  const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  const columns = style.match(/\.visuals-room-workbench,\s*\.visuals-room-details\s*\{([^}]+)\}/)?.[1];
  expect(columns).toBeDefined();
  expect(columns).toContain('padding: var(--space-24)');
  expect(columns).toContain('gap: var(--space-24)');
  expect(columns).toContain('flex-direction: column');
  expect(style).toMatch(/\.visuals-room-workbench > \*,\s*\.visuals-room-details > \*\s*\{[^}]*flex-shrink: 0;[^}]*margin-block: 0/);
  expect(style).toMatch(/\.visuals-room-details > \.shell-seal-slot\s*\{[^}]*margin-block: 0/);
  expect(style).toMatch(/\.visuals-room-visuals\s*\{[^}]*gap: var\(--space-16\)/);
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  const regions = ['class="visuals-room-workbench"', 'class="visuals-room-layer"',
    'class="visuals-room-curve"', 'class="visuals-room-test-tools"', 'class="visuals-room-details"',
    'aria-label="Beacon visuals"', 'aria-label="Illustrative offerings timeline"', 'aria-label="Contribution feed"'];
  const positions = regions.map(region => html.indexOf(region));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
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
