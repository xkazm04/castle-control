import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createBeaconsPreview } from '../../beacons-model.js';
import { VisualsWork } from './room.jsx';

test('fixture journey exposes editable points, decay and gift weighting', () => {
  const html = renderToStaticMarkup(<VisualsWork />);
  for (const label of ['Kindling curve editor', 'Control point 2:', 'Half-life (seconds)', 'Gift-sub weighting',
    'Save curve locally']) expect(html).toContain(label);
});

test('fixture journey exposes keyboard-accessible appearance controls and the six kept altar styles', () => {
  const html = renderToStaticMarkup(<VisualsWork />);
  for (const label of ['Size', 'Anchor', 'Colour', 'Art style', 'Burst timing (ms)', 'Beacon appearance preview',
    'Heraldic', 'Arcade', 'Neon', 'Storybook', 'Cel', 'Glass']) expect(html).toContain(label);
  expect(html).toContain('/art/preset-heraldic-altar.webp');
  expect(html).toContain('Session preview only');
});

test('fixture journey offers an explicitly simulated source copy, never a live URL claim', () => {
  const html = renderToStaticMarkup(<VisualsWork />);
  expect(html).toContain('Copy browser-source URL for Offering altar');
  expect(html).toContain('SIMULATED example');
});

test('ending a test fire preserves the selected configuration and resets simulated accounting', () => {
  const port = createBeaconsPreview();
  const initial = port.getSnapshot();
  const second = initial.visuals[1];
  if (!second) throw new Error('Missing generated visual');
  port.select(second.visual.visual_id);
  port.point(1, { total: 12, intensity: 0.7 });
  port.decay({ kind: 'exponential', half_life_s: 60 });
  port.weight(2);
  const configured = port.getSnapshot().visuals[1];
  port.fire('gift', 50); port.advance();
  expect(port).toHaveProperty('end');
  port.end();
  const ended = port.getSnapshot();
  expect(ended.selected).toBe(second.visual.visual_id);
  expect(ended.visuals[1]?.visual).toEqual(configured?.visual);
  expect(ended.visuals[1]?.gift_weight).toBe(2);
  expect(ended.visuals[1]?.total).toBe(second.total);
  expect(ended.events).toEqual(initial.events);
  expect(ended.elapsed_s).toBe(0);
  expect(ended.notice).toContain('Test fire ended');
});
