import type { Proposal, ProposalEvent, ProposalKind, ProposalResult, ProposalState } from './port.js';

type StateRow = Readonly<Partial<Record<ProposalEvent['type'], ProposalState>>>;
type StateTable = Readonly<Record<ProposalKind, Readonly<Record<ProposalState, StateRow>>>>;
const terminal = Object.freeze({});
const seal = Object.freeze({ amend: 'amended', seal: 'sealed', tearUp: 'torn' } as const);
const proclaim = Object.freeze({ amend: 'amended', proclaim: 'proclaimed', tearUp: 'torn' } as const);

/** A seal or proclamation is one authorization, never two consecutive steps. */
export const proposalStateTable: StateTable = Object.freeze({
  seal: Object.freeze({ drafted: seal, amended: seal, sealed: terminal, proclaimed: terminal, torn: terminal }),
  proclaim: Object.freeze({ drafted: proclaim, amended: proclaim, sealed: terminal, proclaimed: terminal, torn: terminal }),
});

export function transition(proposal: Proposal, event: ProposalEvent): ProposalResult {
  const next = proposalStateTable[proposal.kind][proposal.state][event.type];
  if (!next) return { ok: false, code: 'invalid_transition', reason: `Cannot ${event.type} a ${proposal.kind} proposal in state ${proposal.state}.` };
  if (event.type === 'amend') {
    const keys = event.fields.map(field => field.key);
    if (!keys.length || new Set(keys).size !== keys.length
      || keys.some(key => !proposal.fields.some(field => field.key === key))
      || event.fields.some(field => typeof field.value === 'number' && !Number.isFinite(field.value))) {
      return { ok: false, code: 'invalid_fields', reason: 'Amend known fields once each, with finite values.' };
    }
    const fields = proposal.fields.map(field => {
      const amendment = event.fields.find(change => change.key === field.key);
      return amendment ? { ...field, value: amendment.value, struck: [...field.struck, field.value] } : field;
    });
    return { ok: true, proposal: { ...proposal, fields, state: next, revision: proposal.revision + 1 } };
  }
  const hash = event.type === 'seal' && event.seal_hash !== undefined ? { seal_hash: event.seal_hash } : {};
  return { ok: true, proposal: { ...proposal, ...hash, state: next } };
}
