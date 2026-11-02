import type { AnyStewardFlow, FlowChamber, FlowLine } from './flow.js';

/** A "Catch me up" beat: one Steward line plus a few facts. Read-only. */
export type CatchUp = { say: string; lines?: readonly FlowLine[]; simulated?: boolean };

/**
 * Everything the Steward knows about one chamber. Each module exports one of
 * these from its own folder; the app maps chamber ids to them in one table.
 */
export type ChamberSteward = {
  /** Display name for replies ("the Lot Chamber"). */
  name: string;
  /** The collapsed dock's "Steward says" line when nothing has been said yet. */
  greeting: string;
  flows: readonly AnyStewardFlow[];
  /** The chamber's "Play demo" flow: a SIMULATED case end to end. */
  demo?: AnyStewardFlow;
  catch_up?(): CatchUp;
  /** Free-text words that point at this chamber when no flow matches ("giveaway"). */
  keywords?: readonly string[];
};
export type StewardRegistry = Readonly<Record<FlowChamber, ChamberSteward>>;

export type ChipAction =
  | { kind: 'flow'; chamber: FlowChamber; flow: string }
  | { kind: 'demo'; chamber: FlowChamber }
  | { kind: 'catch_up'; chamber: FlowChamber }
  /** Navigate only: offered when free text points at another chamber. */
  | { kind: 'go'; chamber: FlowChamber };
export type StewardChip = { label: string; action: ChipAction };

export const catchUpLabel = 'Catch me up';
export const demoLabel = 'Play demo';

/** Chips offered from another chamber: go there, or open one of its flows (which navigates first). */
export function awayChips(chamber: FlowChamber, steward: ChamberSteward): StewardChip[] {
  const name = steward.name.replace(/^the /, '');
  return [{ label: `Go to ${name}`, action: { kind: 'go', chamber } },
    ...chamberChips(chamber, steward).filter(chip => chip.action.kind !== 'catch_up')];
}

/** Quick chips for the collapsed dock: chamber flows with a chip, then Play demo, then Catch me up. */
export function chamberChips(chamber: FlowChamber, steward: ChamberSteward, limit = 4): StewardChip[] {
  const chips: StewardChip[] = steward.flows.filter(flow => flow.chip)
    .map(flow => ({ label: flow.chip ?? flow.title, action: { kind: 'flow', chamber, flow: flow.id } }));
  const tail: StewardChip[] = [];
  if (steward.demo) tail.push({ label: demoLabel, action: { kind: 'demo', chamber } });
  if (steward.catch_up) tail.push({ label: catchUpLabel, action: { kind: 'catch_up', chamber } });
  return [...chips.slice(0, Math.max(0, limit - tail.length)), ...tail];
}

export function findFlow(registry: StewardRegistry, chamber: FlowChamber, id: string): AnyStewardFlow | undefined {
  const steward = registry[chamber];
  return steward.flows.find(flow => flow.id === id) ?? (steward.demo?.id === id ? steward.demo : undefined);
}

export function chipFlow(registry: StewardRegistry, action: ChipAction): AnyStewardFlow | undefined {
  return action.kind === 'flow' ? findFlow(registry, action.chamber, action.flow)
    : action.kind === 'demo' ? registry[action.chamber].demo : undefined;
}

/** Every flow the chamber offers, chip or not, then its demo: the dock's "More flows" menu. */
export function chamberFlows(chamber: FlowChamber, steward: ChamberSteward): StewardChip[] {
  const flows: StewardChip[] = steward.flows.map(flow => ({ label: flow.title, action: { kind: 'flow', chamber, flow: flow.id } }));
  if (steward.demo) flows.push({ label: steward.demo.title, action: { kind: 'demo', chamber } });
  return flows;
}
