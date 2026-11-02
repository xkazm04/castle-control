import type { ArtAssetKind, DesignId } from '@castle-control/contract';
import type { FlowLine, SealOutcome } from '@castle-control/ui/steward-flow';
import { coreBeaconsConnection } from '../client.js';
import type { CoreBeaconsPort } from '../beacons-core.js';
import type { Snapshot } from '../model.js';

/** What the hold seals: a library pick (imported on seal in core mode) or a design the core already holds. */
export type SealChoice = { kind: ArtAssetKind; style_name: string; library_id?: string; design_id?: DesignId; simulated: boolean };

/**
 * Where a sealed design lands is the chamber's business: each chamber hands its flow a host
 * (rooms/<chamber>/custom-host.ts) built from the ports it already owns, so this module never
 * reaches into another chamber.
 */
export type CustomHost = {
  /** Fixture mode: dress the chamber's own SIMULATED preview with the library art. */
  fixture(choice: SealChoice & { library_id: string }): SealOutcome | Promise<SealOutcome>;
  /** Core mode: put the core-held design on stream. */
  core(design_id: DesignId, choice: SealChoice): Promise<SealOutcome>;
};

/** The one core Beacons port for a snapshot, created on first use (also from other chambers). */
export async function beaconsPort(snapshot: Snapshot): Promise<CoreBeaconsPort> {
  const connection = coreBeaconsConnection(snapshot);
  if (!connection) throw new Error('The core is not connected. Reopen the desktop shell.');
  if (!connection.port) {
    const { createCoreBeaconsPort } = await import('../beacons-core.js');
    connection.port = createCoreBeaconsPort(connection.launch, connection.transport);
  }
  return connection.port;
}

export const keptLine = (core: boolean): FlowLine => ({ label: 'Kept', value: core ? 'In your core configuration' : 'In this preview session only · SIMULATED' });

export async function sealCustom(snapshot: Snapshot, choice: SealChoice, host: CustomHost): Promise<SealOutcome> {
  if (snapshot.mode === 'fixture') {
    if (!choice.library_id) throw new Error('Nothing chosen to seal.');
    return host.fixture({ ...choice, library_id: choice.library_id });
  }
  let design_id = choice.design_id;
  if (!design_id) {
    if (!choice.library_id) throw new Error('Nothing chosen to seal.');
    // A library pick becomes a core design first: free, no generation.
    try { design_id = (await (await beaconsPort(snapshot)).importLibrary(choice.library_id, choice.kind)).design_id; }
    catch { throw new Error('The core could not take the library art. Nothing changed.'); }
  }
  return host.core(design_id, choice);
}
