import { Stamp } from '@castle-control/ui';
import type { Proposal } from '@castle-control/ui/steward';
import { lotsCopy as copy } from '../../lots-copy.js';
import { Ticket } from './print.jsx';

export function LotteryWrit({ proposal, weight_notice = copy.equal }: { proposal: Proposal; weight_notice?: string }) {
  return <Ticket writ entrance={2} state={proposal.state} label={copy.writ_label(proposal.title)} stub={copy.writ_stub_revision(proposal.revision)}>
    <div className={`lottery-writ-impression${proposal.seal_hash ? ' lottery-wax' : ''}`}><Stamp kind={proposal.state === 'sealed' ? 'sealed' : 'draft'}
      word={proposal.state === 'sealed' ? copy.sealed_stamp : copy.proposal_stamp} land /></div>
    <h3 className="cc-writ-title">{proposal.title}</h3>
    <p className="cc-writ-rev">{copy.writ_revision(proposal.state, proposal.revision)}</p>
    <dl className="cc-writ-fields">{proposal.fields.map(field => <div key={field.key}>
      <dt>{field.label}</dt><dd>{field.struck.map((value, index) => <s key={index}>{String(value)}</s>)}
        <ins key={`${field.key}-${proposal.revision}`}>{String(field.value)}</ins></dd>
    </div>)}</dl>
    {proposal.seal_hash && <p className="cc-hash">{copy.seal_hash} · {proposal.seal_hash}</p>}
    <div className="cc-writ-fair"><p className="cc-kicker">{copy.fairness_always}</p>
      <p>{weight_notice}</p><p>{copy.fairness_seal}</p></div>
  </Ticket>;
}
