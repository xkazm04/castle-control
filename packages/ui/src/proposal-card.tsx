import type { Proposal } from './steward/port.js';
import { isPending } from './steward/queue.js';
import { SealButton } from './seal-button.jsx';
import './proposal-card.css';

export type ProposalCardProps = {
  proposal: Proposal; focused?: boolean; on_focus?: () => void;
  on_seal: () => void; on_tear: () => void;
  /** Overview puts its sole authorization control below Program. */
  seal_at_monitor?: boolean;
  busy?: boolean;
};

export function ProposalCard({ proposal, focused = false, on_focus, on_seal, on_tear, seal_at_monitor = false, busy = false }: ProposalCardProps) {
  const pending = isPending(proposal);
  return <article className="cc-proposal-card" data-module={proposal.chamber} data-proposal-focused={focused}
    tabIndex={0} onFocus={on_focus} aria-label={`${proposal.title} proposal`}>
    <p className="cc-proposal-stamp">{pending ? 'PROPOSAL · AWAITING YOUR SEAL' : `PROPOSAL · ${proposal.state.toUpperCase()}`}</p>
    <h3>{proposal.title}</h3><p className="cc-proposal-revision">Rev {proposal.revision} · {proposal.state}</p>
    <dl>{proposal.fields.map(field => <div className="cc-proposal-field" key={field.key}>
      <dt>{field.label}</dt><dd>{field.struck.map((old, index) => <s key={index}>{String(old)}</s>)}
        <span className={field.struck.length ? 'cc-proposal-reink' : ''} key={`${field.key}-${proposal.revision}`}>{String(field.value)}</span>
      </dd></div>)}</dl>
    {proposal.seal_hash && <p className="cc-proposal-hash">SHA-256 · {proposal.seal_hash}</p>}
    {pending && <div className="cc-proposal-actions">
      {seal_at_monitor ? <p>Use the hold under Program to seal and proclaim.</p>
        : <SealButton key={`${proposal.id}:${proposal.revision}`} on_seal={on_seal} variant={proposal.kind} disabled={busy} />}
      <button type="button" data-tear-proposal onClick={on_tear}>Tear it up</button>
    </div>}
  </article>;
}
