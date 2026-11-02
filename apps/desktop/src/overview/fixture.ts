import { fixtureMessages, fixtureConsensus } from '../moderation-fixture.js';

/** Illustrative scene geometry supplements the app's generated chamber fixtures. */
export const illustrativeSceneLabel = 'Malakor’s crypt · illustrative sample scene';
export const sceneChat = fixtureMessages.slice(0, 5);
export const sceneConsensus = fixtureConsensus({ kind: 'all' }).directions.slice(0, 2);
