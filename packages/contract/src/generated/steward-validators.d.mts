// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.

import type { ValidateFunction } from 'ajv';
import type { RpcMethods, StewardEventPayload } from './types.js';
export const p46: ValidateFunction<RpcMethods["steward.ask"]['params']>;
export const r46: ValidateFunction<RpcMethods["steward.ask"]['result']>;
export const p47: ValidateFunction<RpcMethods["steward.writ.seal"]['params']>;
export const r47: ValidateFunction<RpcMethods["steward.writ.seal"]['result']>;
export const p48: ValidateFunction<RpcMethods["steward.writ.tear"]['params']>;
export const r48: ValidateFunction<RpcMethods["steward.writ.tear"]['result']>;
export const stewardEventPayload: ValidateFunction<StewardEventPayload>;
