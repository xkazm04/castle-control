import { parseStewardAskParams, parseStewardAskResult, parseWritSealParams, parseWritSealResult,
  parseWritTearParams, parseWritTearResult } from './contract.js';
import type { AskParams, Writ, WritChamber, WritSealParams, WritTearParams } from './contract.js';
import type { ChamberId, Proposal, ProposalResult, StewardContext, StewardPort, StewardTurn } from './port.js';
import { ProposalQueue, proposalQueue } from './queue.js';
import { SimulatedSteward } from './simulated.js';

/** An injected boundary, not a network client. Responses are untrusted JSON text. */
export interface StewardTransport {
  /** steward.ask */
  ask(params: AskParams): Promise<string>;
  /** steward.writ.seal: only the separate human hold path may call this. */
  seal(params: WritSealParams): Promise<string>;
  /** steward.writ.tear */
  tear(params: WritTearParams): Promise<string>;
}

const chambers: Readonly<Record<WritChamber, ChamberId>> = { lots: 'lottery', gatehouse: 'moderator', beacons: 'visuals' };
const wireChambers: Readonly<Partial<Record<ChamberId, WritChamber>>> = { lottery: 'lots', moderator: 'gatehouse', visuals: 'beacons' };
const layers: Readonly<Record<WritChamber, string>> = { lots: 'draw', gatehouse: 'chat', beacons: 'beacon' };
const titles: Readonly<Record<Writ['proposal']['method'], string>> = {
  'lots.draw.upsert': 'Draw configuration', 'gatehouse.rules.upsert': 'Moderation rule',
  'gatehouse.rules.setMode': 'Moderation rule mode', 'beacons.visual.upsert': 'Visual configuration',
  'beacons.curve.set': 'Contribution curve',
};
const failure: StewardTurn = Object.freeze({
  reply: 'The Steward could not confirm this draft. No authorization was given. The proposal queue is unchanged.',
  proposals: Object.freeze([]), focus: null,
});
const unknownSeal: StewardTurn = Object.freeze({
  reply: 'The Steward could not confirm the seal. Reconcile its outcome with the core before trying again.',
  proposals: Object.freeze([]), focus: null,
});

/** Stable display text retains the complete typed snapshot, including optional fields. */
function snapshotText(value: unknown): string {
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    }
    return item;
  });
  if (text === undefined) throw new Error('Missing configuration snapshot');
  return text;
}

function draft(writ: Writ): Proposal {
  const chamber = chambers[writ.chamber];
  const title = titles[writ.proposal.method];
  if (!chamber || !title) throw new Error('Unsupported writ presentation');
  return {
    id: writ.writ_id, chamber, kind: writ.chamber === 'beacons' ? 'proclaim' : 'seal',
    title, revision: 1, state: 'drafted',
    fields: [
      { key: 'before', label: 'Current configuration', value: writ.proposal.diff.before === undefined
        ? 'New configuration' : snapshotText(writ.proposal.diff.before), struck: [] },
      { key: 'after', label: 'Proposed configuration', value: snapshotText(writ.proposal.diff.after), struck: [] },
    ],
  };
}

function matches(writ: Writ, previous: Writ): boolean {
  return writ.writ_id === previous.writ_id && writ.chamber === previous.chamber
    && writ.proposal.method === previous.proposal.method && writ.created_at === previous.created_at
    && Date.parse(writ.updated_at) >= Date.parse(previous.updated_at);
}

/** A live reply proposes data only. It cannot seal, proclaim or manufacture a seal hash. */
export class LiveSteward implements StewardPort {
  readonly #transport: StewardTransport;
  readonly #queue: ProposalQueue;
  readonly #writs = new Map<string, Writ>();
  readonly #uncertain = new Set<string>();
  #requests = 0;

  constructor(transport: StewardTransport, queue: ProposalQueue = proposalQueue) {
    this.#transport = transport;
    this.#queue = queue;
  }

  #current(id: string): Writ | undefined {
    const writ = this.#writs.get(id);
    const proposal = this.#queue.pending().find(item => item.id === id);
    if (!writ || !proposal || this.#uncertain.has(id)) return undefined;
    const expected = draft(writ);
    return proposal.chamber === expected.chamber && proposal.kind === expected.kind
      && expected.fields.every(field => proposal.fields.some(item => item.key === field.key && item.value === field.value))
      ? writ : undefined;
  }

