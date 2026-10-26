import { ProposalCard, WindowedRows } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import { useSyncExternalStore } from 'react';
import { stewardConversation } from '../shell/steward.jsx';
import './inspector.css';

export function FairnessBox() {
  return <aside className="overview-fairness" aria-label="Draw fairness">
    <b>Fairness stays in the room</b>
    <p>Free entry · equal odds. Paid entry and paid weight on prize draws are blocked by default.</p>
    <p>Seal the roll → announce a public round → cast → publish the writ.</p>
    <p>This preview uses generated sample entries. Its SHA-256 is not a verified draw or a live beacon.</p>
  </aside>;
}

export function Inspector({ selected, proposals, on_open, active = true }: {
  selected: ModuleId; proposals: readonly Proposal[]; on_open: (chamber: ModuleId) => void; active?: boolean;
}) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const items = proposals.filter(item => item.chamber === selected && isPending(item));
  return <section className="overview-inspector" aria-label="Selected layer inspector">
    {items.length > 0 && <WindowedRows rows={items} label="Layer proposals" row_key={proposal => proposal.id} row_height={480}>
      {proposal => <ProposalCard proposal={proposal} focused={active && queue.selected_proposal_id === proposal.id}
        on_focus={() => { if (proposalQueue.getSnapshot().selected_proposal_id !== proposal.id) proposalQueue.select(proposal.id); }}
        seal_at_monitor on_seal={() => undefined} on_tear={() => { proposalQueue.tearUp(proposal.id); }} />}
    </WindowedRows>}
    {!items.length && <p>No open proposal for this layer. Ask the Steward to draft one.</p>}
    {selected === 'lottery' && <FairnessBox />}
    <a href={`#/chamber/${selected}`} onClick={event => { event.preventDefault(); on_open(selected); }}>Open the room →</a>
  </section>;
}

export function Talkback() {
  const lines = useSyncExternalStore(stewardConversation.subscribe, stewardConversation.getSnapshot, stewardConversation.getSnapshot);
  return <WindowedRows rows={lines} label="Steward conversation" row_key={line => String(line.id)} row_height={96}>
    {line => <div className="overview-talkback-line"><b>{line.who === 'Steward' ? 'Steward · simulated' : line.who}</b><p>{line.text}</p></div>}
  </WindowedRows>;
}
