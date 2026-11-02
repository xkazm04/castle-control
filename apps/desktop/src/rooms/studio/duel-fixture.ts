import { chatOpenedAt, chatWindowFor, createChatSession, currentMatch, matchNumber, nextChatDue, SAMPLE, stepChat, totalMatches } from '@castle-control/duel';
import type { ChatSession, Counted, DuelEvent, DuelList } from '@castle-control/duel';
import { simulateChatPages, tallyAt } from '@castle-control/duel/ballots';
import type { IndexedWindow } from '@castle-control/duel/ballots';
import { plannedSlots } from './duel-model.js';
import { DEMO_KEY } from './duel-host.js';
import type { DuelEntrant, DuelPicture } from './duel-model.js';

/**
 * FIXTURE duel: the TS engine with generated SIMULATED ballots, kept outside
 * React so a Steward seal can start it and a remount never restarts it. The
 * clock runs only while the stage is on screen.
 */

export type FixtureDuelState = Readonly<{
  session: ChatSession;
  window?: IndexedWindow;
  /** The vote window has not been opened yet for this tournament. */
  ready: boolean;
}>;
export type FixtureStart = { window_ms?: number; key?: string; open?: boolean; speed?: 1 | 3 };

function initial(list: DuelList, options: FixtureStart): FixtureDuelState {
  const created = createChatSession(list, { window_ms: options.window_ms ?? 15000, key: options.key ?? 'mill' });
  const fast = options.speed === 3 ? stepChat(created, { kind: 'speed', counted: [0, 0] }) : created;
  const window = options.open ? windowFor(fast) : undefined;
  if (options.open) return { session: fast, ...(window ? { window } : {}), ready: false };
  return { session: stepChat(fast, { kind: 'cancel', counted: [0, 0] }), ready: true };
}

function windowFor(session: ChatSession): IndexedWindow | undefined {
  if (!session.match_key) return undefined;
  return chatWindowFor(session, simulateChatPages(session.match_key, session.window_ms, chatOpenedAt(session)));
}

export function createFixtureDuel(now: () => number = () => performance.now(),
  timers: { set: (run: () => void, ms: number) => unknown; clear: (id: unknown) => void } = {
    set: (run, ms) => setTimeout(run, ms), clear: id => { clearTimeout(id as ReturnType<typeof setTimeout>); },
  }) {
  let state = initial(SAMPLE.chat, { window_ms: SAMPLE.chat.window_ms, key: SAMPLE.chat.key });
  let anchor = now();
  let timer: unknown;
  const listeners = new Set<() => void>();
  const counted = (session: ChatSession, window: IndexedWindow | undefined, elapsed: number): Counted =>
    window ? tallyAt(window, Math.min(session.window_ms, elapsed)).counted : [0, 0];
  function commit(session: ChatSession) {
    const fresh = session.match_key !== state.session.match_key && session.phase === 'live';
    const window = fresh || !state.window ? windowFor(session) ?? state.window : state.window;
    state = { session, ...(window ? { window } : {}), ready: state.ready && session.phase === 'called_off' };
  }
  /** Catch the session up to the wall clock; returns whether that crossed into another phase or match. */
  function catchUp(): boolean {
    const at = now();
    const ms = at - anchor;
    anchor = at;
    const before = state.session;
    if (ms <= 0 || state.ready || (before.phase !== 'live' && before.phase !== 'verdict')) return false;
    commit(stepChat(before, { kind: 'tick', ms, counted: counted(before, state.window, before.elapsed + ms * before.speed) }));
    return state.session.phase !== before.phase || state.session.match_key !== before.match_key;
  }
  function schedule() {
    timers.clear(timer); timer = undefined;
    if (!listeners.size || state.ready) return;
    const due = nextChatDue(state.session, state.window);
    if (due === null) return;
    timer = timers.set(() => { timer = undefined; catchUp(); emit(); }, Math.max(0, Math.ceil(due)));
  }
  function emit() { for (const listener of listeners) listener(); schedule(); }
  const store = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!listeners.size) anchor = now();
      listeners.add(listener);
      schedule();
      return () => { listeners.delete(listener); if (!listeners.size) { catchUp(); timers.clear(timer); timer = undefined; } };
    },
    /** A human event: the clock catches up first, so a late key never decides the next pair. */
    send(event: DuelEvent) {
      const crossed = catchUp();
      if (crossed && (event.kind === 'enter' || event.kind === 'pick')) { emit(); return; }
      const session = state.session;
      if (state.ready && event.kind === 'enter') {
        const opened = stepChat(session, { kind: 'enter', counted: [0, 0] });
        state = { session: opened, ...(windowFor(opened) ? { window: windowFor(opened)! } : {}), ready: false };
        anchor = now(); emit(); return;
      }
      commit(stepChat(session, { ...event, counted: counted(session, state.window, session.elapsed) }));
      if (event.kind === 'reset') state = { ...state, ready: false };
      emit();
    },
    start(list: DuelList, options: FixtureStart = {}) {
      state = initial(list, options);
      anchor = now();
      emit();
    },
  };
  return store;
}
export type FixtureDuel = ReturnType<typeof createFixtureDuel>;

/** The app's one fixture duel. */
export const fixtureDuel = createFixtureDuel();

export function fixturePicture(state: FixtureDuelState): DuelPicture {
  const { session, window } = state;
  const { bracket, list, verdict } = session;
  const entrants: Record<string, DuelEntrant> = {};
  list.items.forEach(item => {
    entrants[item.id] = { id: item.id, title: item.title, by: item.by, ...(item.note ? { note: item.note } : {}),
      seed: bracket.seeds.indexOf(item.id) + 1 };
  });
  const current = currentMatch(bracket);
  const last = bracket.rounds.at(-1)?.[0];
  const pair = verdict ?? current?.match ?? last;
  const elapsed = verdict?.elapsed ?? session.elapsed;
  const tally = window && !state.ready ? tallyAt(window, Math.min(session.window_ms, elapsed)) : undefined;
  const champion = session.phase === 'done' && last?.winner ? entrants[last.winner] : undefined;
  return {
    source: 'fixture', simulated: true, demo: session.key === DEMO_KEY,
    phase: state.ready ? 'ready' : session.phase, title: list.title, ...(list.prompt ? { prompt: list.prompt } : {}),
    key: session.key, ...(verdict?.match_key ?? session.match_key ? { match_key: verdict?.match_key ?? session.match_key ?? '' } : {}),
    round: verdict?.round ?? current?.round ?? bracket.rounds.length - 1,
    index: verdict?.index ?? current?.index ?? 0,
    match: verdict ? session.history.length : current ? matchNumber(bracket) : totalMatches(bracket),
    matches: totalMatches(bracket),
    ...(pair && entrants[pair.a] ? { left: entrants[pair.a] } : {}),
    ...(pair && entrants[pair.b] ? { right: entrants[pair.b] } : {}),
    counts: verdict ? verdict.counted : tally?.counted ?? [0, 0],
    ...(tally ? { barred: tally.barred[0] + tally.barred[1] } : {}),
    window_ms: session.window_ms, elapsed_ms: state.ready ? 0 : elapsed, speed: session.speed,
    ...(verdict ? { verdict: { side: verdict.side, how: verdict.how } } : {}),
    ...(champion ? { champion } : {}),
    rounds: plannedSlots(bracket.seeds.length, bracket.rounds), entrants, can_undo: session.history.length > 0,
  };
}
