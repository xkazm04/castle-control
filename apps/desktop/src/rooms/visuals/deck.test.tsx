import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { componentProbe } from '../moderator/component-probe.jsx';
import { keyFor } from '../../shell/steward-keys.jsx';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createBeaconsPreview } from '../../beacons-model.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { VisualsWork } from './room.jsx';
import { ConnectedBeacons } from './core.jsx';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('Beacons body typography uses 15 px and 1.45 leading without changing keycaps or headings', () => {
  const css = readFileSync(new URL('./readability.css', import.meta.url), 'utf8');
  expect(css).toContain('font-size: var(--text-px-15);');
  expect(css).toContain('line-height: 1.45;');
  expect(css).toContain('label, input, select, textarea, output');
  expect(css).toContain('span:not(.cc-control-key, .cc-control-key *');
  expect(css).not.toMatch(/font-size:\s*(?:1[0-4]px|var\(--text-px-1[0-4]\))/);
  const deck = readFileSync(new URL('./deck.css', import.meta.url), 'utf8');
  expect(deck).toContain('.visuals-stage__read { gap: var(--space-8); }');
  expect(deck).toContain('var(--text-px-15)/1.45 var(--font-text)');
});

function focusEnvironment() {
  class FocusTarget { isConnected = true; focus = vi.fn(); }
  vi.stubGlobal('HTMLElement', FocusTarget);
  vi.stubGlobal('document', { activeElement: new FocusTarget() });
}

test('fixture chamber has one picture, two section columns, minis, and reachable drawer tools', () => {
  focusEnvironment();
  const port = createBeaconsPreview();
  const probe = componentProbe(() => <VisualsWork port={port} queue={new ProposalQueue()} />);
  try {
    const html = probe.render();
    expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
    expect(html.match(/class="cc-chamber-column"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Room sections 1"');
    expect(html).toContain('aria-label="Room sections 2"');
    expect(html.match(/data-role="room-section"/g)).toHaveLength(4); // Two columns plus reading details/full comparison in the drawer.
    expect(html).toContain('Preview · drafts only');
    expect(html).toContain('Program · SIMULATED');
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    const compact = html.slice(html.indexOf('visuals-plates--compact'), html.indexOf('visuals-drawer-trigger'));
    expect(compact.match(/role="radio"/g)).toHaveLength(3);
    for (const index of [0, 1, 2]) expect(compact).toContain(`cc-key-badge">${keyFor('visuals', `beacon_${index}`)}</kbd>`);
    expect(compact).not.toContain('class="visuals-stair"');
    expect(compact).not.toContain('gift weighting');
    expect(compact.match(/Show in the picture/g)).toHaveLength(2);
    expect(compact).not.toContain('class="visuals-plates"');
    expect(compact).not.toContain('cc-hero-readout');
    expect(compact.match(/class="visuals-beacon-blaze"/g)).toHaveLength(3);
    const actions = html.slice(html.indexOf('visuals-primary-actions'), html.indexOf('aria-label="Room sections 2"'));
    expect(actions.match(/<button/g)).toHaveLength(2);
    for (const action of ['test', 'replay']) expect(actions).toContain(`cc-key-badge">${keyFor('visuals', action)}</kbd>`);
    expect(actions).not.toContain('Halve the decay');
    const reading = html.slice(html.indexOf('visuals-stage__read'), html.indexOf('visuals-primary-actions'));
    expect(reading).not.toContain('visuals-stage__notice');
    expect(reading).not.toContain('visuals-stage__tags');
    expect(reading).not.toContain('Sample night · peaks');
    expect(html).toContain(`cc-key-badge">${keyFor('visuals', 'tune')}</kbd>`);
    expect(actions).not.toContain('Tonight’s theme');
    expect(actions).not.toContain('Tune this beacon');

    probe.click('More of the beacons');
    const opened = probe.render();
    expect(opened).toContain('aria-haspopup="dialog" aria-expanded="true"');
    const drawer = opened.slice(opened.indexOf('role="dialog"'));
    for (const content of ['Every beacon, every tier', 'Night replay', 'Kindling curve editor',
      'Beacon appearance preview', 'Contribution feed', 'Copy browser-source URL for Offering altar',
      'Tonight’s theme', 'Tune this beacon', 'Halve the decay', 'Reading and sample night',
      'Sample night · peaks', 'Simulated snapshot', '1× gift weighting']) {
      expect(drawer).toContain(content);
    }
    expect(drawer.match(/class="visuals-stair"/g)).toHaveLength(3);
    expect(drawer).toContain(`cc-key-badge">${keyFor('visuals', 'decay')}</kbd>`);
    expect(drawer).toContain('aria-rowcount="600"');
    expect(drawer.match(/data-contribution-row=/g)?.length).toBeLessThan(20);
    probe.click('Close');
    expect(probe.render()).not.toContain('role="dialog"');
  } finally { probe.dispose(); }
});

test('core chamber uses the same frame and opens configuration, curve and live feed in its drawer', async () => {
  focusEnvironment();
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async (_endpoint, _session, method) => method === 'beacons.visual.list' ? { visuals: [{
      visual_id: 'simulated-deck', name: 'SIMULATED deck',
      curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } },
    }] } : { contributions: [] } });
  await port.load();
  const probe = componentProbe(() => <ConnectedBeacons port={port} />);
  try {
    const html = probe.render();
    expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
    expect(html.match(/class="cc-chamber-column"/g)).toHaveLength(2);
    expect(html).toContain('Program · core configuration');
    expect(html).toContain('live total shows on stream');
    expect(html).not.toContain('Gift-sub weighting');
    await vi.waitFor(() => expect(port.getSnapshot().phase).toBe('ready'));
    probe.click('More of the beacons');
    const opened = probe.render();
    const drawer = opened.slice(opened.indexOf('role="dialog"'));
    for (const content of ['Every beacon, every tier', 'Core configurations', 'Kindling curve editor',
      'Live contribution feed', 'Copy browser-source URL']) expect(drawer).toContain(content);
  } finally { probe.dispose(); }
});

test('the fixture weighting slider and decay action change the existing preview model', () => {
  focusEnvironment();
  const port = createBeaconsPreview();
  const probe = componentProbe(() => <VisualsWork port={port} queue={new ProposalQueue()} />);
  try {
    probe.render();
    probe.change('Gift-sub weighting', '3');
    const before = port.getSnapshot().visuals[0];
    expect(before?.gift_weight).toBe(3);
    probe.click('More of the beacons'); probe.render();
    probe.click('Halve the decay');
    const decay = port.getSnapshot().visuals[0]?.visual.curve.decay;
    expect(decay).toEqual({ kind: 'exponential', half_life_s: 150 });
    expect(port.getSnapshot().visuals[0]?.total).toBe(before?.total);
    const html = probe.render();
    const drawer = html.slice(html.indexOf('role="dialog"'));
    expect(drawer).toContain('Tonight’s theme');
    expect(drawer).toContain('Beacon appearance preview');
  } finally { probe.dispose(); }
});
