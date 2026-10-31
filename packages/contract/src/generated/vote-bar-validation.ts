// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.
import { parseJson } from '../door.mjs';
import { shape } from './vote-bar-validators.mjs';
import type { VoteBarSnapshot } from './types.js';
export type { VoteBarSnapshot } from './types.js';
export const VOTE_BAR_SNAPSHOT_EVENT = "gatehouse.render.snapshot" as const;
export function parseVoteBarSnapshot(text: string): VoteBarSnapshot {
  const value = parseJson(text);
  if (!shape(value)) throw new Error('Invalid vote bar snapshot');
  return value;
}
