// Adapted from Shadowrunr OS, packages/stage-kit/src/sceneModel.ts @ 7e4b6f8 (Apache-2.0).
// Only caption slots and pure reducer bookkeeping; no show or wire-contract model.

/** Local playback data, not a design-package or transport schema. */
export interface Caption {
  readonly id: number;
  readonly text: string;
  readonly at_ms: number;
}

export interface ScheduledCaption extends Caption {
  readonly said_at_ms: number;
  readonly spoken_ms: number;
}

export interface SceneState {
  readonly first_at_ms?: number;
  readonly last_at_ms?: number;
  readonly applied: number;
  readonly caption?: Caption;
  readonly captions: readonly ScheduledCaption[];
}

/** At most three slots may wait behind the caption currently showing. */
export const CAPTION_QUEUE_MAX = 3;
export const QUEUED_HOLD_MS = 2000;

export function initialScene(): SceneState {
  return { applied: 0, captions: [] };
}
