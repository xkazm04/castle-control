import { maproomTurnRun, parseMethodParams } from '@castle-control/contract';
import type { TiltyardAction } from '@castle-control/contract';
import { entryIds } from './duel-model.js';
import type { DuelDraft } from './duel-model.js';

/**
 * Core tournament actions built from a Steward duel draft. Its own module so the
 * Steward flows (which seal it) and the core stage (which opens those flows) do
 * not import each other; loaded lazily, it keeps the contract parser off first paint.
 */
export function draftTournament(draft: DuelDraft, key: string): TiltyardAction {
  const ids = entryIds(draft.entries);
  return parseMethodParams(maproomTurnRun, {
    action: {
      kind: 'start', key, window_ms: draft.window_s * 1000,
      list: {
        title: draft.title, ...(draft.prompt ? { prompt: draft.prompt } : {}),
        items: draft.entries.map((entry, index) => ({ id: ids[index], title: entry.title, by: entry.by ?? 'streamer',
          ...(entry.note ? { note: entry.note } : {}), seed: String(index + 1) })),
      },
    },
  }).action;
}
