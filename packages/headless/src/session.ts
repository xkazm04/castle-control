import { parseError, type ErrorCode, type ErrorEnvelope } from '@castle-control/contract';
import type { Handoff } from './handoff.ts';
import { readEvents, readOverlay, StreamError, type EventsResult, type OverlaySnapshot, type StreamOptions }
  from './streams.ts';
import { findTool, UnknownToolError, type LocalMethod, type OverlayKind } from './tools.ts';

export type CallOutcome = { ok: true; result: unknown } | { ok: false; error: ErrorEnvelope };

/** One live connection to a headless core. Holds the capability privately; nothing here prints it. */
export interface Session {
  readonly endpoint: string;
  readonly overlayOrigin: string;
  /** Run one allowlisted tool. Error envelopes are outcomes; only an unknown tool throws. */
  call(tool: string, args?: unknown): Promise<CallOutcome>;
  eventsSince(sinceSeq?: number): Promise<EventsResult>;
  overlaySnapshot(kind: OverlayKind, visualId?: string): Promise<OverlaySnapshot>;
  /**
   * The raw handoff, for an in-process UI attach on the same core (the
   * one-time e2e). It carries the token: never print, log or persist it.
   */
  uiHandoff(): Handoff;
  close(): Promise<void>;
}

export type SessionOptions = { onClose?: () => Promise<void>; stream?: StreamOptions };

const failure = (code: ErrorCode, message: string): CallOutcome => ({ ok: false, error: { code, message } });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type LocalArgs =
  | { method: 'events.since'; since: number }
  | { method: 'overlay.snapshot'; kind: OverlayKind; visualId?: string };

/** The one parse door for local tool arguments, matching their declared inputSchema. */
export function parseLocalArgs(method: LocalMethod, args: unknown): LocalArgs | undefined {
  if (!isRecord(args)) return undefined;
  const keys = Object.keys(args);
  if (method === 'events.since') {
    const since = args.since_seq ?? 0;
    if (keys.some(key => key !== 'since_seq') || typeof since !== 'number'
      || !Number.isSafeInteger(since) || since < 0) return undefined;
    return { method, since };
  }
  const { kind, visual_id: visualId } = args;
  if (keys.some(key => key !== 'kind' && key !== 'visual_id')
    || (kind !== 'beacons' && kind !== 'gatehouse' && kind !== 'tiltyard')
    || (visualId !== undefined && (typeof visualId !== 'string' || visualId.length === 0))
    || (kind === 'beacons') !== (visualId !== undefined)) return undefined;
  return visualId === undefined ? { method, kind } : { method, kind, visualId };
}

/** Map anything invoke() threw to an envelope; contract envelopes pass through the contract parser. */
function envelope(thrown: unknown): ErrorEnvelope {
  if (thrown instanceof Error) {
    return thrown.message === 'Invalid contract value'
      ? { code: 'internal', message: 'core result failed the contract' }
      : { code: 'unavailable', message: 'core unreachable' };
  }
  try {
    return parseError(JSON.stringify(thrown));
  } catch {
    return { code: 'internal', message: 'core error failed the contract' };
  }
}

export function openSession(handoff: Handoff, options: SessionOptions = {}): Session {
  const { endpoint, token, overlay_origin: overlayOrigin } = handoff;
  let closing: Promise<void> | undefined;
  const eventsSince = (sinceSeq = 0) => readEvents(endpoint, token, sinceSeq, options.stream);
  const overlaySnapshot = (kind: OverlayKind, visualId?: string) =>
    readOverlay(overlayOrigin, kind, visualId, options.stream);

  async function local(args: LocalArgs): Promise<CallOutcome> {
    try {
      const result = args.method === 'events.since' ? await eventsSince(args.since)
        : await overlaySnapshot(args.kind, args.visualId);
      return { ok: true, result };
    } catch (error) {
      if (error instanceof StreamError) return failure(error.code, error.message);
      throw error;
    }
  }

  return {
    endpoint,
    overlayOrigin,
    async call(name, args = {}) {
      const tool = findTool(name);
      if (!tool) throw new UnknownToolError(name);
      if (closing) return failure('unavailable', 'session is closed');
      if (tool.class === 'local') {
        const parsed = parseLocalArgs(tool.method, args);
        return parsed ? local(parsed) : failure('invalid', `arguments do not match ${tool.method} params`);
      }
      let send;
      try {
        send = tool.prepare(args);
      } catch {
        return failure('invalid', `arguments do not match ${tool.method} params`);
      }
      try {
        return { ok: true, result: await send(endpoint, token) };
      } catch (thrown) {
        return { ok: false, error: envelope(thrown) };
      }
    },
    eventsSince,
    overlaySnapshot,
    uiHandoff: () => handoff,
    close() {
      closing ??= options.onClose?.() ?? Promise.resolve();
      return closing;
    },
  };
}
