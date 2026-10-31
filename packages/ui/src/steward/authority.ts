import type { LiveSteward } from './live.js';
import type { Proposal, StewardTurn } from './port.js';
import { isPending } from './queue.js';
import type { ProposalQueue } from './queue.js';

export type SealOutcome = { readonly ok: true; readonly reply: string } | { readonly ok: false; readonly reply: string };
export interface SealAuthority {
  owner(proposal: Proposal): 'live' | 'local';
  seal(proposal: Proposal): Promise<SealOutcome>;
  tear(proposal: Proposal): Promise<SealOutcome>;
}

/** One routing door. An unconfirmed live operation must never fall back locally. */
export function createSealAuthority({ queue, live, local }: {
  queue: ProposalQueue; live?: LiveSteward;
  local: (queue: ProposalQueue, proposal: Proposal) => Promise<void>;
}): SealAuthority {
  const owner = (proposal: Proposal) => live?.owns(proposal.id) ? 'live' : 'local';
  const current = (proposal: Proposal) => isPending(proposal)
    && queue.getSnapshot().proposals.find(item => item.id === proposal.id) === proposal;
  const unavailable: SealOutcome = { ok: false, reply: 'The proposal changed. Review it and hold again.' };
  function outcome(turn: StewardTurn, proposal: Proposal, tear: boolean): SealOutcome {
    const ok = turn.proposals.some(item => item.id === proposal.id
      && (tear ? item.state === 'torn' : item.state === 'sealed' || item.state === 'proclaimed'));
    return { ok, reply: turn.reply };
  }
  return {
    owner,
    async seal(proposal) {
      if (!current(proposal)) return unavailable;
      if (owner(proposal) === 'live' && live) return outcome(await live.seal(proposal.id), proposal, false);
      try {
        await local(queue, proposal);
        const sealed = queue.getSnapshot().proposals.find(item => item.id === proposal.id);
        return sealed && sealed.revision === proposal.revision && (sealed.state === 'sealed' || sealed.state === 'proclaimed')
          ? { ok: true, reply: 'Sealed.' } : { ok: false, reply: 'The proposal could not be sealed.' };
      } catch (cause) {
        return { ok: false, reply: cause instanceof Error ? cause.message : 'The proposal could not be sealed.' };
      }
    },
    async tear(proposal) {
      if (!current(proposal)) return unavailable;
      if (owner(proposal) === 'live' && live) return outcome(await live.tearUp(proposal.id), proposal, true);
      const result = queue.tearUp(proposal.id);
      return result.ok ? { ok: true, reply: 'Torn up. This proposal will not act.' } : { ok: false, reply: result.reason };
    },
  };
}
