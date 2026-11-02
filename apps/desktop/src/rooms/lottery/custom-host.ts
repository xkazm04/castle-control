import { proposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import type { CustomHost } from '../../custom-design/seal.js';
import { keptLine } from '../../custom-design/seal.js';
import { sealedLooks } from '../../custom-design/sealed.js';
import { corePort } from './flow-core.js';
import { lotterySession } from './session.js';

/** Lot Chamber: fixture dresses the session's draw preview; core saves the selected draw's display with art_design. */
export function lotteryCustomHost(snapshot: Snapshot): CustomHost {
  return {
    fixture(choice) {
      lotterySession(proposalQueue).display.edit({ art_preset: choice.library_id });
      sealedLooks.set('draw_vessel', choice.library_id);
      return { say: `Sealed. The draw vessel preview wears "${choice.style_name}" for this session.`, lines: [keptLine(false)] };
    },
    async core(design_id, choice) {
      const port = await corePort(snapshot);
      const draw = port.getSnapshot().draw;
      if (!draw) throw new Error('Set up a draw first: the vessel art belongs to a draw.');
      port.appearance(draw.draw_id).edit({ art_design: design_id, ...(choice.library_id ? { art_preset: choice.library_id } : {}) });
      await port.saveDisplay();
      if (port.getSnapshot().draw === draw) throw new Error('The core refused the vessel art. Nothing changed.');
      return { say: `Sealed. ${draw.name} now draws from "${choice.style_name}".`, lines: [keptLine(true)] };
    },
  };
}
