import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { fixtureVisuals } from '../../beacons-fixture.js';
import { createAppearanceSession, initialAppearance } from './appearance-state.js';
import { AppearanceControls } from './appearance.jsx';
import { presets } from './presets.js';
import { createBeaconsPreview } from '../../beacons-model.js';

const visual = fixtureVisuals[0];
if (!visual) throw new Error('Missing generated altar');

test('session parameters stay per visual while artwork follows the saved preset, without another style control', () => {
  const session = createAppearanceSession();
  const original = structuredClone(visual);
  const changed = vi.fn(); const stop = session.subscribe(changed);
  session.change(visual.visual_id, 'size', 'L');
  session.change(visual.visual_id, 'anchor', 'bottom-right');
  session.change(visual.visual_id, 'colour', 'azure');
  session.change(visual.visual_id, 'burst_ms', 1200);
  for (const preset of presets) {
    const saved = { ...visual, design_id: preset.id as NonNullable<typeof visual.design_id> };
    const html = renderToStaticMarkup(<AppearanceControls session={session} visual={saved} intensity={0.8} burst="new-burst" />);
    for (const fragment of ['data-size="L"', 'data-anchor="bottom-right"', 'data-colour="azure"',
      'data-burst-ms="1200"', 'data-intensity="0.8"', '--beacon-scale:1', '--beacon-colour:var(--azure)',
      '--beacon-burst-duration:1200ms', preset.url, 'SIMULATED']) expect(html).toContain(fragment);
    expect(html).not.toContain('id="beacon-art-style"');
  }
  expect(visual).toEqual(original);
  expect(session.getSnapshot()['other-visual']).toBeUndefined();
  expect(createAppearanceSession().getSnapshot()[visual.visual_id]).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(4); stop();
  session.change(visual.visual_id, 'size', 'S');
  expect(changed).toHaveBeenCalledTimes(4);
});

test('appearance rejects unsupported colours, anchors, sizes and invalid burst times', () => {
  const session = createAppearanceSession();
  const original = session.getSnapshot();
  for (const [field, value] of [['size', 'XL'], ['anchor', 'elsewhere'], ['colour', '#ffffff'],
    ['burst_ms', -1], ['burst_ms', NaN], ['burst_ms', Infinity],
    ['burst_ms', 1.2], ['burst_ms', 60001]] as const) session.change(visual.visual_id, field, value);
  expect(session.getSnapshot()).toBe(original);
  session.change(visual.visual_id, 'burst_ms', 0);
  expect(session.getSnapshot()[visual.visual_id]).toEqual({ ...initialAppearance, burst_ms: 0 });
});

test('fixture design saves use the port and schema, preserve accounting and survive End test fire', () => {
  const port = createBeaconsPreview();
  const original = port.getSnapshot();
  const first = original.visuals[0];
  if (!first) throw new Error('Missing simulated visual');
  for (const preset of presets) {
    port.design(preset.id);
    const saved = port.getSnapshot();
    expect(saved.visuals[0]).toEqual({ ...first, visual: { ...first.visual, design_id: preset.id } });
    expect(saved.visuals[1]).toBe(original.visuals[1]);
    expect(saved.events).toBe(original.events);
    expect(saved.notice).toContain('SIMULATED');
    expect(saved.notice).toContain('nothing sent to OBS');
  }
  const saved = port.getSnapshot();
  expect(() => port.design('bad/path')).toThrow();
  expect(port.getSnapshot()).toBe(saved);
  port.fire('gift', 50); port.end();
  expect(port.getSnapshot().visuals[0]?.visual.design_id).toBe('preset-glass-frame');
  port.design('');
  expect(port.getSnapshot().visuals[0]?.visual).not.toHaveProperty('design_id');
  port.design('my-custom');
  expect(port.getSnapshot().visuals[0]?.visual.design_id).toBe('my-custom');
});
