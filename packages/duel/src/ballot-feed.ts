import type { EventKind, GatehouseChatResult } from '@castle-control/contract';
import { ballotsFromResult } from './ballots.js';
import type { Ballot } from './ballot-types.js';

export type BallotFeedPhase = 'idle' | 'reading' | 'reading_dirty' | 'closed';
type FeedEvent = 'open' | 'signal' | 'finish' | 'close';
export const BALLOT_FEED_TRANSITIONS = {
  idle: { open: 'reading', signal: 'reading', close: 'closed' },
  reading: { signal: 'reading_dirty', finish: 'idle', close: 'closed' },
  reading_dirty: { signal: 'reading_dirty', finish: 'reading', close: 'closed' },
  closed: {},
} as const satisfies Record<BallotFeedPhase, Partial<Record<FeedEvent, BallotFeedPhase>>>;

export type BallotFeedTimers<Handle> = { set(ms: number, fn: () => void): Handle; clear(handle: Handle): void };
export type BallotFeedOptions<Handle> = {
  read(cursor?: string): Promise<GatehouseChatResult>;
  timers: BallotFeedTimers<Handle>;
  on_ballots(ballots: readonly Ballot[]): void;
  on_error?: (error: unknown) => void;
  backstop_ms?: number;
  max_pages_per_cycle?: number;
};

/** One serialized reader over the existing append-position chat read. No clocks or DOM. */
export function createBallotFeed<Handle>(options: BallotFeedOptions<Handle>) {
  const { read, timers, on_ballots, on_error, backstop_ms = 15000, max_pages_per_cycle = 20 } = options;
  if (!Number.isFinite(backstop_ms) || backstop_ms <= 0
    || !Number.isInteger(max_pages_per_cycle) || max_pages_per_cycle < 1) throw new TypeError('Invalid ballot feed limits');
  let phase: BallotFeedPhase = 'idle';
  let opened = false;
  let reads = 0;
  let last_error: unknown;
  let tail_cursor: string | undefined;
  // At the page cap, continue at the server's next position on the next cycle.
  let continuation: string | undefined;
  let timer: { handle: Handle } | undefined;
  const items = new Map<string, Ballot>();
  const closed = () => phase === 'closed';
  function transition(event: FeedEvent) {
    const row: Partial<Record<FeedEvent, BallotFeedPhase>> = BALLOT_FEED_TRANSITIONS[phase];
    phase = row[event] ?? phase;
  }
  function cancelTimer() {
    if (timer) { timers.clear(timer.handle); timer = undefined; }
  }
  function arm() {
    cancelTimer();
    timer = { handle: timers.set(backstop_ms, () => { timer = undefined; start('signal'); }) };
  }
  async function cycle() {
    let cursor = continuation ?? tail_cursor;
    continuation = undefined;
    try {
      for (let page = 0; page < max_pages_per_cycle; page++) {
        reads++;
        const result = await read(cursor);
        if (closed()) return;
        tail_cursor = cursor;
        last_error = undefined;
        const ballots = ballotsFromResult(result);
        let added = false;
        for (const ballot of ballots.items) {
          if (items.has(ballot.message_id)) continue;
          items.set(ballot.message_id, ballot);
          added = true;
        }
        if (added) on_ballots([...items.values()]);
        if (closed() || ballots.next_cursor === undefined) break;
        cursor = ballots.next_cursor;
        if (page + 1 === max_pages_per_cycle) continuation = cursor;
      }
    } catch (error: unknown) {
      if (closed()) return;
      last_error = error;
      on_error?.(error);
    } finally {
      if (!closed()) {
        const dirty = phase === 'reading_dirty';
        transition('finish');
        if (dirty) void cycle();
        else arm();
      }
    }
  }
  function start(event: 'open' | 'signal') {
    if (closed()) return;
    const reading = phase === 'reading' || phase === 'reading_dirty';
    transition(event);
    if (reading) return;
    cancelTimer();
    void cycle();
  }
  return {
    open() { if (!opened && !closed()) { opened = true; start('open'); } },
    signal(kind: EventKind) { if (opened && kind === 'gatehouse.verdict') start('signal'); },
    close() { transition('close'); cancelTimer(); },
    status: () => ({ phase, reads, ...(last_error === undefined ? {} : { last_error }),
      ...(tail_cursor === undefined ? {} : { tail_cursor }) }),
  };
}
