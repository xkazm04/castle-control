import { parseIntent } from './grammar.js';
import { isPending, ProposalQueue, proposalQueue } from './queue.js';
import type { ChamberId, FieldAmendment, FieldValue, Proposal, ProposalKind, ProposalResult, StewardContext, StewardFocus, StewardPort, StewardTurn } from './port.js';

export interface StewardFacts {
  /** Provenance shown with every factual reply. Defaults are fictional sample data. */
  readonly label: string;
  readonly held_count: number;
  readonly consensus_direction: string;
  readonly consensus_percent: number;
  readonly next_turn: string;
}

export const sampleStewardFacts: Readonly<StewardFacts> = Object.freeze({
  label: 'Sample data', held_count: 3, consensus_direction: 'Left door', consensus_percent: 42,
  next_turn: 'Preview the next unclaimed tile',
});

const layers: Readonly<Record<ChamberId, string>> = Object.freeze({
  lottery: 'draw', moderator: 'chat', visuals: 'beacon', studio: 'map',
});
const help = 'I understand: draft a question draw; make it N winners; no raiders; prize is a signed print; pass or bar a line; pass all as proposed; raise the drawbridge; test fire N gifts; what does chat want; catch me up; what should the next turn be.';

function field(key: string, label: string, value: FieldValue) {
  return { key, label, value, struck: [] };
}

/** Offline only. A reply drafts work; authorization belongs to explicit queue calls. */
export class SimulatedSteward implements StewardPort {
  readonly #queue: ProposalQueue;
  readonly #facts: Readonly<StewardFacts>;
  #sequence = 0;

  constructor(queue: ProposalQueue = proposalQueue, facts: Readonly<StewardFacts> = sampleStewardFacts) {
    this.#queue = queue;
    this.#facts = Object.freeze({ ...facts });
  }

  #reply(reply: string, proposals: readonly Proposal[] = [], focus: StewardFocus | null = null): StewardTurn {
    if (focus) this.#queue.focus(focus);
    return { reply: reply.replaceAll('\u2014', ', '), proposals, focus };
  }

  #result(result: ProposalResult, reply: string): StewardTurn {
    if (!result.ok) return this.#reply(result.reason);
    const proposal = result.proposal;
    this.#queue.select(proposal.id);
    return this.#reply(reply, [proposal], { chamber: proposal.chamber, layer: layers[proposal.chamber] });
  }

  #draft(chamber: ChamberId, kind: ProposalKind, title: string, fields: Proposal['fields']): StewardTurn {
    let id: string;
    do { id = `proposal-${++this.#sequence}`; } while (this.#queue.getSnapshot().proposals.some(proposal => proposal.id === id));
    return this.#result(this.#queue.addOrUpdate({ id, chamber, kind, title, revision: 1, state: 'drafted', fields }),
      `Drafted: ${title}. Nothing acts until you hold to ${kind === 'seal' ? 'seal' : 'seal and proclaim'}.`);
  }

  #amend(fields: readonly FieldAmendment[], context: StewardContext, id?: string): StewardTurn {
    const selected = id ?? context.selected_proposal_id ?? this.#queue.getSnapshot().selected_proposal_id;
    const chosen = selected === undefined ? undefined : this.#queue.getSnapshot().proposals.find(proposal => proposal.id === selected);
    // Explicit selections never silently redirect an amendment to a different draft.
    const target = id !== undefined || context.selected_proposal_id !== undefined ? chosen
      : chosen?.chamber === 'lottery' && isPending(chosen) ? chosen : this.#queue.pending('lottery').at(-1);
    if (!target || target.chamber !== 'lottery') return this.#reply('Choose an open question draw, or ask me to draft one first.');
    return this.#result(this.#queue.amend(target.id, fields), 'Re-inked the draft. The previous value stays struck. It still awaits your hold to seal.');
  }

  async ask(text: string, context: StewardContext): Promise<StewardTurn> {
    const intent = parseIntent(text);
    switch (intent.type) {
      case 'draw': return this.#draft('lottery', 'seal', 'Question draw', [
        field('winners', 'Winners', 3), field('cap', 'Raid cohort cap', '1/3 of winners'),
        field('cooldown', 'Cooldown', 'no repeat for 3 draws'), field('prize', 'Prize', 'none'),
      ]);
      case 'amend': return this.#amend(intent.fields, context);
      case 'verdict': return this.#draft('moderator', 'seal', intent.verdict === 'pass' ? 'Release held chat' : 'Remove chat line', [
        field('verdict', 'Proposed verdict', intent.verdict), field('line', 'Chat line', intent.line),
      ]);
      case 'shield': return this.#draft('moderator', 'seal', 'Raise the drawbridge', [field('shield', 'Shield Mode', true)]);
      case 'fire': return this.#draft('visuals', 'proclaim', 'Test fire', [field('gifts', 'Simulated gifts', intent.gifts)]);
      case 'turn': return this.#draft('studio', 'proclaim', 'Next turn', [field('turn', 'Proposed turn', this.#facts.next_turn)]);
      case 'consensus': return this.#reply(`${this.#facts.label}: chat leans ${this.#facts.consensus_direction}, ${this.#facts.consensus_percent}%. This describes the room and takes no action.`, [], { chamber: 'moderator', layer: 'consensus' });
      case 'brief': return this.#reply(`${this.#facts.label}: ${this.#facts.held_count} held for review. Chat leans ${this.#facts.consensus_direction}, ${this.#facts.consensus_percent}%. ${this.#queue.pending().length} proposals await your hold.`);
      case 'confirm': return this.#reply('Use the hold control to seal or proclaim. A chat reply cannot authorize a proposal.');
      case 'unknown': return this.#reply(help);
    }
  }

  async amend(proposalId: string, text: string, context: StewardContext): Promise<StewardTurn> {
    const intent = parseIntent(text);
    return intent.type === 'amend' ? this.#amend(intent.fields, context, proposalId) : this.#reply(help);
  }

  async tearUp(proposalId: string): Promise<StewardTurn> {
    return this.#result(this.#queue.tearUp(proposalId), 'Torn up. This proposal will not act.');
  }
}
