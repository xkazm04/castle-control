import { afterEach, expect, test, vi } from 'vitest';
import { componentProbe } from '../moderator/component-probe.jsx';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createBeaconsPreview } from '../../beacons-model.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { VisualsWork } from './room.jsx';
import { ConnectedBeacons } from './core.jsx';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
    expect(html.match(/data-role="room-section"/g)).toHaveLength(3); // Two columns plus hidden full comparison.
    expect(html).toContain('Preview · drafts only');
    expect(html).toContain('Program · SIMULATED');
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    const compact = html.slice(html.indexOf('visuals-plates--compact'), html.indexOf('visuals-drawer-trigger'));
    expect(compact.match(/role="radio"/g)).toHaveLength(3);
    expect(compact.match(/class="visuals-stair"/g)).toHaveLength(1);
    expect(compact.match(/Show in the picture/g)).toHaveLength(2);

    probe.click('More of the beacons');
    const opened = probe.render();
    expect(opened).toContain('aria-haspopup="dialog" aria-expanded="true"');
    const drawer = opened.slice(opened.indexOf('role="dialog"'));
    for (const content of ['Every beacon, every tier', 'Night replay', 'Kindling curve editor',
      'Beacon appearance preview', 'Contribution feed', 'Copy browser-source URL for Offering altar']) {
      expect(drawer).toContain(content);
    }
    expect(drawer.match(/class="visuals-stair"/g)).toHaveLength(3);
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
    probe.click('Halve the decay');
    const decay = port.getSnapshot().visuals[0]?.visual.curve.decay;
    expect(decay).toEqual({ kind: 'exponential', half_life_s: 150 });
    expect(port.getSnapshot().visuals[0]?.total).toBe(before?.total);
    probe.click('Tonight’s theme');
    expect(probe.render()).toContain('role="dialog"');
  } finally { probe.dispose(); }
});
