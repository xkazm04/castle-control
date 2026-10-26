import { transition } from './lifecycle.js';
import type { ChamberId, FieldAmendment, Proposal, ProposalEvent, ProposalResult, StewardFocus } from './port.js';

export interface ProposalSnapshot {
  readonly proposals: readonly Proposal[];
  readonly selected_proposal_id?: string;
  readonly focus: StewardFocus | null;
}

export function isPending(proposal: Proposal): boolean {
  return proposal.state === 'drafted' || proposal.state === 'amended';
}

function freezeProposal(proposal: Proposal): Proposal {
  const fields = proposal.fields.map(field => Object.freeze({ ...field, struck: Object.freeze([...field.struck]) }));
  return Object.freeze({ ...proposal, fields: Object.freeze(fields) });
}

/** Pass the exported singleton to every surface. Separate instances isolate tests. */
export class ProposalQueue {
  #snapshot: ProposalSnapshot = Object.freeze({ proposals: Object.freeze([]), focus: null });
  #listeners = new Set<() => void>();

  // Bound functions can be passed directly to useSyncExternalStore.
  getSnapshot = (): ProposalSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  #publish(snapshot: ProposalSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of [...this.#listeners]) listener();
  }

  #save(proposal: Proposal): ProposalResult {
    const frozen = freezeProposal(proposal);
    const exists = this.#snapshot.proposals.some(item => item.id === proposal.id);
    const proposals = exists ? this.#snapshot.proposals.map(item => item.id === proposal.id ? frozen : item)
      : [...this.#snapshot.proposals, frozen];
    this.#publish({ ...this.#snapshot, proposals: Object.freeze(proposals) });
    return { ok: true, proposal: frozen };
  }

  /** Upserts draft fields only. State/history/identity cannot bypass the lifecycle. */
  addOrUpdate(proposal: Proposal): ProposalResult {
    const current = this.#snapshot.proposals.find(item => item.id === proposal.id);
    if (!isPending(proposal) || (current && !isPending(current))) {
      return { ok: false, code: 'invalid_transition', reason: 'Only open drafts can be added or updated.' };
    }
    if (current) {
      if (current.chamber !== proposal.chamber || current.kind !== proposal.kind || current.title !== proposal.title
        || current.fields.length !== proposal.fields.length
        || current.fields.some(field => !proposal.fields.some(next => next.key === field.key))) {
        return { ok: false, code: 'conflict', reason: 'A draft update must preserve its identity and field keys.' };
      }
      const fields = proposal.fields.filter(field => current.fields.some(old => old.key === field.key && old.value !== field.value));
      return fields.length ? this.amend(current.id, fields) : { ok: true, proposal: current };
    }
    if (proposal.state !== 'drafted' || proposal.revision !== 1 || proposal.seal_hash !== undefined
      || !proposal.id.trim() || !proposal.fields.length
      || new Set(proposal.fields.map(field => field.key)).size !== proposal.fields.length
      || proposal.fields.some(field => field.struck.length > 0 || !field.key.trim()
        || (typeof field.value === 'number' && !Number.isFinite(field.value)))) {
      return { ok: false, code: 'invalid_fields', reason: 'New proposals must be fresh revision 1 drafts with unique fields.' };
    }
    return this.#save(proposal);
  }

  #apply(id: string, event: ProposalEvent): ProposalResult {
    const proposal = this.#snapshot.proposals.find(item => item.id === id);
    if (!proposal) return { ok: false, code: 'not_found', reason: 'That proposal is not in the queue.' };
    const result = transition(proposal, event);
    return result.ok ? this.#save(result.proposal) : result;
  }

  amend(id: string, fields: readonly FieldAmendment[]): ProposalResult {
    return this.#apply(id, { type: 'amend', fields });
  }

  seal(id: string, sealHash?: string): ProposalResult {
    return this.#apply(id, sealHash === undefined ? { type: 'seal' } : { type: 'seal', seal_hash: sealHash });
  }

  proclaim(id: string): ProposalResult { return this.#apply(id, { type: 'proclaim' }); }
  tearUp(id: string): ProposalResult { return this.#apply(id, { type: 'tearUp' }); }

  select(id?: string): boolean {
    const proposal = this.#snapshot.proposals.find(item => item.id === id);
    if (id !== undefined && !proposal) return false;
    const focus = proposal ? Object.freeze({ chamber: proposal.chamber }) : this.#snapshot.focus;
    this.#publish(id === undefined ? { proposals: this.#snapshot.proposals, focus }
      : { ...this.#snapshot, selected_proposal_id: id, focus });
    return true;
  }

  focus(focus: StewardFocus | null): void {
    this.#publish({ ...this.#snapshot, focus: focus === null ? null : Object.freeze({ ...focus }) });
  }

  byChamber(chamber: ChamberId): readonly Proposal[] {
    return Object.freeze(this.#snapshot.proposals.filter(proposal => proposal.chamber === chamber));
  }

  pending(chamber?: ChamberId): readonly Proposal[] {
    return Object.freeze(this.#snapshot.proposals.filter(proposal => isPending(proposal) && (chamber === undefined || proposal.chamber === chamber)));
  }
}

/** The Inspector and every chamber seal slot import this exact instance. */
export const proposalQueue = new ProposalQueue();
