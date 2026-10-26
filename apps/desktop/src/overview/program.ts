import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import { sealRoomProposal } from '../rooms/seal-slot/index.jsx';

// Presentation snapshots only. This is neither a proposal queue nor OBS delivery.
let snapshot: readonly Proposal[] = [];
const listeners = new Set<() => void>();
export const sampleProgram = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export function programCandidate(chamber: Proposal['chamber']): Proposal | undefined {
  const candidates = proposalQueue.byChamber(chamber).filter(item => isPending(item) || item.state === 'sealed')
    .filter(item => !snapshot.some(aired => aired.id === item.id && aired.revision === item.revision));
  return candidates.find(item => item.id === proposalQueue.getSnapshot().selected_proposal_id) ?? candidates.at(-1);
}

/** Only the Overview monitor's completed hold calls this local projection. */
export async function proclaimToSampleProgram(id: string): Promise<string> {
  const before = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (!before || (!isPending(before) && before.state !== 'sealed')) return 'This proposal is no longer available.';
  if (isPending(before)) {
    try { await sealRoomProposal(proposalQueue, before); }
    catch (cause) {
      // An amendment or tear during hashing invalidates this authorization.
      const current = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
      if (current !== before) return 'The proposal changed. Review it and hold again.';
      return cause instanceof Error ? cause.message : 'The proposal could not be sealed.';
    }
  }
  const authorized = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (!authorized || (authorized.state !== 'sealed' && authorized.state !== 'proclaimed') || authorized.revision !== before.revision) {
    return 'Proposal unavailable. Program was unchanged.';
  }
  snapshot = [...snapshot.filter(item => item.chamber !== authorized.chamber), authorized];
  for (const listener of listeners) listener();
  return 'Sealed and proclaimed to simulated Program. No live output or viewer action.';
}
