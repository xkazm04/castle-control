import type { ArtifactId } from '@castle-control/ui/design';
import type { ChamberId, Proposal, ProposalQueue } from '@castle-control/ui/steward';
import { isDesignProposal } from '../../overview/design-proposal.js';
import './room.css';

export type RoomDesignSelection = { artifact: ArtifactId; action: 'restyle' | 'custom' };
export const roomArtifacts: Readonly<Record<ChamberId, readonly ArtifactId[]>> = {
  lottery: ['draw'], moderator: ['overlay'], visuals: ['beacon', 'overlay'], studio: ['map'],
};
export const roomArtifactLabels: Readonly<Record<ArtifactId, string>> = {
  draw: 'Draw shapes', urn: 'Urn', beacon: 'Beacon visuals', overlay: 'Chat overlay and vote bar', map: 'War-table panel',
};

export function roomArtifact(chamber: ChamberId, proposal: Proposal): ArtifactId | undefined {
  return isDesignProposal(proposal)
    ? roomArtifacts[chamber].find(artifact => proposal.fields.some(field => field.key === 'artifact' && field.value === artifact))
    : undefined;
}

export function roomProposals(queue: ProposalQueue, chamber: ChamberId): readonly Proposal[] {
  return queue.pending().filter(proposal => isDesignProposal(proposal)
    ? roomArtifact(chamber, proposal) !== undefined : proposal.chamber === chamber);
}

/** Opening a room or returning from Overview selects an existing draft, never generates one. */
export function selectRoomDesign(queue: ProposalQueue, selection: RoomDesignSelection, proposal_id?: string): void {
  const pending = queue.pending().filter(proposal => isDesignProposal(proposal)
    && proposal.fields.some(field => field.key === 'artifact' && field.value === selection.artifact));
  const selected = proposal_id ?? queue.getSnapshot().selected_proposal_id;
  queue.select((pending.find(proposal => proposal.id === selected) ?? pending.at(-1))?.id);
}

export function RoomDesignActions({ chamber, on_open }: {
  chamber: ChamberId; on_open: (selection: RoomDesignSelection) => void;
}) {
  return <section className="room-design-actions" aria-label="Room designs">
    <p className="room-caption">SIMULATED · DATA-ONLY DESIGNS</p>
    {roomArtifacts[chamber].map(artifact => <div key={artifact} role="group" aria-label={`${roomArtifactLabels[artifact]} design`}>
      <strong>{roomArtifactLabels[artifact]}</strong>
      <div><button type="button" onClick={() => on_open({ artifact, action: 'restyle' })}>Restyle</button>
        <button type="button" onClick={() => on_open({ artifact, action: 'custom' })}>Custom design</button></div>
    </div>)}
  </section>;
}
