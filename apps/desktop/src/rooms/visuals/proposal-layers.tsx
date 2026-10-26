import { useSyncExternalStore } from 'react';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ChamberId, ProposalQueue } from '@castle-control/ui/steward';
import './proposal-layers.css';

/** Read-only mirrors of the shared queue, never another seal slot or queue. */
export function ProposalLayers({ chamber, queue = proposalQueue }: { chamber: ChamberId; queue?: ProposalQueue }) {
  useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  return <div className="room-proposal-layers" aria-label="Proposed layers">
    {queue.pending(chamber).map(proposal => <article className="room-proposal-draft" key={proposal.id}
      data-proposal-layer={proposal.id} data-on-air="false" aria-label={`Proposal: ${proposal.title}`}>
      <p className="room-proposal-stamp">DRAFT · NOT ON AIR</p>
      <h3>{proposal.title}</h3><p>Proposal · revision {proposal.revision} · awaiting your seal</p>
      <dl>{proposal.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>
        {field.struck.map((value, index) => <s key={index}>{String(value)}</s>)}
        <strong>{String(field.value)}</strong>
      </dd></div>)}</dl>
    </article>)}
  </div>;
}
