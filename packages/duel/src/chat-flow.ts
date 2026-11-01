import { classifyWindow, indexWindow, parseBallotPage, tallyAt } from './ballots.js';
import type { IndexedWindow } from './ballot-types.js';
import type { ChatSession } from './session/chat.js';

/** A fixed simulated epoch, offset by the zero-based match number in milliseconds. */
export function chatOpenedAt(session: ChatSession): string {
  const index = session.history.length - (session.verdict ? 1 : 0);
  return new Date(Date.UTC(2026, 0, 1) + index).toISOString();
}

/** All returned pages cross the same door before classification and indexing. */
export function chatWindowFor(session: ChatSession, pages: readonly string[]): IndexedWindow {
  const ballots = pages.flatMap(page => parseBallotPage(page).items);
  return indexWindow(classifyWindow(ballots, chatOpenedAt(session), session.window_ms));
}

/** Delay in real milliseconds until a visible chat number can change. */
export function nextChatDue(session: ChatSession, window?: IndexedWindow): number | null {
  if (session.phase === 'verdict') {
    return Math.min(session.remaining_ms, session.remaining_ms % 1000 || 1000);
  }
  if (session.phase !== 'live' || !window) return null;
  const left = Math.max(0, session.window_ms - session.elapsed);
  const seen = tallyAt(window, session.elapsed).seen;
  const arrival = window.events[seen]?.t_ms;
  return Math.min(left, left % 1000 || 1000,
    arrival === undefined ? Infinity : arrival - session.elapsed) / session.speed;
}
