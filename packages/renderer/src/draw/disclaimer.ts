import type { DrawDisclaimerLayer, DrawOutcome } from './model.ts';

// Product copy from prototype/app-lottery.js, not copied implementation code.
export const TWITCH_DRAW_DISCLAIMER = 'Twitch does not sponsor this promotion';

/** Persistent foreground text, outside every artwork animation. */
export function drawDisclaimer(label: DrawOutcome['label']): DrawDisclaimerLayer {
  return Object.freeze({
    kind: 'disclaimer', text: TWITCH_DRAW_DISCLAIMER, cast_label: label, placement: 'footer',
  });
}
