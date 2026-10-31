import { chambers } from '@castle-control/ui';
import type { ChamberLayerState, ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import type { Snapshot } from '../model.js';
import { keepReadModel } from '../keep/read-model.js';

/** The Overview and persistent strip project the same authoritative readings. */
export function stripStates(snapshot: Snapshot, proposals: readonly Proposal[], program: readonly Proposal[], display: 'word' | 'line' = 'word'): Record<ModuleId, ChamberLayerState> {
  const read = keepReadModel(snapshot);
  const pending = proposals.filter(isPending);
  return Object.fromEntries(chambers.map(({ id }) => {
    const drafts = pending.filter(item => item.chamber === id);
    const draft = drafts.at(-1);
    const aired = program.find(item => item.chamber === id);
    return [id, { ...(display === 'word' ? { word: read.states[id].word } : {}),
      line: draft ? `${draft.title} · rev ${draft.revision}` : aired ? `${aired.title} · simulated Program` : read.states[id].line,
      on_air: Boolean(aired) || snapshot.mode === 'fixture' && (id === 'moderator' || id === 'visuals'),
      preview: true, draft: Boolean(draft), pending_count: drafts.length }];
  })) as Record<ModuleId, ChamberLayerState>;
}
