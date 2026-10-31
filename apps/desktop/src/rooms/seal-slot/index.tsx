import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { ProposalCard } from '@castle-control/ui';
import { createSealAuthority, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, Proposal, ProposalQueue, SealAuthority, SealOutcome } from '@castle-control/ui/steward';
import { isDesignProposal } from '../../overview/design-proposal.js';
import { RoomDesignActions, roomArtifact, roomProposals, selectRoomDesign } from '../design/actions.jsx';
import type { RoomDesignSelection } from '../design/actions.jsx';

const RoomDesignDialog = lazy(() => import('../design/focus.jsx').then(module => ({ default: module.RoomDesignDialog })));
const RoomDesignProposal = lazy(() => import('../design/focus.jsx').then(module => ({ default: module.RoomDesignProposal })));

export async function sealRoomProposal(queue: ProposalQueue, proposal: Proposal): Promise<void> {
  if (isDesignProposal(proposal)) throw new Error('Preview and hold in the design focus to apply this look.');
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

export default function SealSlot({ chamber, enabled = true, queue = proposalQueue,
  authority = createSealAuthority({ queue, local: sealRoomProposal }) }: {
  chamber: ChamberId; enabled?: boolean; queue?: ProposalQueue; authority?: SealAuthority;
}) {
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ outcome: SealOutcome; proposals: readonly Proposal[] }>();
  const [design, setDesign] = useState<RoomDesignSelection>();
  const currentProposals = () => enabled ? roomProposals(queue, chamber) : [];
  const proposals = currentProposals();
  const outcome = notice && notice.proposals.length === proposals.length
    && notice.proposals.every((proposal, index) => proposal === proposals[index]) ? notice.outcome : undefined;
  if (notice && !outcome) setNotice(undefined);
  const openDesign = (selection: RoomDesignSelection, proposal_id?: string) => {
    selectRoomDesign(queue, selection, proposal_id); setDesign(selection);
  };
  const selected = proposals.some(item => item.id === state.selected_proposal_id) ? state.selected_proposal_id : proposals.at(-1)?.id;
  const resolve = async (proposal: Proposal, seal: boolean) => {
    if (busy) return;
    setBusy(true); setNotice(undefined);
    try {
      const outcome = await (seal ? authority.seal(proposal) : authority.tear(proposal));
      setNotice({ outcome, proposals: currentProposals() });
    }
    catch (cause) { setNotice({ outcome: { ok: false,
      reply: cause instanceof Error ? cause.message : 'The proposal could not be sealed.' }, proposals: currentProposals() }); }
    finally { setBusy(false); }
  };
  return <aside className="shell-seal-slot" aria-label="Seal slot" aria-busy={busy}>
    <h2>Proposal · awaiting your seal</h2><p>Nothing acts until you hold to seal.</p>
    {enabled && <RoomDesignActions chamber={chamber} on_open={openDesign} />}
    {!proposals.length && <p>{enabled ? 'No proposals. Ask the Steward to draft one.' : 'Live actions are unavailable.'}</p>}
    {proposals.map(proposal => {
      const artifact = roomArtifact(chamber, proposal);
      return artifact ? <Suspense key={proposal.id} fallback={<p>SIMULATED · {proposal.title} proposal · loading review...</p>}>
        <RoomDesignProposal proposal={proposal} artifact={artifact} focused={proposal.id === selected}
          on_open={() => openDesign({ artifact, action: 'restyle' }, proposal.id)} />
      </Suspense> : <ProposalCard key={proposal.id} proposal={proposal}
        focused={proposal.id === selected} busy={busy} on_focus={() => queue.select(proposal.id)}
        on_tear={() => { void resolve(proposal, false); }} on_seal={() => { void resolve(proposal, true); }} />;
    })}
    {enabled && design && <Suspense fallback={<p role="status">Opening simulated design...</p>}>
      <RoomDesignDialog selection={design} on_close={() => setDesign(undefined)} />
    </Suspense>}
    {outcome && <p role={outcome.ok ? 'status' : 'alert'}>{outcome.reply}</p>}
  </aside>;
}
