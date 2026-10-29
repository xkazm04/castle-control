// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.
import * as compiled from './gatehouse-validators.mjs';
export const gatehouseRulesList = { method: "gatehouse.rules.list" as const, params: compiled.p11, result: compiled.r11 };
export const gatehouseRulesUpsert = { method: "gatehouse.rules.upsert" as const, params: compiled.p12, result: compiled.r12 };
export const gatehouseBanConfirm = { method: "gatehouse.ban.confirm" as const, params: compiled.p14, result: compiled.r14 };
export const gatehouseBanDismiss = { method: "gatehouse.ban.dismiss" as const, params: compiled.p15, result: compiled.r15 };
export const gatehouseDecisionUndo = { method: "gatehouse.decision.undo" as const, params: compiled.p16, result: compiled.r16 };
export const gatehousePetitionResolve = { method: "gatehouse.petition.resolve" as const, params: compiled.p17, result: compiled.r17 };
export const gatehouseConsensusGet = { method: "gatehouse.consensus.get" as const, params: compiled.p22, result: compiled.r22 };
export const gatehouseDrillRun = { method: "gatehouse.drill.run" as const, params: compiled.p23, result: compiled.r23 };
export const gatehouseDrillDiff = { method: "gatehouse.drill.diff" as const, params: compiled.p24, result: compiled.r24 };
export const gatehouseRecordingImport = { method: "gatehouse.recording.import" as const, params: compiled.p25, result: compiled.r25 };
export const gatehouseChatList = { method: "gatehouse.chat.list" as const, params: compiled.p47, result: compiled.r47 };
export const gatehouseHistoryList = { method: "gatehouse.history.list" as const, params: compiled.p48, result: compiled.r48 };
export const gatehouseLiveRunGet = { method: "gatehouse.liveRun.get" as const, params: compiled.p49, result: compiled.r49 };
