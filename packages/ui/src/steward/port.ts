/** UI-local draft types. Live writ mapping belongs to WP 5.1, not this port. */
export type ChamberId = 'lottery' | 'moderator' | 'visuals' | 'studio';
export type ProposalKind = 'seal' | 'proclaim';
export type ProposalState = 'drafted' | 'amended' | 'sealed' | 'proclaimed' | 'torn';
export type FieldValue = string | number | boolean;

export interface ProposalField {
  readonly key: string;
  readonly label: string;
  readonly value: FieldValue;
  readonly struck: readonly FieldValue[];
}

export interface Proposal {
  readonly id: string;
  readonly chamber: ChamberId;
  readonly kind: ProposalKind;
  readonly title: string;
  readonly revision: number;
  readonly state: ProposalState;
  readonly fields: readonly ProposalField[];
  /** Supplied by the caller after freezing the roll; never invented here. */
  readonly seal_hash?: string;
}

export interface StewardContext {
  readonly surface: 'keep' | 'overview' | 'room';
  readonly chamber?: ChamberId;
  readonly selected_proposal_id?: string;
}

export interface StewardFocus {
  readonly chamber?: ChamberId;
  readonly layer?: string;
}

export interface StewardTurn {
  readonly reply: string;
  readonly proposals: readonly Proposal[];
  readonly focus: StewardFocus | null;
}

export interface StewardPort {
  ask(text: string, context: StewardContext): Promise<StewardTurn>;
  amend(proposalId: string, text: string, context: StewardContext): Promise<StewardTurn>;
  tearUp(proposalId: string): Promise<StewardTurn>;
}

export interface FieldAmendment {
  readonly key: string;
  readonly value: FieldValue;
}

export type ProposalEvent =
  | { readonly type: 'amend'; readonly fields: readonly FieldAmendment[] }
  | { readonly type: 'seal'; readonly seal_hash?: string }
  | { readonly type: 'proclaim' }
  | { readonly type: 'tearUp' };

export type ProposalResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly code: 'invalid_transition' | 'invalid_fields' | 'not_found' | 'conflict'; readonly reason: string };
