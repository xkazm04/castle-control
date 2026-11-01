import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { keepReadModel } from '../keep/read-model.js';

/**
 * The default Steward for a chamber room: its name, a greeting, chamber words
 * for the free-text matcher and a "Catch me up" beat from the Keep's read model.
 * A module spreads this and adds its own `flows` and `demo`.
 */
export function roomSteward(id: ModuleId, snapshot: Snapshot, keywords: readonly string[]): ChamberSteward {
  const chamber = chambers.find(item => item.id === id);
  const name = `the ${chamber?.name ?? id}`;
  const state = keepReadModel(snapshot).states[id];
  const fixture = snapshot.mode === 'fixture';
  return {
    name, keywords, flows: [],
    greeting: `${chamber?.name ?? id}: ${state.word}. Choose a chip or tell me what you need; nothing acts until you hold to seal.`,
    catch_up: () => ({ say: `${chamber?.name ?? id}: ${state.word}.`, lines: [{ label: 'Now', value: state.line }],
      ...(fixture ? { simulated: true } : {}) }),
  };
}
