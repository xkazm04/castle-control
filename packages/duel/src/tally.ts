import type { IndexedWindow, Tally, TallyMeter, WindowEvent } from './ballot-types.js';
import { indexTime, seenAtTime } from './tally-time.js';

function emptyTally(): Tally {
  return { counted: [0, 0], barred: [0, 0], held: 0, repeat: 0, chatter: 0,
    cheers_as_one: 0, seen: 0, total: 0, share: 0.5, shadow: [0, 0] };
}

function copyTally(tally: Tally): Tally {
  return { ...tally, counted: [...tally.counted], barred: [...tally.barred], shadow: [...tally.shadow] };
}

/** Ingest once. Queries never recount or scan the event stream. */
export function indexWindow(events: readonly WindowEvent[]): IndexedWindow {
  const ordered = events.map((event): WindowEvent => event.status === 'counted'
    ? { ...event, vote: { ...event.vote } } : { ...event }).sort((a, b) => a.t_ms - b.t_ms);
  const prefix = [emptyTally()];
  const time_index = { seen: 0 };
  let tally = emptyTally();
  for (const event of ordered) {
    tally = copyTally(tally);
    tally.seen++;
    indexTime(time_index, event.t_ms, tally.seen);
    if (event.status === 'counted') {
      tally.counted[event.option]++;
      if (event.cheer) tally.cheers_as_one++;
    } else if (event.status === 'barred') {
      if (event.option !== undefined) tally.barred[event.option]++;
    } else tally[event.status]++;
    tally.total = tally.counted[0] + tally.counted[1];
    tally.share = tally.total ? tally.counted[0] / tally.total : 0.5;
    tally.shadow = [tally.counted[0] + tally.barred[0], tally.counted[1] + tally.barred[1]];
    prefix.push(tally);
  }
  return { events: ordered, prefix, time_index };
}

function seenAt(window: IndexedWindow, t_ms: number, meter?: TallyMeter): number {
  let lo = 0;
  let hi = window.events.length;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const event = window.events[mid];
    if (meter) meter.probes++;
    if (event && event.t_ms <= t_ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function tallyAt(window: IndexedWindow, t_ms: number, meter?: TallyMeter): Tally {
  return copyTally(window.prefix[seenAt(window, t_ms, meter)] ?? emptyTally());
}

export function wouldFlip(tally: Tally): boolean {
  const leader = ([a, b]: readonly [number, number]) => a === b ? -1 : a > b ? 0 : 1;
  return leader(tally.counted) !== leader(tally.shadow);
}

/** O(count): time lookup has a fixed 53-step ceiling, with no event-array search. */
export function recentEvents(window: IndexedWindow, t_ms: number, count = 5): WindowEvent[] {
  if (!(count >= 1)) return [];
  const seen = seenAtTime(window.time_index, t_ms);
  return window.events.slice(Math.max(0, seen - Math.floor(count)), seen).reverse();
}
