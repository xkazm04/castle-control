import { createChatSession, createLadderSession, createShowSession, currentMatch, stepChat, stepLadder, stepShow } from '@castle-control/duel';
import type { ChatSession, Counted, DuelEvent, LadderSession, ShowSession, TheatreMs } from '@castle-control/duel';
import type { DuelMode, TiltyardLists } from './types.js';
import type { TiltyardWords } from './words.js';

export interface TiltyardState {
  readonly mode: DuelMode;
  readonly show: ShowSession;
  readonly chat: ChatSession;
  readonly ladder: LadderSession;
  readonly announcement: string;
}
export type StageAction =
  | { readonly kind: 'mode'; readonly mode: DuelMode }
  | { readonly kind: 'motion'; readonly reduced: boolean }
  | { readonly kind: 'event'; readonly event: DuelEvent; readonly words: TiltyardWords; readonly counted?: Counted };

export function createTiltyardState(lists: TiltyardLists, mode: DuelMode, reduced: boolean): TiltyardState {
  const theatre_ms = reduced ? 650 : 1050;
  return {
    mode, show: createShowSession(lists.bracket, { theatre_ms }),
    chat: createChatSession(lists.chat, { window_ms: lists.chat.window_ms,
      ...(lists.chat.key === undefined ? {} : { key: lists.chat.key }) }),
    ladder: createLadderSession(lists.ladder.top.items.map(item => item.id), lists.ladder.queue.items.map(item => item.id), { theatre_ms }),
    announcement: '',
  };
}
function motion<T extends ShowSession | LadderSession>(session: T, theatre_ms: TheatreMs): T {
  return { ...session, theatre_ms, remaining_ms: session.phase === 'verdict'
    ? Math.max(0, theatre_ms - (session.theatre_ms - session.remaining_ms)) : session.remaining_ms };
}
function announce(before: ShowSession, after: ShowSession, event: DuelEvent, words: TiltyardWords): string | null {
  if (before === after) return null;
  if (event.kind === 'cancel') return words.cancelled;
  if (event.kind === 'undo') return words.undone;
  if (after.verdict && after.history.length > before.history.length) {
    const verdict = after.verdict;
    const winner = after.list.items.find(item => item.id === (verdict.side === 0 ? verdict.a : verdict.b));
    const current = currentMatch(after.bracket);
    const a = after.list.items.find(item => item.id === current?.match.a);
    const b = after.list.items.find(item => item.id === current?.match.b);
    return winner ? words.outcome(winner, current && a && b ? { round: words.round(after.bracket, current.round), a, b } : null) : null;
  }
  if (before.phase === 'called_off' && currentMatch(before.bracket)) return words.reopened;
  if (event.kind === 'reset' || event.kind === 'enter' && after.history.length === 0) {
    const current = currentMatch(after.bracket);
    const a = after.list.items.find(item => item.id === current?.match.a);
    const b = after.list.items.find(item => item.id === current?.match.b);
    return current && a && b ? words.new_announcement(words.round(after.bracket, current.round), a, b) : null;
  }
  return null;
}
export function tiltyardReducer(state: TiltyardState, action: StageAction): TiltyardState {
  if (action.kind === 'motion') {
    const theatre_ms = action.reduced ? 650 : 1050;
    return { ...state, show: motion(state.show, theatre_ms), ladder: motion(state.ladder, theatre_ms) };
  }
  if (action.kind === 'mode') {
    // Mode changes skip the outgoing theatre, preserving every recorded pick.
    const event = { kind: 'enter' } as const;
    return { ...state, mode: action.mode,
      show: state.show.phase === 'verdict' ? stepShow(state.show, event) : state.show,
      chat: state.chat.phase === 'verdict' ? stepChat(state.chat, { ...event, counted: [0, 0] }) : state.chat,
      ladder: state.ladder.phase === 'verdict' ? stepLadder(state.ladder, event) : state.ladder };
  }
  if (state.mode === 'show') {
    const show = stepShow(state.show, action.event);
    return show === state.show ? state : { ...state, show,
      announcement: announce(state.show, show, action.event, action.words) ?? state.announcement };
  }
  if (state.mode === 'chat') return { ...state, chat: stepChat(state.chat, { ...action.event, counted: action.counted ?? [0, 0] }) };
  return { ...state, ladder: stepLadder(state.ladder, action.event) };
}
