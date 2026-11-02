import type { Snapshot } from '../../model.js';
import { coreBeaconsConnection } from '../../client.js';
import type { CustomHost } from '../../custom-design/seal.js';
import { keptLine } from '../../custom-design/seal.js';
import { library_prefix } from '../../custom-design/presets.js';
import { lightVisual } from './core-flows.js';
import { fixtureBeacons } from './stage-state.js';

const testFire = { label: 'Test fire', action: { kind: 'flow', chamber: 'visuals', flow: 'visuals-test-fire' } } as const;

/** Beacons: fixture dresses the sample altar or camera frame; core saves a new visual wearing the design. */
export function visualsCustomHost(snapshot: Snapshot): CustomHost {
  return {
    fixture(choice) {
      const beacons = fixtureBeacons();
      const id = choice.kind === 'beacon' ? 'offering-altar' : 'gilded-frame';
      const target = beacons.getSnapshot().visuals.find(item => item.visual.visual_id === id);
      if (!target) throw new Error('No sample beacon to dress.');
      beacons.select(target.visual.visual_id);
      beacons.design(`${library_prefix}${choice.library_id}`);
      return { say: `Sealed. The ${target.visual.name} now wears "${choice.style_name}" in this preview. Test fire it to watch it react.`,
        lines: [keptLine(false)], chips: [testFire] };
    },
    async core(design_id, choice) {
      const port = coreBeaconsConnection(snapshot)?.port;
      if (!port) throw new Error('The Beacons core connection is unavailable.');
      if (!port.getSnapshot().visuals.length) await port.load();
      const look = choice.kind === 'beacon' ? 'altar' : 'frame';
      const visual = { ...lightVisual({ look }, port.getSnapshot().visuals), name: choice.style_name, design_id };
      await port.upsert({ visual });
      if (port.getSnapshot().phase === 'error') throw new Error('The core refused the new beacon. Nothing changed.');
      return { say: `Sealed. "${choice.style_name}" is a new ${choice.kind === 'beacon' ? 'beacon' : 'camera frame'} in your core. Copy its browser source from More.`,
        lines: [keptLine(true)], chips: [testFire] };
    },
  };
}
