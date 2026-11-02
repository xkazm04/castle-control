import { useSyncExternalStore } from 'react';
import { stewardDock } from '@castle-control/ui/steward-flow';
import type { DockSnapshot, FlowChamber } from '@castle-control/ui/steward-flow';
import './demo-sandbox.css';

/**
 * A chamber's Play demo runs in a local SIMULATED sandbox built on the chamber's fixture
 * engine, in fixture and core mode alike, so the demo looks the same in both and never
 * touches the core. The sandbox is open while the demo flow is open, and stays open on
 * the demo's closing beat while the sheet is raised; lowering the sheet, opening another
 * flow or saying anything else returns the chamber to its own view.
 */
export const sandboxLabel = 'Demo sandbox · SIMULATED · nothing touches your core';

export function demoSandboxOpen(dock: DockSnapshot, chamber: FlowChamber, demo_id: string, closing: (text: string) => boolean): boolean {
  const session = dock.sessions[chamber];
  if (session) return session.flow.id === demo_id && session.state.status !== 'sealed';
  const last = dock.beats.at(-1);
  return dock.expanded && last !== undefined && last.chamber === chamber && last.sealed === true && last.simulated === true && closing(last.text);
}

export function useDemoSandbox(chamber: FlowChamber, demo_id: string, closing: (text: string) => boolean): boolean {
  const read = () => demoSandboxOpen(stewardDock.getSnapshot(), chamber, demo_id, closing);
  return useSyncExternalStore(stewardDock.subscribe, read, read);
}

/** Put the demo away: an open demo draft is closed unsealed, then the sheet lowers. */
export function leaveSandbox(chamber: FlowChamber, demo_id: string) {
  if (stewardDock.getSnapshot().sessions[chamber]?.flow.id === demo_id) stewardDock.close(chamber);
  stewardDock.collapse();
}

/** The same strip in fixture and core mode, so the demo looks identical in both. */
export function SandboxBanner({ chamber, demo_id }: { chamber: FlowChamber; demo_id: string }) {
  return <div className="cc-sandbox" role="note" aria-label="Demo sandbox" data-chamber={chamber}>
    <span className="cc-sim">Simulated</span>
    <p className="cc-sandbox__label">{sandboxLabel}</p>
    <button type="button" className="cc-btn cc-btn--quiet cc-btn--sm cc-sandbox__leave" onClick={() => leaveSandbox(chamber, demo_id)}>Leave the demo</button>
  </div>;
}
