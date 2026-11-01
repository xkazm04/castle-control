import { parseMethodResult } from '@castle-control/contract';
import { gatehouseChatList } from '@castle-control/contract/gatehouse';
import type { GatehouseChatResult } from '@castle-control/contract';
import type { BallotPage } from './ballot-types.js';

/** The sole chat boundary: validate the existing post-verdict Gatehouse result. */
export function parseBallotPage(text: string): BallotPage {
  return ballotsFromResult(parseMethodResult(gatehouseChatList, text));
}

/** Map a result already validated by the core client's contract door. */
export function ballotsFromResult(page: GatehouseChatResult): BallotPage {
  return {
    items: page.items.map(({ message, decision, provenance }) => ({
      ...message, verdict: decision.verdict, provenance,
    })),
    ...(page.next_cursor === undefined ? {} : { next_cursor: page.next_cursor }),
  };
}

export type { Ballot, BallotOption, BallotPage, IndexedWindow, Tally, TallyMeter, Vote, WindowEvent } from './ballot-types.js';
export { ballotOption, classifyWindow, isCheer, parseVote } from './ballot-window.js';
export { SIMULATED_LABEL, simulateChatPages } from './simulate.js';
export { indexWindow, recentEvents, tallyAt, wouldFlip } from './tally.js';
