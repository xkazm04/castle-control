// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.
import { parseJson } from '../door.mjs';
import { shape } from './beacons-render-validators.mjs';
import type { BeaconsRenderSnapshot } from './types.js';
export type { BeaconsRenderSnapshot } from './types.js';
export const BEACONS_RENDER_SNAPSHOT_EVENT = "beacons.render.snapshot" as const;
/** Schema plus cross-field ID checks, matching cc-types' validated TryFrom. */
export function validateBeaconsRenderSnapshot(value: unknown): value is BeaconsRenderSnapshot {
  return shape(value) && value.intensity.visual_id === value.visual.visual_id
    && (value.package !== undefined) === (value.visual.design_id !== undefined)
    && value.package?.design_id === value.visual.design_id;
}
/** Accepted full replacement only; hosts verify package bytes before publishing. */
export function parseBeaconsRenderSnapshot(text: string): BeaconsRenderSnapshot {
  const value = parseJson(text);
  if (!validateBeaconsRenderSnapshot(value)) throw new Error('Invalid render snapshot');
  return value;
}
