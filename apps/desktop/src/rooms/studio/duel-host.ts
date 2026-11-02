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
const listeners = new Set<() => void>();

export const duelHost = {
  setCore(door: CoreDuelDoor | undefined) { core = door; },
  core: () => core,
  setPicture(next: DuelPicture | undefined) {
    if (next === picture) return;
    picture = next;
    for (const listener of [...listeners]) listener();
  },
  picture: () => picture,
  /** Lets the chamber strip follow the duel live (useSyncExternalStore with `picture`). */
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
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

/**
 * The demo sandbox: in core mode Play demo runs the fixture engine on this
 * machine and the stage shows it instead of the core tournament, which is
 * never touched. It ends when the demo crowns its champion or the streamer
 * leaves it; the stage then shows the core again.
 */
let sandbox = false;
const sandbox_listeners = new Set<() => void>();
export const duelSandbox = {
  active: () => sandbox,
  set(next: boolean) {
    if (next === sandbox) return;
    sandbox = next;
    for (const listener of [...sandbox_listeners]) listener();
  },
  subscribe(listener: () => void) { sandbox_listeners.add(listener); return () => { sandbox_listeners.delete(listener); }; },
};
