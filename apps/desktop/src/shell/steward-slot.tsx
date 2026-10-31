import { useRef, useState, useSyncExternalStore } from 'react';
import { ProposalCard } from '@castle-control/ui';
import { createSealAuthority, LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, Proposal, SealAuthority, SealOutcome } from '@castle-control/ui/steward';
import { sealRoomProposal } from '../rooms/seal-slot/index.jsx';

/** Reuse the human hold and the existing Writ presentation, without chamber mapping. */
export function StewardSealSlot({ chamber, port,
  authority = createSealAuthority({ queue: proposalQueue, live: port, local: sealRoomProposal }) }: {
  chamber: ChamberId; port: LiveSteward; authority?: SealAuthority;
}) {
  const state = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [notice, setNotice] = useState<{ outcome: SealOutcome; proposals: readonly Proposal[] }>();
  const currentProposals = () => proposalQueue.pending(chamber).filter(proposal => authority.owner(proposal) === 'live');
  const proposals = currentProposals();
  const outcome = notice && notice.proposals.length === proposals.length
    && notice.proposals.every((proposal, index) => proposal === proposals[index]) ? notice.outcome : undefined;
  if (notice && !outcome) setNotice(undefined);
  const uncertain = proposals.some(proposal => port.uncertain(proposal.id));
  async function resolve(proposal: Proposal, seal: boolean) {
    if (active.current || proposalQueue.getSnapshot().proposals.find(item => item.id === proposal.id) !== proposal) return;
    active.current = true; setBusy(true); setNotice(undefined);
    try {
      const outcome = await (seal ? authority.seal(proposal) : authority.tear(proposal));
      setNotice({ outcome, proposals: currentProposals() });
    } finally { active.current = false; setBusy(false); }
  }
  return <aside className="shell-seal-slot" aria-label="Seal slot" aria-busy={busy}>
    <h2>{uncertain ? 'Proposal · review the seal outcome' : 'Proposal · awaiting your seal'}</h2>
    <p>{uncertain ? 'LIVE STEWARD · Check the core for unconfirmed seal outcomes before acting.'
      : 'LIVE STEWARD · Nothing acts until you hold to seal.'}</p>
    {!proposals.length && <p>No proposals. Ask the Steward to draft one.</p>}
    {proposals.map(proposal => port.uncertain(proposal.id) ? <article key={proposal.id} className="cc-proposal-card"
      data-module={proposal.chamber} aria-label={`${proposal.title} proposal`}>
      <p className="cc-proposal-stamp">SEAL OUTCOME UNKNOWN · check the core before acting</p>
      <h3>{proposal.title}</h3><p>Rev {proposal.revision} · The seal may have been applied. Do not seal or tear it again.</p>
      <dl>{proposal.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{String(field.value)}</dd></div>)}</dl>
    </article> : <ProposalCard key={proposal.id} proposal={proposal} busy={busy}
      focused={proposal.id === state.selected_proposal_id} on_focus={() => proposalQueue.select(proposal.id)}
      on_seal={() => { void resolve(proposal, true); }} on_tear={() => { void resolve(proposal, false); }} />)}
    {outcome && <p role={outcome.ok ? 'status' : 'alert'}>{outcome.reply}</p>}
  </aside>;
}
