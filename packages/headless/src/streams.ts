import { parseEvent, type StreamEvent } from '@castle-control/contract';
import { BEACONS_RENDER_SNAPSHOT_EVENT, parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { parseVoteBarSnapshot, VOTE_BAR_SNAPSHOT_EVENT } from '@castle-control/contract/vote-bar';
import { parseTiltyardRenderSnapshot, TILTYARD_PUSH_ROUTE, TILTYARD_RENDER_SNAPSHOT_EVENT }
  from '@castle-control/contract/tiltyard-render';
import type { OverlayKind } from './tools.ts';

export type EventsResult = { events: StreamEvent[]; next_seq: number };
export type OverlaySnapshot = { kind: OverlayKind; simulated: boolean; snapshot: unknown };
export type StreamOptions = { idleMs?: number; timeoutMs?: number };

/** A stream failure. Messages are fixed texts or HTTP statuses, never a URL with a capability. */
export class StreamError extends Error {
  readonly code: 'unavailable' | 'not_found' | 'internal';
  constructor(code: StreamError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Read the core's /events WebSocket from `since` and return what arrives
 * before the stream goes quiet. A non-browser client sends no Origin; the
 * capability rides in the `cc-session.<token>` subprotocol, never in the URL.
 */
export function readEvents(endpoint: string, token: string, since: number, options: StreamOptions = {}):
  Promise<EventsResult> {
  const idleMs = options.idleMs ?? 300;
  const url = new URL(`/events?since_seq=${since}`, endpoint);
  url.protocol = 'ws:';
  return new Promise((resolve, reject) => {
    const events: StreamEvent[] = [];
    const socket = new WebSocket(url, ['cc-events', `cc-session.${token}`]);
    let settled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish(), options.timeoutMs ?? 5000);
    function finish(error?: StreamError) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(idle);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      if (error) reject(error);
      else resolve({ events, next_seq: events.reduce((seq, event) => Math.max(seq, event.seq), since) });
    }
    const quiet = () => { clearTimeout(idle); idle = setTimeout(() => finish(), idleMs); };
    socket.addEventListener('open', () => {
      if (socket.protocol !== 'cc-events') finish(new StreamError('unavailable', 'event stream refused the protocol'));
      else quiet();
    });
    socket.addEventListener('message', message => {
      if (typeof message.data !== 'string') {
        finish(new StreamError('internal', 'event stream sent a binary frame'));
        return;
      }
      try {
        events.push(parseEvent(message.data));
      } catch {
        finish(new StreamError('internal', 'event stream frame failed the contract'));
        return;
      }
      quiet();
    });
    socket.addEventListener('error', () => finish(new StreamError('unavailable', 'event stream unavailable')));
    socket.addEventListener('close', () => finish());
  });
}

const OVERLAY = {
  beacons: { event: BEACONS_RENDER_SNAPSHOT_EVENT, parse: parseBeaconsRenderSnapshot },
  gatehouse: { event: VOTE_BAR_SNAPSHOT_EVENT, parse: parseVoteBarSnapshot },
  tiltyard: { event: TILTYARD_RENDER_SNAPSHOT_EVENT, parse: parseTiltyardRenderSnapshot },
} as const;

function overlayPath(kind: OverlayKind, visualId: string | undefined): string {
  if (kind === 'beacons') {
    if (visualId === undefined) throw new StreamError('unavailable', 'beacons snapshot needs visual_id');
    return `/push/beacons?visual_id=${encodeURIComponent(visualId)}`;
  }
  return kind === 'gatehouse' ? '/push/gatehouse' : TILTYARD_PUSH_ROUTE;
}

type Frame = { event?: string; data: string[]; comments: string[] };

function frame(block: string): Frame {
  const result: Frame = { data: [], comments: [] };
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) result.comments.push(line.slice(1).trim());
    else if (line.startsWith('event:')) result.event = line.slice(6).trim();
    else if (line.startsWith('data:')) result.data.push(line.slice(5).replace(/^ /, ''));
  }
  return result;
}

/** First snapshot frame of an overlay push route, parsed by the contract's overlay parser. */
export async function readOverlay(origin: string, kind: OverlayKind, visualId?: string,
  options: StreamOptions = {}): Promise<OverlaySnapshot> {
  const spec = OVERLAY[kind];
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    let response: Response;
    try {
      response = await fetch(new URL(overlayPath(kind, visualId), origin),
        { headers: { accept: 'text/event-stream' }, signal: controller.signal });
    } catch (error) {
      if (error instanceof StreamError) throw error;
      throw new StreamError('unavailable', `${kind} overlay unavailable`);
    }
    if (!response.ok || !response.body) {
      throw new StreamError(response.status === 404 ? 'not_found' : 'unavailable',
        `${kind} overlay answered ${response.status}`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch {
        throw new StreamError('unavailable', `${kind} overlay sent no snapshot in time`);
      }
      if (chunk.done) throw new StreamError('unavailable', `${kind} overlay closed before a snapshot`);
      buffer += chunk.value.replaceAll('\r\n', '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = frame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (block.event !== spec.event || block.data.length === 0) continue;
        let snapshot: ReturnType<typeof spec.parse>;
        try {
          snapshot = spec.parse(block.data.join('\n'));
        } catch {
          throw new StreamError('internal', `${kind} snapshot failed the contract`);
        }
        await reader.cancel();
        const flagged = 'simulated' in snapshot && snapshot.simulated === true;
        return { kind, simulated: flagged || block.comments.includes('SIMULATED'), snapshot };
      }
    }
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}
