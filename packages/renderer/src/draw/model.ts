import type { DrawContent, LotsVerifiedCast } from '@castle-control/contract';

/** Local presentation data only. Hosts parse and verify the cast before calling. */
export interface DrawOutcome {
  readonly winners: Readonly<LotsVerifiedCast['winners']>;
  readonly label: LotsVerifiedCast['label'];
}

export type DrawShape = 'urn' | 'wheel' | 'deck' | 'ballot_box';
export interface DrawOptions {
  readonly content: DrawContent;
  /** Required true for prizes; the canonical overlay cannot be replaced by custom text. */
  readonly disclaimer?: boolean;
  readonly reduced_motion?: boolean;
}

export interface DrawPath {
  readonly d: string;
  /** Shared token names, resolved by the host; no hard-coded palette. */
  readonly ink: 'key' | 'gules' | 'or' | 'paper';
}

export interface DrawArtworkLayer {
  readonly kind: 'artwork';
  readonly shape: DrawShape;
  readonly view_box: '0 0 320 240';
  readonly paths: readonly DrawPath[];
}

export interface DrawDisclaimerLayer {
  readonly kind: 'disclaimer';
  readonly text: string;
  readonly cast_label: DrawOutcome['label'];
  readonly placement: 'footer';
}

export type DrawLayer = DrawArtworkLayer | DrawDisclaimerLayer | {
  readonly kind: 'cast_label';
  readonly text: DrawOutcome['label'];
  readonly placement: 'header';
};

/** Decorative motion affects the artwork only, never the winner list or the overlay. */
export interface DrawMotion {
  readonly target: 'artwork';
  readonly property: 'rotate_deg' | 'translate_y' | 'scale_x';
  readonly from: number;
  readonly to: number;
  readonly at_ms: number;
  readonly duration_ms: number;
  readonly easing: 'cubic-bezier(.2,.8,.2,1)';
}

export interface DrawReveal {
  readonly at_ms: number;
  readonly winner: DrawOutcome['winners'][number];
}

export interface DrawScene {
  readonly shape: DrawShape;
  readonly layers: readonly DrawLayer[];
  readonly motions: readonly DrawMotion[];
  readonly events: readonly DrawReveal[];
  readonly duration_ms: number;
}

export interface DrawPlaybackState {
  readonly layers: readonly DrawLayer[];
  readonly revealed_winners: DrawOutcome['winners'];
}
