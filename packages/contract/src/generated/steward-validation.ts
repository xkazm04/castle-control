// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.
import * as compiled from './steward-validators.mjs';
export const stewardAsk = { method: "steward.ask" as const, params: compiled.p46, result: compiled.r46 };
export const stewardWritSeal = { method: "steward.writ.seal" as const, params: compiled.p47, result: compiled.r47 };
export const stewardWritTear = { method: "steward.writ.tear" as const, params: compiled.p48, result: compiled.r48 };
export const stewardEventPayload = compiled.stewardEventPayload;