  owns(id: string): boolean { return this.#writs.has(id); }
  uncertain(id: string): boolean { return this.#uncertain.has(id); }

  #turn(result: ProposalResult, reply: string): StewardTurn {
    if (!result.ok) return failure;
    const proposal = result.proposal;
    if (proposal.state === 'drafted' || proposal.state === 'amended') this.#queue.select(proposal.id);
    else if (this.#queue.getSnapshot().selected_proposal_id === proposal.id) this.#queue.select();
    const writ = this.#writs.get(proposal.id);
    const focus = { chamber: proposal.chamber, ...(writ ? { layer: layers[writ.chamber] } : {}) };
    this.#queue.focus(focus);
    return { reply, proposals: [proposal], focus };
  }

  async #ask(text: string, chamber: WritChamber, previous?: Writ): Promise<StewardTurn> {
    if (this.#requests) return failure;
    const before = this.#queue.getSnapshot();
    this.#requests++;
    try {
      const params = parseStewardAskParams(JSON.stringify({ chamber, prompt: text,
        ...(previous ? { writ_id: previous.writ_id } : {}) }));
      const { writ } = parseStewardAskResult(await this.#transport.ask(params));
      if (this.#queue.getSnapshot() !== before || writ.status !== 'proposed' || writ.error !== undefined
        || writ.chamber !== chamber || Date.parse(writ.updated_at) < Date.parse(writ.created_at)
        || (previous ? !matches(writ, previous) : before.proposals.some(proposal => proposal.id === writ.writ_id))) return failure;
      const result = this.#queue.addOrUpdate(draft(writ));
      if (!result.ok) return failure;
      this.#writs.set(writ.writ_id, writ);
      return this.#turn(result, previous
        ? 'Re-inked the draft. Previous values stay struck. It still awaits your hold to seal.'
        : 'Drafted the proposed configuration. Nothing acts until you hold to seal.');
    } catch {
      return failure;
    } finally {
      this.#requests--;
    }
  }

  async ask(text: string, context: StewardContext): Promise<StewardTurn> {
    const id = context.selected_proposal_id;
    if (id !== undefined && this.uncertain(id)) return unknownSeal;
    const previous = id === undefined ? undefined : this.#current(id);
    if (id !== undefined && !previous) return failure;
    const chamber = context.chamber === undefined ? previous?.chamber : wireChambers[context.chamber];
    if (!chamber || (previous && previous.chamber !== chamber)) return failure;
    return this.#ask(text, chamber, previous);
  }

  async amend(proposalId: string, text: string, context: StewardContext): Promise<StewardTurn> {
    if (this.uncertain(proposalId)) return unknownSeal;
    const previous = this.#current(proposalId);
    if (!previous || (context.chamber !== undefined && wireChambers[context.chamber] !== previous.chamber)) return failure;
    return this.#ask(text, previous.chamber, previous);
  }

  async tearUp(proposalId: string): Promise<StewardTurn> {
    if (this.uncertain(proposalId)) return unknownSeal;
    if (this.#requests) return failure;
    const previous = this.#current(proposalId);
    if (!previous) return failure;
    const before = this.#queue.getSnapshot();
    this.#requests++;
    try {
      const params = parseWritTearParams(JSON.stringify({ writ_id: proposalId }));
      const { writ } = parseWritTearResult(await this.#transport.tear(params));
      if (this.#queue.getSnapshot() !== before || writ.status !== 'torn' || writ.error !== undefined
        || !matches(writ, previous) || snapshotText(writ.proposal) !== snapshotText(previous.proposal)) return failure;
      const result = this.#queue.tearUp(proposalId);
      if (!result.ok) return failure;
      this.#writs.set(proposalId, writ);
      return this.#turn(result, 'Torn up. This proposal will not act.');
    } catch {
      return failure;
    } finally {
      this.#requests--;
    }
  }

  /** Called only after a human hold; ask/amend/tear never call it. No automatic retry. */
  async seal(proposalId: string): Promise<StewardTurn> {
    if (this.uncertain(proposalId)) return unknownSeal;
    const previous = this.#current(proposalId);
    if (!previous || this.#requests) return failure;
    const before = this.#queue.getSnapshot();
    const proposal = before.proposals.find(item => item.id === proposalId);
    if (!proposal) return failure;
    this.#requests++;
    this.#uncertain.add(proposalId);
    try {
      const params = parseWritSealParams(JSON.stringify({ writ_id: proposalId }));
      const { writ } = parseWritSealResult(await this.#transport.seal(params));
      if (this.#queue.getSnapshot() !== before || writ.status !== 'sealed' || writ.error !== undefined
        || !matches(writ, previous) || snapshotText(writ.proposal) !== snapshotText(previous.proposal)) return unknownSeal;
      const result = proposal.kind === 'proclaim' ? this.#queue.proclaim(proposalId) : this.#queue.seal(proposalId);
      if (!result.ok) return unknownSeal;
      this.#writs.set(proposalId, writ);
      this.#uncertain.delete(proposalId);
      return this.#turn(result, 'The core confirmed your sealed configuration.');
    } catch {
      return unknownSeal;
    } finally {
      this.#requests--;
    }
  }
}

export interface StewardOptions {
  /** Forward the existing CC_LIVE_* opt-in explicitly; omitted or false stays offline. */
  readonly live?: boolean;
  readonly transport?: StewardTransport;
  readonly queue?: ProposalQueue;
}

export function createSteward(options: StewardOptions = {}): SimulatedSteward | LiveSteward {
  if (options.live !== true || !options.transport) return new SimulatedSteward(options.queue);
  return new LiveSteward(options.transport, options.queue);
}
