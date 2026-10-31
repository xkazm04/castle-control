/** Tiltyard engine. Sources: .port/winner/duel-engine.js (contest cc-t2-duel A/1)
 * and goat src/v2/list/tournament.ts @ ae2c83f. */
export { fnv, rng } from './random.js';
export { parseDuelList, slugId } from './list.js';
export type { DuelItemId, DuelItem, DuelList } from './list.js';
export { SAMPLE, SAMPLE_LABEL } from './sample.js';
export {
  startBracket, currentMatch, pick, finalOrder, totalRounds, totalMatches,
  roundName, matchNumber, plannedRounds,
} from './bracket.js';
export type { Bracket, Match, PlannedMatch } from './bracket.js';
export { startClimb, climbDone, climbTarget, climbPick, climbResult, maxClimbPicks, stillPossible } from './ladder.js';
export type { Climb, ClimbStep, ClimbResult } from './ladder.js';
export { decide } from './decide.js';
export { arms, blazon, SHIELD_PATH, BACKING_PATH, chargePath, divisionPath } from './arms.js';
export type { Arms, Ink, Charge, Division } from './arms.js';
export { createShowSession, stepShow, SHOW_TRANSITIONS } from './session/show.js';
export type { ShowSession, ShowVerdict } from './session/show.js';
export { createChatSession, stepChat, CHAT_TRANSITIONS } from './session/chat.js';
export type { ChatSession, ChatEvent, ChatVerdict, Counted, StreamerCall } from './session/chat.js';
export { createLadderSession, stepLadder, LADDER_TRANSITIONS } from './session/ladder.js';
export type { LadderSession, LadderPhase, LadderVerdict, LadderLast, LadderPrevious } from './session/ladder.js';
export type { DuelEvent, EventKind, Phase, Side, TheatreMs } from './session/shared.js';

import type { ShowVerdict } from './session/show.js';
import type { ChatVerdict } from './session/chat.js';
import type { LadderVerdict } from './session/ladder.js';
export type Verdict = ShowVerdict | ChatVerdict | LadderVerdict;
export { chatOpenedAt, chatWindowFor, nextChatDue } from './chat-flow.js';
