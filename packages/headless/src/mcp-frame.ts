import { parseJson } from '@castle-control/contract/door';

/** JSON-RPC 2.0 error codes this server emits. */
export const RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** Server-defined (JSON-RPC reserved range): a request other than initialize/ping before initialize. */
  notInitialized: -32002,
} as const;

/** MCP forbids a null id; JSON-RPC allows a string or a number. */
export type RpcId = string | number;

export type Frame =
  | { kind: 'request'; id: RpcId; method: string; params: unknown }
  | { kind: 'notification'; method: string; params: unknown }
  /** A client's answer to a server request. This server never sends one, so it is dropped. */
  | { kind: 'response' }
  | { kind: 'error'; id: RpcId | null; code: number; message: string };

/** One stdio frame is at most 1 MiB; a larger line is refused as a parse error. */
const MAX_FRAME_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is RpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

const invalid = (id: RpcId | null, message: string): Frame =>
  ({ kind: 'error', id, code: RPC_ERROR.invalidRequest, message });

/**
 * The one parse door for every incoming stdio line. It decodes through the
 * contract's JSON door and classifies the value as a request, a notification,
 * a (dropped) client response, or a JSON-RPC error to send back.
 */
export function parseFrame(line: string): Frame {
  let value: unknown;
  try {
    value = parseJson(line, { max_bytes: MAX_FRAME_BYTES });
  } catch {
    return { kind: 'error', id: null, code: RPC_ERROR.parse, message: 'Parse error' };
  }
  // Batches were removed in MCP 2025-06-18; an array is not a valid single message.
  if (!isRecord(value)) return invalid(null, 'Invalid Request: expected one JSON-RPC object');
  const id = isId(value.id) ? value.id : null;
  if (value.jsonrpc !== '2.0') return invalid(id, 'Invalid Request: jsonrpc must be "2.0"');
  if ('id' in value && !isId(value.id)) return invalid(null, 'Invalid Request: id must be a string or number');
  const { method, params } = value;
  if (method === undefined && id !== null && ('result' in value || 'error' in value)) return { kind: 'response' };
  if (typeof method !== 'string') return invalid(id, 'Invalid Request: method must be a string');
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    return invalid(id, 'Invalid Request: params must be an object or an array');
  }
  return id === null ? { kind: 'notification', method, params } : { kind: 'request', id, method, params };
}

/** The `tools/call` params door: a name, and arguments that are an object when present. */
export function parseCallParams(params: unknown): { name: string; args: Readonly<Record<string, unknown>> } | undefined {
  if (!isRecord(params) || typeof params.name !== 'string' || params.name === '') return undefined;
  const args = params.arguments ?? {};
  return isRecord(args) ? { name: params.name, args } : undefined;
}

/** The `initialize` params door: only the requested protocol version is read. */
export function requestedVersion(params: unknown): string | undefined {
  return isRecord(params) && typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined;
}

/** Serialize one outgoing message. JSON.stringify escapes newlines, so a frame is always one line. */
export function encodeResult(id: RpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

export function encodeError(id: RpcId | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}
