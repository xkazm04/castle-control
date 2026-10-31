import { invoke } from '@castle-control/contract';
import type { GatehouseChatResult } from '@castle-control/contract';
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { coreGatehouseConnection, createDesktopClient } from '../../client.js';
import { simulatedRead } from '../../simulated.js';
import Room from './room.jsx';
import { coreBallotFeed } from './tiltyard-feed.js';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
const cleanup: (() => void)[] = [];
class TestSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
}
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});
function harness() {
  const sockets: TestSocket[] = [];
  const socket = vi.fn(() => {
    const next = new TestSocket();
    sockets.push(next); return next;
  });
  const rpc = vi.fn<(endpoint: string, session: string, method: string, params: unknown) => Promise<unknown>>(async () =>
    ({ items: [], unavailable_count: 0 }));
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify(
    String(init?.body).includes('"status.get"') ? { ...simulatedRead(1).status, simulated: false } : { state: 'connected' },
  ))));
  const client = createDesktopClient(launch, { socket, rpc: invoke }, undefined, { rpc });
  cleanup.push(client.start());
  const connection = coreGatehouseConnection(client.getSnapshot());
  if (!connection) throw new Error('Missing test connection');
  let seq = 0;
  function emit(kind: string) {
    sockets[0]?.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ seq: ++seq, at: '2026-10-31T12:00:00Z', kind }) }));
  }
  return { client, connection, socket, rpc, emit };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
const window = { match_key: 'mill:0:0', opened_at: '2026-10-31T12:00:00Z', window_ms: 15000 };

test('core-mode Map Room renders the SAMPLE Tiltyard alone and keeps the seal slot', async () => {
  const h = harness();
  const stream = await renderToReadableStream(<Room snapshot={h.client.getSnapshot()} seal_slot={<p>Shared seal slot</p>} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('aria-label="The Tiltyard, duel stage"');
  expect(html).toContain('data-provenance="sample"'); expect(html).toContain('The Ashen Warden');
  expect(html).toContain('SAMPLE contestants · Gatehouse verdicts');
  expect(html).toContain('Shared seal slot'); expect(html).not.toContain('data-hex-tile=');
  expect(html).not.toContain('Map view'); expect(h.rpc).not.toHaveBeenCalled();
  expect(h.socket).toHaveBeenCalledTimes(1);
});

test('the shared parsed event stream refetches verdicts, ignores chat.message and opens only one socket', async () => {
  vi.useFakeTimers(); const h = harness(); const on_ballots = vi.fn();
  const available = vi.fn();
  const feed = coreBallotFeed(h.connection, available);
  const stop = feed(window, on_ballots); cleanup.push(stop);
  await flush(); expect(h.rpc).toHaveBeenCalledTimes(1);
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.chat.list', { limit: 100 });
  const observed = vi.fn(); cleanup.push(h.client.subscribeEvents(observed));
  h.emit('chat.message'); await flush(); expect(h.rpc).toHaveBeenCalledTimes(1);
  h.emit('gatehouse.verdict'); await flush(); expect(h.rpc).toHaveBeenCalledTimes(2);
  expect(observed.mock.calls).toEqual([['chat.message'], ['gatehouse.verdict']]);
  expect(available).toHaveBeenLastCalledWith(true);
  expect(h.socket).toHaveBeenCalledTimes(1);
  stop(); h.emit('gatehouse.verdict'); await vi.advanceTimersByTimeAsync(15000);
  expect(h.rpc).toHaveBeenCalledTimes(2); expect(h.socket).toHaveBeenCalledTimes(1);
  console.log('[desktop live ballots] initial + verdict = 2 chat reads; chat.message = 0 extra; 1 socket');
});

test('the core feed validates pages at the existing door, tails cursors and reports invalid results', async () => {
  vi.useFakeTimers(); const h = harness(); const available = vi.fn(); const on_ballots = vi.fn();
  const item = {
    message: { message_id: 'simulated-1', user_id: '101', at: window.opened_at, text: '1 [generated SIMULATED]' },
    decision: { decision_id: '00000000000000000000000001', message_id: 'simulated-1', at: window.opened_at,
      verdict: 'pass', kind: 'would_act', operator: 'ai', reason_codes: ['simulated'] }, provenance: 'simulated',
  };
  h.rpc.mockResolvedValueOnce({ items: [item], unavailable_count: 0, next_cursor: 'chat:100' })
    .mockResolvedValueOnce({ items: [], unavailable_count: 1 });
  cleanup.push(coreBallotFeed(h.connection, available)(window, on_ballots));
  await flush(); expect(h.rpc).toHaveBeenCalledTimes(2);
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.chat.list', { limit: 100, cursor: 'chat:100' });
  expect(on_ballots.mock.lastCall?.[0]).toEqual([{ ...item.message, verdict: 'pass', provenance: 'simulated' }]);
  h.rpc.mockResolvedValueOnce({ items: [item], unavailable_count: -1 });
  h.emit('gatehouse.verdict'); await flush(); expect(available).toHaveBeenLastCalledWith(false);
  expect(on_ballots).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(available).toHaveBeenLastCalledWith(true);
  expect(h.rpc).toHaveBeenCalledTimes(4);
});

test('late core replies after window close do not deliver ballots or availability changes', async () => {
  vi.useFakeTimers(); const h = harness(); const available = vi.fn(); const on_ballots = vi.fn();
  let resolve: ((value: GatehouseChatResult) => void) | undefined;
  h.rpc.mockImplementationOnce(() => new Promise<GatehouseChatResult>(done => { resolve = done; }));
  const stop = coreBallotFeed(h.connection, available)(window, on_ballots); cleanup.push(stop);
  stop(); resolve?.({ items: [], unavailable_count: 0 }); await flush();
  expect(on_ballots).not.toHaveBeenCalled(); expect(available).not.toHaveBeenCalled();
});
