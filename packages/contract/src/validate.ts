import type { ValidateFunction } from 'ajv';
import { parseJson } from './door.mjs';
import { params, results, event, error } from './generated/validation.js';
import type { ErrorEnvelope, RpcMethods, StreamEvent } from './generated/types.js';

export type RpcMethod = keyof RpcMethods;
export type RpcParams<M extends RpcMethod> = RpcMethods[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMethods[M]['result'];

function checked<T>(validator: ValidateFunction | undefined, value: unknown): T {
  if (!validator || !validator(value)) throw new Error('Invalid contract value');
  // The generated schema is the runtime authority for the generated type.
  return value as T;
}
export function parseEvent(text: string): StreamEvent { return checked(event, parseJson(text)); }
export function parseError(text: string): ErrorEnvelope { return checked(error, parseJson(text)); }
export function parseParams<M extends RpcMethod>(method: M, value: unknown): RpcParams<M> {
  return checked(params.get(method), value);
}
export function parseResult<M extends RpcMethod>(method: M, text: string): RpcResult<M> {
  return checked(results.get(method), parseJson(text));
}

/** One crossing door. Never retries mutations; a timeout leaves outcome unknown. */
export async function invoke<M extends RpcMethod>(
  endpoint: string, session: string, method: M, value: RpcParams<M>,
): Promise<RpcResult<M>> {
  const base = new URL(endpoint);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/'
      || base.username || base.password || base.search || base.hash) throw new Error('Expected local core endpoint');
  const body = JSON.stringify({ method, params: parseParams(method, value) });
  const response = await fetch(new URL('/rpc', base), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body, signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw parseError(text);
  return parseResult(method, text);
}
