import type { Snapshot } from '../../model.js';
import type { CustomHost } from '../../custom-design/seal.js';
import { keptLine } from '../../custom-design/seal.js';
import { sealedLooks } from '../../custom-design/sealed.js';
import { gatehousePort } from './core-port.js';

/** Gatehouse: fixture dresses the herald's SIMULATED bar for the session; core sets the vote bar design. */
export function moderatorCustomHost(snapshot: Snapshot): CustomHost {
  return {
    fixture(choice) {
      sealedLooks.set('vote_bar', choice.library_id);
      return { say: `Sealed. The vote bar preview wears "${choice.style_name}" for this session. No OBS source in fixture mode.`, lines: [keptLine(false)] };
    },
    async core(design_id, choice) {
      const port = gatehousePort(snapshot);
      if (!port) throw new Error('The Gatehouse core connection is unavailable.');
      await port.setVoteBarDesign(design_id);
      if (port.getSnapshot().phase === 'error') throw new Error('The core refused the vote bar art. Nothing changed.');
      return { say: `Sealed. The vote bar on stream now wears "${choice.style_name}".`, lines: [keptLine(true)],
        chips: [{ label: 'Show the vote bar', action: { kind: 'flow', chamber: 'moderator', flow: 'gatehouse-votebar' } }] };
    },
  };
}
