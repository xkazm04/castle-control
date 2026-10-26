import { Timeline } from '../playback.ts';
import { drawArtwork, drawMotion } from './artwork.ts';
import { drawDisclaimer } from './disclaimer.ts';
import type {
  DrawLayer, DrawOptions, DrawOutcome, DrawPlaybackState, DrawReveal, DrawScene, DrawShape,
} from './model.ts';

/**
 * The ONLY outcome input is a verified cast's winners and label. Hosts validate at
 * the contract door and verify the proof before calling; this is no verifier.
 * No roll, seed, weights, chooser, template count, callback or entropy is accepted.
 */
export function buildDrawScene(shape: DrawShape, cast: DrawOutcome, options: DrawOptions): DrawScene {
  if (options.content === 'prize' && options.disclaimer !== true) {
    throw new Error('Prize draw scenes require the Twitch disclaimer');
  }
  const layers: DrawLayer[] = [
    drawArtwork(shape),
    Object.freeze({ kind: 'cast_label', text: cast.label, placement: 'header' }),
  ];
  if (options.disclaimer === true) layers.push(drawDisclaimer(cast.label));
  const events = Object.freeze(cast.winners.map((winner, index) => Object.freeze({
    winner, at_ms: options.reduced_motion ? 0 : 1200 + index * 900,
  })));
  return Object.freeze({
    shape, layers: Object.freeze(layers), events,
    motions: Object.freeze(options.reduced_motion ? [] : [drawMotion(shape)]),
    duration_ms: events[events.length - 1]?.at_ms ?? 0,
  });
}

export function urnDraw(cast: DrawOutcome, options: DrawOptions): DrawScene {
  return buildDrawScene('urn', cast, options);
}

export function wheelDraw(cast: DrawOutcome, options: DrawOptions): DrawScene {
  return buildDrawScene('wheel', cast, options);
}

export function deckDraw(cast: DrawOutcome, options: DrawOptions): DrawScene {
  return buildDrawScene('deck', cast, options);
}

export function ballotBoxDraw(cast: DrawOutcome, options: DrawOptions): DrawScene {
  return buildDrawScene('ballot_box', cast, options);
}

/** Independent playback cursors over the immutable scene, using host-supplied time. */
export function createDrawPlayback(scene: DrawScene): Timeline<DrawPlaybackState, DrawReveal> {
  return new Timeline<DrawPlaybackState, DrawReveal>(
    scene.events,
    () => Object.freeze({ layers: scene.layers, revealed_winners: Object.freeze([]) }),
    (state, event) => Object.freeze({
      layers: state.layers,
      revealed_winners: Object.freeze([...state.revealed_winners, event.winner]),
    }),
    (event) => event.at_ms,
  );
}
