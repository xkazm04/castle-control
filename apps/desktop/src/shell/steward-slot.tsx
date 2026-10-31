import { useRef, useState, useSyncExternalStore } from 'react';
import { ProposalCard } from '@castle-control/ui';
import { createSealAuthority, LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, Proposal, SealAuthority } from '@castle-control/ui/steward';
import { sealRoomProposal } from '../rooms/seal-slot/index.jsx';

/** Reuse the human hold and the existing Writ presentation, without chamber mapping. */
export function StewardSealSlot({ chamber, port,
  authority = createSealAuthority({ queue: proposalQueue, live: port, local: sealRoomProposal }) }: {
  chamber: ChamberId; port: LiveSteward; authority?: SealAuthority;
}) {
  const state = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [notice, setNotice] = useState('');
  const proposals = proposalQueue.pending(chamber).filter(proposal => authority.owner(proposal) === 'live');
  async function resolve(proposal: Proposal, seal: boolean) {
    if (active.current || proposalQueue.getSnapshot().proposals.find(item => item.id === proposal.id) !== proposal) return;
    active.current = true; setBusy(true);
    try {
      const turn = await (seal ? authority.seal(proposal) : authority.tear(proposal));
      setNotice(turn.reply);
    } finally { active.current = false; setBusy(false); }
  }
  return <aside className="shell-seal-slot" aria-label="Seal slot" aria-busy={busy}>
    <h2>Proposal · awaiting your seal</h2><p>LIVE STEWARD · Nothing acts until you hold to seal.</p>
    {!proposals.length && <p>No proposals. Ask the Steward to draft one.</p>}
    {proposals.map(proposal => <ProposalCard key={proposal.id} proposal={proposal} busy={busy}
      focused={proposal.id === state.selected_proposal_id} on_focus={() => proposalQueue.select(proposal.id)}
      on_seal={() => { void resolve(proposal, true); }} on_tear={() => { void resolve(proposal, false); }} />)}
    {notice && <p role="status">{notice}</p>}
  </aside>;
}
