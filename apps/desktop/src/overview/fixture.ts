import { fixtureMessages, fixtureConsensus } from '../moderation-fixture.js';

/** Illustrative scene geometry supplements the app's generated chamber fixtures. */
export const illustrativeSceneLabel = 'Malakor’s crypt · illustrative sample scene';
/** Core mode: the crypt is still a drawing, but every layer on it is this session's own read (or says it has none). */
export const illustrativeBackdropLabel = 'Malakor’s crypt · illustrative backdrop';
export const sceneChat = fixtureMessages.slice(0, 5);
export const sceneConsensus = fixtureConsensus({ kind: 'all' }).directions.slice(0, 2);
