import { useState, useSyncExternalStore } from 'react';
import { ProposalCard } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, Proposal, ProposalQueue } from '@castle-control/ui/steward';

export async function sealRoomProposal(queue: ProposalQueue, proposal: Proposal): Promise<void> {
  if (proposal.chamber === 'lottery') {
    const { sealLotteryProposal } = await import('../lottery/session.js');
    await sealLotteryProposal(queue, proposal);
  } else if (proposal.chamber === 'moderator') {
    const { sealModerationProposal } = await import('../moderator/session.js');
    sealModerationProposal(queue, proposal);
  } else {
    const result = proposal.kind === 'proclaim' ? queue.proclaim(proposal.id) : queue.seal(proposal.id);
    if (!result.ok) throw new Error(result.reason);
  }
}

export default function SealSlot({ chamber, enabled = true, queue = proposalQueue }: {
  chamber: ChamberId; enabled?: boolean; queue?: ProposalQueue;
}) {
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const proposals = enabled ? queue.pending(chamber) : [];
  const selected = proposals.some(item => item.id === state.selected_proposal_id) ? state.selected_proposal_id : proposals.at(-1)?.id;
  const seal = async (proposal: Proposal) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await sealRoomProposal(queue, proposal); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The proposal could not be sealed.'); }
    finally { setBusy(false); }
  };
  return <aside className="shell-seal-slot" aria-label="Seal slot" aria-busy={busy}>
    <h2>Proposal · awaiting your seal</h2><p>Nothing acts until you hold to seal.</p>
    {!proposals.length && <p>{enabled ? 'No proposals. Ask the Steward to draft one.' : 'Live actions are unavailable.'}</p>}
    {proposals.map(proposal => <ProposalCard key={proposal.id} proposal={proposal}
      focused={proposal.id === selected} busy={busy} on_focus={() => queue.select(proposal.id)}
      on_tear={() => queue.tearUp(proposal.id)} on_seal={() => { void seal(proposal); }} />)}
    {error && <p role="alert">{error}</p>}
  </aside>;
}
