import type { Session } from './session.ts';
import { findTool, TOOLS } from './tools.ts';
import { encodeError, encodeResult, parseCallParams, parseFrame, requestedVersion, RPC_ERROR, type RpcId }
  from './mcp-frame.ts';

/** Newest first; an unsupported request gets the newest. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const SERVER_NAME = 'castle-control-headless';

export const INSTRUCTIONS = 'This server drives a developer-only, SIMULATED Castle Control rehearsal core: '
  + 'it has no Twitch login, no OBS connection and no real viewers, and all chat it produces is generated. '
  + 'Its tools are a reviewed allowlist of read-only and rehearsal-only methods; armed actions (bans, shield, '
  + 'delay, Lots seal and cast, OBS control, store purge) are not reachable. The core starts on the first '
  + 'tools/call on a throwaway data root and is stopped, with that root removed, when this server exits.';

export type McpOptions = {
  /** Incoming lines, one JSON-RPC message each (the stdio transport). */
  lines: AsyncIterable<string>;
  /** Writes one protocol frame (no trailing newline). The only path to stdout. */
  write: (frame: string) => void;
  /** Diagnostics (stderr). */
  log: (text: string) => void;
  /** Launches a core; called lazily on the first tools/call, and again after a failed launch. */
  openSession: () => Promise<Session>;
  version: string;
};

export type McpServer = {
  /** Resolves after the input ended, every in-flight request answered and the session closed. */
  readonly done: Promise<void>;
  /** Stop now (a signal): close the session, even with requests in flight. Idempotent. */
  shutdown(): Promise<void>;
};

type ToolResult = { content: { type: 'text'; text: string }[]; isError: boolean };

const text = (value: unknown, isError: boolean): ToolResult =>
  ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], isError });

class RpcFailure extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * A stdio MCP server over the headless tool table. It is a pure function of
 * its input lines, its frame writer and its session factory, so tests drive
 * it with in-memory streams. Every outgoing frame and diagnostic is scrubbed
 * of the session capability before it leaves.
 */
export function serveMcp(options: McpOptions): McpServer {
  let initialized = false;
  let launching: Promise<Session> | undefined;
  let session: Session | undefined;
  let stopping: Promise<void> | undefined;
  const inFlight = new Set<Promise<void>>();

  const scrub = (value: string): string => {
    const token = session?.uiHandoff().token;
    return token ? value.replaceAll(token, '[redacted]') : value;
  };
  const write = (frame: string) => options.write(scrub(frame));
  const log = (message: string) => options.log(scrub(`cc-mcp: ${message}\n`));

  function core(): Promise<Session> {
    if (stopping) return Promise.reject(new Error('server is shutting down'));
    launching ??= options.openSession().then(opened => {
      session = opened;
      return opened;
    }, (error: unknown) => {
      // A failed launch is not cached: the next tools/call retries it.
      launching = undefined;
      throw error;
    });
    return launching;
  }

  async function callTool(params: unknown): Promise<ToolResult> {
    const call = parseCallParams(params);
    if (!call) throw new RpcFailure(RPC_ERROR.invalidParams, 'Invalid params: expected {name: string, arguments?: object}');
    const tool = findTool(call.name);
    if (!tool) {
      // Unknown and armed names stop here: the core is never launched or asked.
      return text(`Unknown tool: ${call.name}. Only the allowlisted rehearsal tools from tools/list are `
        + 'available; armed methods are not reachable from this server.', true);
    }
    let opened: Session;
    try {
      opened = await core();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown failure';
      log(`core launch failed: ${reason}`);
      return text(`Headless core launch failed: ${reason}. The next tools/call retries the launch.`, true);
    }
    const outcome = await opened.call(tool.name, call.args);
    return outcome.ok ? text(outcome.result, false) : text(outcome.error, true);
  }

  async function answer(method: string, params: unknown): Promise<unknown> {
    if (method === 'ping') return {};
    if (method === 'initialize') {
      initialized = true;
      const requested = requestedVersion(params);
      const supported: readonly string[] = SUPPORTED_PROTOCOL_VERSIONS;
      return {
        protocolVersion: requested !== undefined && supported.includes(requested) ? requested : supported[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: options.version },
        instructions: INSTRUCTIONS,
      };
    }
    if (method !== 'tools/list' && method !== 'tools/call') {
      throw new RpcFailure(RPC_ERROR.methodNotFound, `Method not found: ${method}`);
    }
    if (!initialized) throw new RpcFailure(RPC_ERROR.notInitialized, 'Server not initialized: send initialize first');
    if (method === 'tools/list') {
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    }
    return callTool(params);
  }

  async function respond(id: RpcId, method: string, params: unknown): Promise<void> {
    let frame: string;
    try {
      frame = encodeResult(id, await answer(method, params));
    } catch (error) {
      if (error instanceof RpcFailure) frame = encodeError(id, error.code, error.message);
      else {
        log(`${method} failed: ${error instanceof Error ? error.message : 'unknown failure'}`);
        frame = encodeError(id, RPC_ERROR.internal, 'Internal error');
      }
    }
    write(frame);
  }

  function handle(line: string): void {
    if (line.trim() === '') return;
    const frame = parseFrame(line);
    if (frame.kind === 'error') write(encodeError(frame.id, frame.code, frame.message));
    else if (frame.kind === 'request') {
      // Requests run concurrently; each is answered by its own id when it settles.
      const pending = respond(frame.id, frame.method, frame.params).catch((error: unknown) => {
        log(`could not answer ${frame.method}: ${error instanceof Error ? error.message : 'unknown failure'}`);
      }).finally(() => inFlight.delete(pending));
      inFlight.add(pending);
    }
    // notifications/initialized and every other notification or client response: no reply.
  }

  function shutdown(): Promise<void> {
    stopping ??= (async () => {
      // A launch still in flight is awaited, so the core it produces is stopped too.
      const current = launching;
      if (!current) return;
      let opened: Session;
      try {
        opened = await current;
      } catch (error) {
        log(`no core to stop: ${error instanceof Error ? error.message : 'launch failed'}`);
        return;
      }
      await opened.close();
    })();
    return stopping;
  }

  const done = (async () => {
    for await (const line of options.lines) {
      if (stopping) break;
      handle(line);
    }
    await Promise.all(inFlight);
    await shutdown();
  })();

  return { done, shutdown };
}
