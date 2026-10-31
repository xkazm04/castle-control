import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { art, styles } from '../../demo/model.js';
import { fixtureVisuals } from '../../beacons-fixture.js';
import { createAppearanceSession, initialAppearance } from './appearance-state.js';
import { AppearanceControls } from './appearance.jsx';

const visual = fixtureVisuals[0];
if (!visual) throw new Error('Missing generated altar');

test('appearance choices stay per visual and use only the six kept styles without changing saved data', () => {
  const session = createAppearanceSession();
  const original = structuredClone(visual);
  const changed = vi.fn(); const stop = session.subscribe(changed);
  session.change(visual.visual_id, 'size', 'L');
  session.change(visual.visual_id, 'anchor', 'bottom-right');
  session.change(visual.visual_id, 'colour', 'azure');
  session.change(visual.visual_id, 'burst_ms', 1200);
  for (const style of styles) {
    session.change(visual.visual_id, 'art_style', style.id);
    const html = renderToStaticMarkup(<AppearanceControls session={session} visual={visual} intensity={0.8} burst="new-burst" />);
    for (const fragment of ['data-size="L"', 'data-anchor="bottom-right"', 'data-colour="azure"',
      'data-burst-ms="1200"', 'data-intensity="0.8"', '--beacon-scale:1', '--beacon-colour:var(--azure)',
      '--beacon-burst-duration:1200ms', art(style.id, 'altar'), 'SIMULATED']) expect(html).toContain(fragment);
  }
  expect(visual).toEqual(original);
  expect(session.getSnapshot()['other-visual']).toBeUndefined();
  expect(createAppearanceSession().getSnapshot()[visual.visual_id]).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(10); stop();
  session.change(visual.visual_id, 'size', 'S');
  expect(changed).toHaveBeenCalledTimes(10);
});

test('appearance rejects unsupported styles, colours, anchors, sizes and invalid burst times', () => {
  const session = createAppearanceSession();
  const original = session.getSnapshot();
  for (const [field, value] of [['size', 'XL'], ['anchor', 'elsewhere'], ['colour', '#ffffff'],
    ['art_style', 'unkept'], ['burst_ms', -1], ['burst_ms', NaN], ['burst_ms', Infinity],
    ['burst_ms', 1.2], ['burst_ms', 60001]] as const) session.change(visual.visual_id, field, value);
  expect(session.getSnapshot()).toBe(original);
  session.change(visual.visual_id, 'burst_ms', 0);
  expect(session.getSnapshot()[visual.visual_id]).toEqual({ ...initialAppearance, burst_ms: 0 });
});
