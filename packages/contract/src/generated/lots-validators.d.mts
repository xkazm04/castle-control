// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.

import type { ValidateFunction } from 'ajv';
import type { RpcMethods, LotsEventPayload } from './types.js';
export const p26: ValidateFunction<RpcMethods["lots.draw.list"]['params']>;
export const r26: ValidateFunction<RpcMethods["lots.draw.list"]['result']>;
export const p27: ValidateFunction<RpcMethods["lots.draw.upsert"]['params']>;
export const r27: ValidateFunction<RpcMethods["lots.draw.upsert"]['result']>;
export const p28: ValidateFunction<RpcMethods["lots.image.upload"]['params']>;
export const r28: ValidateFunction<RpcMethods["lots.image.upload"]['result']>;
export const p29: ValidateFunction<RpcMethods["lots.draw.check"]['params']>;
export const r29: ValidateFunction<RpcMethods["lots.draw.check"]['result']>;
export const p30: ValidateFunction<RpcMethods["lots.roll.lookup"]['params']>;
export const r30: ValidateFunction<RpcMethods["lots.roll.lookup"]['result']>;
export const p31: ValidateFunction<RpcMethods["lots.roll.seal"]['params']>;
export const r31: ValidateFunction<RpcMethods["lots.roll.seal"]['result']>;
export const p32: ValidateFunction<RpcMethods["lots.cast"]['params']>;
export const r32: ValidateFunction<RpcMethods["lots.cast"]['result']>;
export const p33: ValidateFunction<RpcMethods["lots.writ.get"]['params']>;
export const r33: ValidateFunction<RpcMethods["lots.writ.get"]['result']>;
export const lotsEvent: ValidateFunction<LotsEventPayload>;
