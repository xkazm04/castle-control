import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EmptyState, ProposalCard, SealButton } from '@castle-control/ui';
import { createSealAuthority, LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, Proposal, SealAuthority, SealOutcome } from '@castle-control/ui/steward';
import { sealRoomProposal } from '../rooms/seal-slot/index.jsx';
import { stewardDock } from '@castle-control/ui/steward-flow';
import type { FlowChamber } from '@castle-control/ui/steward-flow';

/** One hold, one current draft, using exactly the room's existing authorization door. */
export function DeckSealKey({ chamber, authority }: { chamber: FlowChamber; authority: SealAuthority }) {
  const dock = useSyncExternalStore(stewardDock.subscribe, stewardDock.getSnapshot, stewardDock.getSnapshot);
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [sealed, setSealed] = useState(false);
  useEffect(() => {
    if (!sealed) return;
    const timer = setTimeout(() => setSealed(false), 1100);
    return () => clearTimeout(timer);
  }, [sealed]);
  const active = useRef(false);
  if (chamber === 'keep' || chamber === 'stream' || chamber === 'rehearsal') return null;
  const drafts = proposalQueue.pending(chamber);
  const proposal = drafts.find(item => item.id === queue.selected_proposal_id) ?? drafts.at(-1);
  const ready = dock.drafts[chamber]?.ready === true;
  const count = drafts.length + (ready ? 1 : 0);
  async function seal() {
    if (active.current) return;
    active.current = true; setBusy(true);
    try {
      // A flow confirms its own room operation; unrelated proposals remain waiting.
      if (ready) { await stewardDock.seal(chamber); setSealed(stewardDock.getSnapshot().sessions[chamber] === undefined); }
      else if (proposal) {
        const outcome = await authority.seal(proposal);
        setSealed(outcome.ok);
        stewardDock.say({ chamber, who: 'steward', text: outcome.reply,
          ...(authority.owner(proposal) === 'live' ? { live: true } : { simulated: true }) });
      }
    } finally { active.current = false; setBusy(false); }
  }
  const identity = ready ? JSON.stringify(dock.sessions[chamber]?.state) : `${proposal?.id}:${proposal?.revision}`;
  return <SealButton key={identity} size="key" sealed={sealed} draft_count={count} disabled={!count || busy || dock.sessions[chamber]?.state.status === 'sealing'}
    on_seal={() => { void seal(); }} />;
}

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
    {!proposals.length && <EmptyState compact title="No proposals" description="Ask the Steward to draft one." />}
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
