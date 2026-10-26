import type { ModuleId } from '@castle-control/ui';
import type { Surface } from '../navigation.js';

export type StewardContext = ModuleId | Surface;
export type StewardTurn = { reply: string; proposals: readonly never[]; focus: { chamber?: ModuleId; layer?: string } };
export interface StewardPort {
  ask(text: string, context: StewardContext): StewardTurn;
  amend(text: string, context: StewardContext): StewardTurn;
  tearUp(context: StewardContext): StewardTurn;
}
export const unwiredReply = 'The Steward is not wired yet. No changes have been made.';
const turn = (): StewardTurn => ({ reply: unwiredReply, proposals: [], focus: {} });
/** Local offline seam only. Wave 2 replaces this with @castle-control/ui/steward. */
export const stewardStub: StewardPort = { ask: turn, amend: turn, tearUp: turn };
