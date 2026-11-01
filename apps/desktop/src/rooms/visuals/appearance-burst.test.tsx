import { expect, test } from 'vitest';
import { componentProbe } from '../moderator/component-probe.jsx';
import { fixtureVisuals } from '../../beacons-fixture.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { createAppearanceSession, initialAppearance } from './appearance-state.js';
import { AppearanceControls } from './appearance.jsx';

const visual = fixtureVisuals[0];
if (!visual) throw new Error('Missing generated altar');

test('burst timing can be cleared and retyped without committing an empty value', () => {
  const session = createAppearanceSession();
  const h = componentProbe(() => <AppearanceControls session={session} visual={visual} intensity={0.5} />);
  const shown = (html: string) => /id="beacon-burst-ms"[^>]*value="([^"]*)"/.exec(html)?.[1];
  expect(shown(h.render())).toBe(String(initialAppearance.burst_ms));
  h.change(copy.burst_timing, '');
  expect(shown(h.render())).toBe('');
  expect(session.getSnapshot()[visual.visual_id]).toBeUndefined();
  h.change(copy.burst_timing, '9'); h.render(); h.change(copy.burst_timing, '900');
  expect(shown(h.render())).toBe('900');
  expect(session.getSnapshot()[visual.visual_id]?.burst_ms).toBe(900);
  h.dispose();
});
