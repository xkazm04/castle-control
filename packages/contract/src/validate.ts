import type { ValidateFunction } from 'ajv';
import { parseJson } from './door.mjs';
import { params, results, event, error } from './generated/validation.js';
import { designPackage, askParams, askResult, writ, writSealParams, writSealResult,
  writTearParams, writTearResult, stewardEventPayload } from './generated/validators.mjs';
import type { DesignPackage, ErrorEnvelope, RpcMethods, StreamEvent, AskParams, AskResult,
  Writ, WritSealParams, WritSealResult, WritTearParams, WritTearResult, StewardEventPayload } from './generated/types.js';

export type RpcMethod = keyof RpcMethods;
export type RpcParams<M extends RpcMethod> = RpcMethods[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMethods[M]['result'];
export type MethodContract<M extends RpcMethod> = {
  method: M; params: ValidateFunction<RpcParams<M>>; result: ValidateFunction<RpcResult<M>>;
};

function checked<T>(validator: ValidateFunction | undefined, value: unknown): T {
  if (!validator || !validator(value)) throw new Error('Invalid contract value');
  // The generated schema is the runtime authority for the generated type.
  return value as T;
}
export function parseEvent(text: string): StreamEvent { return checked(event, parseJson(text)); }
export function parseError(text: string): ErrorEnvelope { return checked(error, parseJson(text)); }
/** Absent privileges grant data-only access; hosts must not infer script consent. */
export function parseDesignPackage(text: string): DesignPackage { return checked(designPackage, parseJson(text)); }
// Standalone parsers: Steward RPC entries intentionally remain Pending.
export function parseStewardAskParams(text: string): AskParams { return checked(askParams, parseJson(text)); }
export function parseStewardAskResult(text: string): AskResult { return checked(askResult, parseJson(text)); }
export function parseWrit(text: string): Writ { return checked(writ, parseJson(text)); }
export function parseWritSealParams(text: string): WritSealParams { return checked(writSealParams, parseJson(text)); }
export function parseWritSealResult(text: string): WritSealResult { return checked(writSealResult, parseJson(text)); }
export function parseWritTearParams(text: string): WritTearParams { return checked(writTearParams, parseJson(text)); }
export function parseWritTearResult(text: string): WritTearResult { return checked(writTearResult, parseJson(text)); }
export function parseStewardEvent(text: string): StewardEventPayload { return checked(stewardEventPayload, parseJson(text)); }
export function parseParams<M extends RpcMethod>(method: M, value: unknown): RpcParams<M> {
  return checked(params.get(method), value);
}
export function parseResult<M extends RpcMethod>(method: M, text: string): RpcResult<M> {
  return checked(results.get(method), parseJson(text));
}
/** Static method selection lets bundlers retain only a consumer's validators. */
export function parseMethodParams<M extends RpcMethod>(contract: MethodContract<M>, value: unknown): RpcParams<M> {
  return checked(contract.params, value);
}
export function parseMethodResult<M extends RpcMethod>(contract: MethodContract<M>, text: string): RpcResult<M> {
  return checked(contract.result, parseJson(text));
}

/** One crossing door. Never retries mutations; a timeout leaves outcome unknown. */
export async function invoke<M extends RpcMethod>(
  endpoint: string, session: string, method: M, value: RpcParams<M>,
): Promise<RpcResult<M>> {
  const contract = { method, params: params.get(method), result: results.get(method) };
  // Missing validators still fail at the same boundary before any network call.
  if (!contract.params || !contract.result) throw new Error('Invalid contract value');
  return invokeMethod(endpoint, session, contract as MethodContract<M>, value);
}

export async function invokeMethod<M extends RpcMethod>(
  endpoint: string, session: string, contract: MethodContract<M>, value: RpcParams<M>,
): Promise<RpcResult<M>> {
  const base = new URL(endpoint);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/'
      || base.username || base.password || base.search || base.hash) throw new Error('Expected local core endpoint');
  const body = JSON.stringify({ method: contract.method, params: parseMethodParams(contract, value) });
  const response = await fetch(new URL('/rpc', base), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body, signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw parseError(text);
  return parseMethodResult(contract, text);
}
