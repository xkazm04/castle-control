import { createSealAuthority, isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal, SealAuthority } from '@castle-control/ui/steward';
import { sealRoomProposal } from '../rooms/seal-slot/index.jsx';
import { isDesignProposal } from './design-proposal.js';

export const localAuthority = createSealAuthority({ queue: proposalQueue, local: (queue, proposal) => sealRoomProposal(queue, proposal) });

// Presentation snapshots only. This is neither a proposal queue nor OBS delivery.
let snapshot: readonly Proposal[] = [];
const listeners = new Set<() => void>();
export const sampleProgram = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export function programCandidate(chamber: Proposal['chamber']): Proposal | undefined {
  const candidates = proposalQueue.byChamber(chamber).filter(item => isPending(item) || item.state === 'sealed')
    .filter(item => !isDesignProposal(item))
    .filter(item => !snapshot.some(aired => aired.id === item.id && aired.revision === item.revision));
  return candidates.find(item => item.id === proposalQueue.getSnapshot().selected_proposal_id) ?? candidates.at(-1);
}

/** Pending live holds route through the owner; already-sealed writs need only a presentation snapshot. */
export async function proclaimToSampleProgram(id: string, authority: SealAuthority = localAuthority): Promise<string> {
  const before = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (before && isDesignProposal(before)) return 'Open the design focus. Preview there, then hold to seal and proclaim.';
  if (!before || (!isPending(before) && before.state !== 'sealed')) return 'This proposal is no longer available.';
  if (isPending(before) && authority.owner(before) === 'live') return (await authority.seal(before)).reply;
  if (isPending(before)) {
    const outcome = await authority.seal(before);
    if (!outcome.ok) {
      // An amendment or tear during hashing invalidates this authorization.
      const current = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
      if (current !== before) return 'The proposal changed. Review it and hold again.';
      return outcome.reply;
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
