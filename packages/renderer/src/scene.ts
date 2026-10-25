// Adapted from Shadowrunr OS, packages/stage-kit/src/scene.ts @ 7e4b6f8 (Apache-2.0).
// Pure caption queue, caption lookup and fold only; show-specific event branches removed.
import { CAPTION_QUEUE_MAX, QUEUED_HOLD_MS, initialScene } from './sceneModel.ts';
import type { Caption, SceneState, ScheduledCaption } from './sceneModel.ts';
import { wordTimings } from './timing.ts';

/** Keep the showing slot, skip the oldest excess waiters, then reschedule the rest. */
export function enqueueCaption(queue: readonly ScheduledCaption[], caption: Caption): ScheduledCaption[] {
  let current = -1;
  for (let i = 0; i < queue.length; i++) if (queue[i]!.at_ms <= caption.at_ms) current = i;
  const showing = current >= 0 ? [queue[current]!] : [];
  const waiting: ScheduledCaption[] = [
    ...queue.slice(current + 1),
    { ...caption, said_at_ms: caption.at_ms, spoken_ms: wordTimings(caption.text).spoken_ms },
  ];
  while (waiting.length > CAPTION_QUEUE_MAX) waiting.shift();
  const out = showing;
  for (const slot of waiting) {
    const prev = out[out.length - 1];
    const at_ms = prev ? Math.max(slot.said_at_ms, prev.at_ms + prev.spoken_ms + QUEUED_HOLD_MS) : slot.said_at_ms;
    out.push({ ...slot, at_ms });
  }
  return out;
}

/** Latest started slot; use captionOpacity to calculate when it has faded away. */
export function captionAt(scene: SceneState, now_ms: number): ScheduledCaption | undefined {
  let found: ScheduledCaption | undefined;
  for (const caption of scene.captions) {
    if (caption.at_ms > now_ms) break;
    found = caption;
  }
  return found;
}

/** Apply a local caption; callers validate transport data before reaching this reducer. */
export function reduce(prev: SceneState, caption: Caption): SceneState {
  return {
    first_at_ms: prev.first_at_ms ?? caption.at_ms,
    last_at_ms: Math.max(prev.last_at_ms ?? caption.at_ms, caption.at_ms),
    applied: prev.applied + 1,
    caption: { ...caption },
    captions: enqueueCaption(prev.captions, caption),
  };
}

/** Fold captions ordered by their local onset time, with an optional playback cutoff. */
export function foldEvents(captions: readonly Caption[], up_to_ms = Infinity): SceneState {
  let scene = initialScene();
  for (const caption of captions) {
    if (caption.at_ms > up_to_ms) break;
    scene = reduce(scene, caption);
  }
  return scene;
}
