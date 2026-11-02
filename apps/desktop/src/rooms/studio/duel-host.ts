import type { TiltyardAction } from '@castle-control/contract';
import type { DuelPicture } from './duel-model.js';

/**
 * The seam between the Steward's seals and the mounted duel. Small and eager:
 * the Steward registry imports it at first paint, so it holds no engine code.
 * The core stage registers its adapter while it is on screen; the stage
 * publishes its latest picture for "Catch me up" and flow previews.
 */
export type CoreDuelDoor = {
  run(action: TiltyardAction): Promise<void>;
  copySource(): Promise<void>;
  /** The adapter's last error or notice after an action, if any. */
  outcome(): { error?: string; notice?: string };
};

let core: CoreDuelDoor | undefined;
let picture: DuelPicture | undefined;

export const duelHost = {
  setCore(door: CoreDuelDoor | undefined) { core = door; },
  core: () => core,
  setPicture(next: DuelPicture | undefined) { picture = next; },
  picture: () => picture,
};

/** Run a core action through the mounted adapter, refusing loudly when it cannot. */
export async function runCore(action: TiltyardAction): Promise<void> {
  const door = core;
  if (!door) throw new Error('The core duel is not on screen');
  await door.run(action);
  const { error } = door.outcome();
  if (error) throw new Error(error);
}

/** Demo tournaments run under this key, so the stage can mark them DEMO in both modes. */
export const DEMO_KEY = 'duel-demo';
