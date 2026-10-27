import type { Proposal } from '@castle-control/ui/steward';

// Routing only. The design subpath owns schema validation and application.
export function isDesignProposal(proposal: Proposal): boolean {
  return proposal.fields.some(field => field.key === 'design_action' || field.key === 'artifact');
}
