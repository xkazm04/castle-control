import type { ChamberId } from '../steward/port.js';

/** UI-local renderer parameters. These are not registered wire-contract shapes. */
export type ArtifactId = 'draw' | 'urn' | 'beacon' | 'map' | 'overlay';
export type SceneShape = 'urn' | 'wheel' | 'deck' | 'ballot-box' | 'altar' | 'frame' | 'border'
  | 'hex-map' | 'choice-board' | 'viewer-card' | 'draw' | 'contribution-meter' | 'chat-overlay' | 'stream-frame';
export type DesignInk = 'gules' | 'azure' | 'or' | 'key';
export type DesignTreatment = 'halftone' | 'engraved' | 'plain';
export type DesignDensity = 'quiet' | 'balanced' | 'bold';
export interface DesignOutput {
  readonly simulated: true;
  readonly scene: { readonly shape: SceneShape };
  readonly style: { readonly ink: DesignInk; readonly treatment: DesignTreatment; readonly density: DesignDensity };
}
export interface DesignPreset {
  readonly id: string;
  readonly label: string;
  readonly artifact: Exclude<ArtifactId, 'urn'>;
  readonly output: DesignOutput;
}

function preset(id: string, label: string, artifact: DesignPreset['artifact'], shape: SceneShape, ink: DesignInk): DesignPreset {
  return Object.freeze({ id, label, artifact, output: Object.freeze({ simulated: true,
    scene: Object.freeze({ shape }), style: Object.freeze({ ink, treatment: 'halftone', density: 'balanced' }),
  }) });
}

export const presetCatalog: readonly DesignPreset[] = Object.freeze([
  preset('urn', 'Urn', 'draw', 'urn', 'gules'),
  preset('wheel', 'Wheel', 'draw', 'wheel', 'gules'),
  preset('deck', 'Deck', 'draw', 'deck', 'gules'),
  preset('ballot-box', 'Ballot box', 'draw', 'ballot-box', 'gules'),
  preset('overlord-urn', 'Overlord urn', 'draw', 'urn', 'gules'),
  preset('offering-altar', 'Offering altar', 'beacon', 'altar', 'or'),
  preset('gilded-camera-frame', 'Gilded camera frame', 'beacon', 'frame', 'or'),
  preset('hype-border', 'Hype border', 'beacon', 'border', 'or'),
  preset('hex-map', 'Hex map', 'map', 'hex-map', 'key'),
  preset('choice-board', 'Choice board', 'map', 'choice-board', 'key'),
  preset('viewer-card', 'Viewer card', 'map', 'viewer-card', 'key'),
  preset('draw', 'Draw', 'map', 'draw', 'key'),
  preset('contribution-meter', 'Contribution meter', 'map', 'contribution-meter', 'key'),
  preset('chat-overlay', 'Chat overlay', 'overlay', 'chat-overlay', 'azure'),
  preset('stream-frame', 'Stream frame', 'overlay', 'stream-frame', 'key'),
]);

export const artifactChambers: Readonly<Record<ArtifactId, ChamberId>> = Object.freeze({
  draw: 'lottery', urn: 'lottery', beacon: 'visuals', map: 'studio', overlay: 'visuals',
});

export function presetsFor(artifact: ArtifactId): readonly DesignPreset[] {
  return presetCatalog.filter(item => item.artifact === (artifact === 'urn' ? 'draw' : artifact));
}

export function defaultPreset(artifact: ArtifactId): DesignPreset {
  const item = presetsFor(artifact)[0];
  if (!item) throw new Error('Artifact has no presets.');
  return item;
}
