import { readFileSync } from 'node:fs';
import { lazy, Suspense } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import Room, { VisualsWork } from './room.jsx';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { tokens } from '@castle-control/tokens';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';
import { ArtControls } from './art.jsx';
import { createArtGeneration } from './art-state.js';

test('fixture and core Beacons markup never place an h2 after an h3 inside .visuals-bench', async () => {
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async () => ({ visuals: [{ visual_id: 'synthetic-heading', name: 'Synthetic heading',
      curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } },
    }] }) });
  await port.load();
  for (const room of [<VisualsWork />, <ConnectedBeacons port={port} />]) {
    const html = renderToStaticMarkup(room);
    const bench = html.slice(html.indexOf('visuals-bench'), html.indexOf('visuals-room-details'));
    expect(bench).toContain('<h3');
    expect(bench).not.toMatch(/<h[12](?:\s|>)/);
    expect(bench).not.toMatch(/<h[45][^>]*>[^<]*(The kindling curve|Test fire|Driven by)/);
  }
});

test('art outside the bays sits below the h2 configuration panel and its receipts sit below art', async () => {
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async () => ({ visuals: [{ visual_id: 'synthetic-art-heading', name: 'Synthetic art heading',
      curve: { ranges: [{ total: 0, intensity: 0 }], decay: { kind: 'none' } },
    }] }) });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Missing synthetic visual');
  const art = createArtGeneration(port, visual.design_id);
  const html = renderToStaticMarkup(<ArtControls art={art} visual={visual} state={{ ...art.getSnapshot(),
    result: { design_id: 'synthetic-design' as NonNullable<typeof visual.design_id>, assets: [], costs: [] },
  }} />);
  expect(html).toContain('<h3>Generate art</h3>');
  expect(html).toContain('<h4>Returned assets</h4>');
  expect(html).toContain('<h4>Cost receipt from core</h4>');
  expect(html).not.toContain('<h2>');
});

// C replaces the standalone figure and boxed tiers with literal radio plates and stair ramps.
test('C plate inset and active stairs track the unchanged preview totals', () => {
  const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(style).toContain('padding: var(--space-20) var(--space-24) var(--space-28)');
  expect(Number.parseFloat(tokens.layout['space-24'])).toBeGreaterThan(0);
  expect(style).toContain('clip-path: polygon(0 100%, 0 calc((1 - var(--from)) * 100%)');
  expect(style).toContain('background: var(--or)');
  const port = createBeaconsPreview();
  const markup = () => renderToStaticMarkup(<VisualsWork port={port} />);
  const before = markup();
  expect(before).toContain('<figcaption');
  expect(before).toContain('The kindling curve');
  expect(before.match(/data-state="active"/g)).toHaveLength(3);
  const firstCard = (html: string) => html.match(/<button[^>]*role="radio"[\s\S]*?<\/button>/)?.[0] ?? '';
  expect(firstCard(before)).toContain('data-tier-start="10" data-state="active"');
  port.fire('gift', 50);
  const after = markup();
  expect(firstCard(after)).toContain('data-tier-start="30" data-state="active"');
  expect(firstCard(after)).not.toContain('data-tier-start="100" data-state="active"');
  port.fire('gift', 50);
  expect(firstCard(markup())).toContain('data-tier-start="100" data-state="active"');
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

// C has one scrolling board and a lower panel row; the previous two-column rhythm is superseded.
test('C regions remain compare, tune, timeline, feed, then the original seal slot', () => {
  const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(style).toMatch(/\.visuals-board\s*\{[^}]*overflow: auto;[^}]*flex-direction: column/);
  expect(style).toMatch(/\.visuals-board > \*\s*\{[^}]*flex-shrink: 0/);
  expect(style).toContain('padding: var(--space-20) var(--space-24) var(--space-28)');
  const html = renderToStaticMarkup(<VisualsWork seal_slot={<aside className="shell-seal-slot" aria-label="Seal slot" />} />);
  const regions = ['class="visuals-plates"', 'visuals-bench', 'The kindling curve', 'visuals-fire-grid',
    'visuals-room-details', 'aria-label="Illustrative offerings timeline"', 'aria-label="Contribution feed"', 'aria-label="Seal slot"'];
  const positions = regions.map(region => html.indexOf(region));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
  expect(html).toContain('</aside></div></div>');
  expect(style).toMatch(/\.visuals-seal-panel\s*\{[^}]*border: var\(--rule-medium\) solid var\(--ink\)/);
  const frame = style.match(/\.visuals-seal-panel\s*\{([^}]+)\}/)?.[1];
  expect(frame).not.toMatch(/padding|border-top/);
  expect(style).toMatch(/\.visuals-seal-panel > \.shell-seal-slot\s*\{[^}]*padding: var\(--space-12\) var\(--space-14\) var\(--space-14\); border-top: 0/);
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
