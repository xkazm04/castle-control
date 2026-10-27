import { isPending, proposalQueue } from '../steward/queue.js';
import type { ProposalQueue, ProposalSnapshot } from '../steward/queue.js';
import type { ProposalResult } from '../steward/port.js';
import { defaultPreset } from './catalog.js';
import type { ArtifactId, DesignOutput } from './catalog.js';
import { draftDesign, simulatedDesign } from './proposals.js';
import type { DesignGenerator, DesignRequest } from './proposals.js';
import { readDesignProposal } from './schema.js';

export interface DesignLook {
  readonly artifact: ArtifactId;
  readonly revision: number;
  readonly output: DesignOutput;
}
export interface DesignPreview {
  readonly proposal_id: string;
  readonly proposal_revision: number;
  readonly base_revision: number;
  readonly artifact: ArtifactId;
  readonly output: DesignOutput;
}
export interface DesignSnapshot {
  readonly queue: ProposalSnapshot;
  readonly looks: Readonly<Record<ArtifactId, DesignLook>>;
  readonly previews: Readonly<Record<string, DesignPreview>>;
  readonly error?: string;
}
export type PreviewResult = { readonly ok: true; readonly preview: DesignPreview }
  | { readonly ok: false; readonly reason: string };

function initialLook(artifact: ArtifactId): DesignLook {
  return Object.freeze({ artifact, revision: 1, output: defaultPreset(artifact).output });
}

/** Local simulated looks only. No bridge, engine, output adapter or authority over a live artifact. */
export class DesignSession {
  readonly queue: ProposalQueue;
  readonly #generate: DesignGenerator;
  readonly #unsubscribe: () => void;
  #sequence = 0;
  #listeners = new Set<() => void>();
  #snapshot: DesignSnapshot;

  constructor(queue: ProposalQueue = proposalQueue, generate: DesignGenerator = simulatedDesign) {
    this.queue = queue;
    this.#generate = generate;
    this.#snapshot = Object.freeze({ queue: queue.getSnapshot(), previews: Object.freeze({}),
      looks: Object.freeze({ draw: initialLook('draw'), urn: initialLook('urn'), beacon: initialLook('beacon'),
        map: initialLook('map'), overlay: initialLook('overlay') }),
    });
    this.#unsubscribe = queue.subscribe(() => {
      const snapshot = queue.getSnapshot();
      const previews = Object.fromEntries(Object.entries(this.#snapshot.previews)
        .filter(([id]) => snapshot.proposals.some(proposal => proposal.id === id && isPending(proposal))));
      this.#publish({ ...this.#snapshot, queue: snapshot, previews: Object.freeze(previews) });
    });
  }

  dispose(): void { this.#unsubscribe(); this.#listeners.clear(); }
  getSnapshot = (): DesignSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };
  #publish(snapshot: DesignSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of [...this.#listeners]) listener();
  }
  #error(reason: string): { readonly ok: false; readonly reason: string } {
    this.#publish({ ...this.#snapshot, error: reason });
    return { ok: false, reason };
  }
  #clearError(): void {
    this.#publish({ queue: this.#snapshot.queue, looks: this.#snapshot.looks, previews: this.#snapshot.previews });
  }
  current(artifact: ArtifactId): DesignLook { return this.#snapshot.looks[artifact]; }

  draft(request: DesignRequest): ProposalResult {
    let id: string;
    do { id = `design-${++this.#sequence}`; } while (this.queue.getSnapshot().proposals.some(proposal => proposal.id === id));
    return this.#generateDraft(id, request);
  }
  amend(id: string, request: DesignRequest): ProposalResult {
    if (!this.queue.getSnapshot().proposals.some(proposal => proposal.id === id && isPending(proposal))) {
      return { ...this.#error('Choose an open design draft to amend.'), code: 'not_found' };
    }
    return this.#generateDraft(id, request);
  }
  #generateDraft(id: string, request: DesignRequest): ProposalResult {
    const result = draftDesign(this.queue, id, request, this.#generate);
    if (result.ok) { this.#clearError(); this.queue.select(id); }
    else this.#error(result.reason);
    return result;
  }

  preview(id: string): PreviewResult {
    const proposal = this.queue.getSnapshot().proposals.find(item => item.id === id);
    if (!proposal || !isPending(proposal)) return this.#error('Choose an open design draft to preview.');
    const result = readDesignProposal(proposal);
    if (!result.ok) return this.#error(result.reason);
    const preview: DesignPreview = Object.freeze({ proposal_id: id, proposal_revision: proposal.revision,
      base_revision: this.current(result.data.artifact).revision, artifact: result.data.artifact, output: result.data.output });
    this.#clearError();
    this.#publish({ ...this.#snapshot, previews: Object.freeze({ ...this.#snapshot.previews, [id]: preview }) });
    return { ok: true, preview };
  }

  canSeal(preview: DesignPreview): boolean {
    const proposal = this.queue.getSnapshot().proposals.find(item => item.id === preview.proposal_id);
    return this.#snapshot.previews[preview.proposal_id] === preview && proposal !== undefined && isPending(proposal)
      && proposal.revision === preview.proposal_revision && this.current(preview.artifact).revision === preview.base_revision;
  }

  /** Called by a human hold control with the exact preview captured when the hold began. */
  seal(preview: DesignPreview): ProposalResult {
    if (!this.canSeal(preview)) return { ...this.#error('This preview is stale. Preview again before sealing.'), code: 'conflict' };
    const result = this.queue.proclaim(preview.proposal_id);
    if (!result.ok) { this.#error(result.reason); return result; }
    const look = Object.freeze({ artifact: preview.artifact, revision: preview.base_revision + 1, output: preview.output });
    this.#clearError();
    this.#publish({ ...this.#snapshot, looks: Object.freeze({ ...this.#snapshot.looks, [preview.artifact]: look }) });
    return result;
  }

  tearUp(id: string): ProposalResult {
    const result = this.queue.tearUp(id);
    if (result.ok) this.#clearError();
    else this.#error(result.reason);
    return result;
  }
}

/** Mount rooms against this same session and the existing singleton proposal queue. */
export const designSession = new DesignSession();
