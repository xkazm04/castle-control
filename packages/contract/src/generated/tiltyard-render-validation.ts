// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.
import { parseJson } from '../door.mjs';
import { shape } from './tiltyard-render-validators.mjs';
import type { TiltyardRenderSnapshot } from './types.js';
export type { TiltyardRenderSnapshot, TiltyardSide, TiltyardVerdict, TiltyardWinner, TiltyardDecision, TiltyardRenderPhase } from './types.js';
export const TILTYARD_RENDER_SNAPSHOT_EVENT = "tiltyard.render.snapshot" as const;
export const TILTYARD_CURRENT_ROUTE = "/tiltyard/current" as const;
export const TILTYARD_PUSH_ROUTE = "/push/tiltyard" as const;
export function parseTiltyardRenderSnapshot(text: string): TiltyardRenderSnapshot {
  const value = parseJson(text);
  if (!shape(value)) throw new Error('Invalid tiltyard snapshot');
  return value;
}
