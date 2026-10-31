import { parseMethodResult } from '@castle-control/contract';
import { gatehouseChatList } from '@castle-control/contract/gatehouse';
import type { GatehouseChatResult } from '@castle-control/contract';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BALLOT_FEED_TRANSITIONS, createBallotFeed } from './ballot-feed.js';

function page(ids: readonly number[] = [], next_cursor?: string): GatehouseChatResult {
  return parseMethodResult(gatehouseChatList, JSON.stringify({ unavailable_count: 0,
    ...(next_cursor === undefined ? {} : { next_cursor }), items: ids.map(id => ({
      message: { message_id: `simulated-${id}`, user_id: String(id), at: '2026-10-31T12:00:00Z', text: '1 [generated SIMULATED]' },
      decision: { decision_id: '00000000000000000000000001', message_id: `simulated-${id}`,
        at: '2026-10-31T12:00:00Z', verdict: 'pass', kind: 'would_act', operator: 'ai', reason_codes: ['simulated'] },
      provenance: 'simulated',
    })) }));
}
const timers = { set: (ms: number, fn: () => void) => setTimeout(fn, ms), clear: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle) };
const feeds: { close(): void }[] = [];
function setup(read = vi.fn<(_: string | undefined) => Promise<GatehouseChatResult>>(async () => page()),
  options: { backstop_ms?: number; max_pages_per_cycle?: number } = {}) {
  const on_ballots = vi.fn(); const on_error = vi.fn();
  const feed = createBallotFeed({ read, timers, on_ballots, on_error, ...options });
  feeds.push(feed);
  return { feed, read, on_ballots, on_error };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const feed of feeds.splice(0)) feed.close(); vi.useRealTimers(); });

test('10 verdict signals during one read coalesce into exactly one follow-up', async () => {
  let resolve: ((value: GatehouseChatResult) => void) | undefined;
  const h = setup(vi.fn().mockImplementationOnce(() => new Promise<GatehouseChatResult>(done => { resolve = done; }))
    .mockResolvedValue(page()));
  h.feed.open(); h.feed.open();
  for (let n = 0; n < 10; n++) h.feed.signal('gatehouse.verdict');
  expect(h.feed.status().phase).toBe('reading_dirty');
  resolve?.(page()); await flush();
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.feed.status()).toEqual({ phase: 'idle', reads: 2 });
  console.log('[ballot feed coalescing] 10 signals; 2 reads; 1 follow-up');
});

test('quiet windows read only once per default 15000ms backstop', async () => {
  const h = setup(); h.feed.open(); await flush();
  await vi.advanceTimersByTimeAsync(14999); expect(h.read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(h.read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30000); expect(h.read).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(1);
  console.log('[ballot feed quiet] 45000ms; 4 reads; 1 armed timer');
});

test('a verdict signal resets the backstop', async () => {
  const h = setup(); h.feed.open(); await flush();
  await vi.advanceTimersByTimeAsync(10000); h.feed.signal('gatehouse.verdict'); await flush();
  await vi.advanceTimersByTimeAsync(14999); expect(h.read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); expect(h.read).toHaveBeenCalledTimes(3);
  console.log('[ballot feed reset] signal at 10000ms; retry at 25000ms; 3 reads');
});

test('chained pages tail from the last SENT server cursor and dedupe repeated messages', async () => {
  const h = setup(vi.fn().mockResolvedValueOnce(page([1], 'chat:100'))
    .mockResolvedValueOnce(page([2], 'chat:200')).mockResolvedValueOnce(page([3]))
    .mockResolvedValueOnce(page([3, 4])).mockResolvedValue(page([3, 4])));
  h.feed.open(); await flush();
  expect(h.feed.status().tail_cursor).toBe('chat:200');
  h.feed.signal('gatehouse.verdict'); await flush();
  h.feed.signal('gatehouse.verdict'); await flush();
  expect(h.read.mock.calls).toEqual([[undefined], ['chat:100'], ['chat:200'], ['chat:200'], ['chat:200']]);
  expect(h.on_ballots).toHaveBeenCalledTimes(4);
  expect(h.on_ballots.mock.lastCall?.[0].map((ballot: { message_id: string }) => ballot.message_id))
    .toEqual(['simulated-1', 'simulated-2', 'simulated-3', 'simulated-4']);
  console.log('[ballot feed tail] 5 reads; 4 deliveries; 4 unique messages');
});

test('close stops the timer, ignores signals and discards late results', async () => {
  let resolve: ((value: GatehouseChatResult) => void) | undefined;
  const h = setup(vi.fn(() => new Promise<GatehouseChatResult>(done => { resolve = done; })));
  h.feed.open(); h.feed.close(); resolve?.(page([1])); await flush();
  h.feed.signal('gatehouse.verdict'); h.feed.open(); await vi.advanceTimersByTimeAsync(60000);
  expect(h.read).toHaveBeenCalledTimes(1); expect(h.on_ballots).not.toHaveBeenCalled();
  expect(h.feed.status().phase).toBe('closed'); expect(vi.getTimerCount()).toBe(0);
  console.log('[ballot feed close] 1 read; 0 deliveries; 0 timers after late result');
});

test('non-verdict kinds and verdicts before open are ignored', async () => {
  const h = setup(); h.feed.signal('gatehouse.verdict'); expect(h.read).not.toHaveBeenCalled();
  h.feed.open(); await flush();
  for (const kind of ['chat.message', 'gatehouse.decision', 'gatehouse.room', 'resync'] as const) h.feed.signal(kind);
  await flush(); expect(h.read).toHaveBeenCalledTimes(1);
  console.log('[ballot feed kinds] 4 ignored kinds; 1 initial read');
});

test('a rejected read keeps the tail and surfaces its error before a backstop retry', async () => {
  const error = new Error('SIMULATED read failure');
  const h = setup(vi.fn().mockResolvedValueOnce(page([1], 'chat:100')).mockResolvedValueOnce(page([2]))
    .mockRejectedValueOnce(error).mockResolvedValue(page([2, 3])));
  h.feed.open(); await flush(); h.feed.signal('gatehouse.verdict'); await flush();
  expect(h.feed.status()).toEqual({ phase: 'idle', reads: 3, tail_cursor: 'chat:100', last_error: error });
  expect(h.on_error).toHaveBeenCalledWith(error); expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(h.read.mock.calls).toEqual([[undefined], ['chat:100'], ['chat:100'], ['chat:100']]);
  expect(h.feed.status()).not.toHaveProperty('last_error');
  console.log('[ballot feed error] 1 reported error; backstop retry; 4 reads');
});

test('the page cap bounds each cycle and later cycles continue with server-minted cursors', async () => {
  const h = setup(vi.fn().mockResolvedValueOnce(page([], 'chat:100')).mockResolvedValueOnce(page([], 'chat:200'))
    .mockResolvedValue(page()), { max_pages_per_cycle: 2 });
  h.feed.open(); await flush(); expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.feed.status().tail_cursor).toBe('chat:100');
  h.feed.signal('gatehouse.verdict'); await flush();
  expect(h.read.mock.calls).toEqual([[undefined], ['chat:100'], ['chat:200']]);
  console.log('[ballot feed cap] cap 2; first cycle 2 reads; continuation 1 read');
});

test('the transition table declares all four feed phases', () => {
  expect(Object.keys(BALLOT_FEED_TRANSITIONS)).toEqual(['idle', 'reading', 'reading_dirty', 'closed']);
});
