import { fixtureMessages, fixtureConsensus } from '../moderation-fixture.js';

/** Illustrative scene geometry supplements the app's generated chamber fixtures. */
export const illustrativeSceneLabel = 'Malakor’s crypt · illustrative sample scene';
export const sceneChat = fixtureMessages.slice(0, 5);
export const sceneConsensus = fixtureConsensus({ kind: 'all' }).directions.slice(0, 2);
export const illustrativeTiles = Array.from({ length: 54 }, (_, index) => ({
  id: `${String.fromCharCode(65 + index % 9)}${Math.floor(index / 9) + 1}`,
  x: 12 + index % 9 * 18 + Math.floor(index / 9) % 2 * 9,
  y: 12 + Math.floor(index / 9) * 16,
  side: index % 4,
}));
