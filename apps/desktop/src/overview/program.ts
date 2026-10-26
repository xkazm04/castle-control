import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import { fixtureEntries } from '../lots-fixture.js';

// Presentation snapshots only. This is neither a proposal queue nor OBS delivery.
let snapshot: readonly Proposal[] = [];
const listeners = new Set<() => void>();
export const sampleProgram = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export function programCandidate(chamber: Proposal['chamber']): Proposal | undefined {
  const candidates = proposalQueue.byChamber(chamber).filter(item => isPending(item) || item.state === 'sealed')
    .filter(item => !snapshot.some(aired => aired.id === item.id && aired.revision === item.revision));
  return candidates.find(item => item.id === proposalQueue.getSnapshot().selected_proposal_id) ?? candidates.at(-1);
}

/** Only the Overview monitor's completed hold calls this local projection. */
export async function proclaimToSampleProgram(id: string): Promise<string> {
  const before = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (!before || (!isPending(before) && before.state !== 'sealed')) return 'This proposal is no longer available.';
  let hash: string | undefined;
  if (before.chamber === 'lottery') {
    const prize = before.fields.find(field => field.key === 'prize');
    if (prize && prize.value !== 'none') return 'Prize proposals need the room’s policy checks. Nothing was sealed or proclaimed.';
    // Real SHA-256 over a frozen, generated illustrative roll. This is not a wire writ.
    const entries = fixtureEntries().map(entry => entry.handle).sort();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(entries)));
    hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  // An amendment or tear during hashing invalidates this authorization.
  const current = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (current !== before) return 'The proposal changed. Review it and hold again.';
  if (isPending(before)) {
    const result = before.kind === 'proclaim' ? proposalQueue.proclaim(id) : proposalQueue.seal(id, hash);
    if (!result.ok) return result.reason;
  }
  const authorized = proposalQueue.getSnapshot().proposals.find(item => item.id === id);
  if (!authorized) return 'Proposal unavailable. Program was unchanged.';
  snapshot = [...snapshot.filter(item => item.chamber !== authorized.chamber), authorized];
  for (const listener of listeners) listener();
  return 'Sealed and proclaimed to simulated Program. No live output or viewer action.';
}
