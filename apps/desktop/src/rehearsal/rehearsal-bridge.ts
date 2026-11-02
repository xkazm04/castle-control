import type { RehearsalModel } from './rehearsal-model.js';

/**
 * The one link between the #/rehearsal page and its Steward flows. The page owns the
 * model and the connection form; a flow's seal reaches them only through this bridge,
 * and only while the page is mounted. The OBS password never passes through here as a
 * value: `connect` reads the page's masked, uncontrolled field at the moment of the
 * seal, and submitConnection clears it before any asynchronous work.
 */
export type ConnectChoice = { host: string; port: number; remember: boolean };
export type RehearsalBridge = {
  model: RehearsalModel;
  /** Fill the page form's host, port and remember fields, then submit it. False when no form is on the page. */
  connect(choice: ConnectChoice): Promise<boolean>;
  /** True when the masked field holds something. Never returns the value. */
  hasPassword(): boolean;
  /** Put a line in the page's connection notice. */
  notify(text: string): void;
};

let active: RehearsalBridge | undefined;

export function attachRehearsal(bridge: RehearsalBridge): () => void {
  active = bridge;
  return () => { if (active === bridge) active = undefined; };
}

export const activeRehearsal = (): RehearsalBridge | undefined => active;
