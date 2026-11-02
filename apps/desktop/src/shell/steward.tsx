import { useMemo, useSyncExternalStore } from 'react';
import type { Ref } from 'react';
import { InkButton } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal, StewardContext, StewardPort, StewardTurn } from '@castle-control/ui/steward';
import type { Surface } from '../navigation.js';
import type { StewardConnection } from '../client.js';
import { StewardDock } from '@castle-control/ui/steward-flow';
import type { FlowChamber, UnmatchedReply } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { shellStewardPort } from './core-steward.js';
import { flowChamber, stewardRegistry } from './steward-flows.js';
import './surfaces.css';

export type TalkbackLine = { id: number; who: 'You' | 'Steward'; text: string; live?: boolean };
const greeting = 'Good evening. Draft in the preview, amend in ink, then hold to seal. Nothing acts on a spoken request.';

/** Conversation is shared across mounts; all proposals live only in proposalQueue. */
export function createStewardConversation(port: StewardPort) {
  let snapshot: readonly TalkbackLine[] = [{ id: 0, who: 'Steward', text: greeting }];
  let sequence = 0;
  const listeners = new Set<() => void>();
  const append = (who: TalkbackLine['who'], text: string, live?: boolean) => {
    snapshot = [...snapshot, { id: ++sequence, who, text, ...(live === undefined ? {} : { live }) }];
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async ask(text: string, context: StewardContext, engine: StewardPort = port): Promise<StewardTurn> {
      append('You', text);
      try {
        const turn = await engine.ask(text, context);
        for (const proposal of turn.proposals) {
          if (isPending(proposal)) proposalQueue.addOrUpdate(proposal);
        }
        append('Steward', turn.reply, engine instanceof LiveSteward);
        return turn;
      } catch {
        const reply = 'The Steward could not finish. No authorization was given. Try again.';
        append('Steward', reply, engine instanceof LiveSteward);
        return { reply, proposals: [], focus: null };
      }
    },
  };
}

export const stewardConversation = createStewardConversation(shellStewardPort());

export function stewardContext(current: ModuleId | Surface): StewardContext {
  const selected_proposal_id = proposalQueue.getSnapshot().selected_proposal_id;
  const surface = current === 'demo' ? 'keep' : current;
  return {
    ...(surface === 'keep' || surface === 'overview' ? { surface } : { surface: 'room' as const, chamber: surface }),
    ...(selected_proposal_id ? { selected_proposal_id } : {}),
  };
}

export function routeStewardTurn(turn: StewardTurn, current: ModuleId | Surface,
  select: (chamber: ModuleId) => void, open: (chamber: ModuleId) => void, overview: () => void) {
  if (turn.focus?.chamber) {
    select(turn.focus.chamber);
    if (current !== 'overview') open(turn.focus.chamber);
  } else if (current === 'keep' && turn.proposals.length > 0) overview();
  // Text the engine did not recognise moves nobody: the streamer stays where they are.
}

/** The one fallback for text nothing matched: stay in place and offer this chamber's own chips. */
export function unmatchedReply(name: string, chips: readonly string[]): string {
  const offer = chips.length ? ` In ${name} I can: ${chips.join(', ')}.` : '';
  return `I did not catch that, and nothing has changed.${offer} Pick one below, or say it in a few words.`;
}

/** Review uses the room's existing guarded seal/tear paths, never a second authorization control. */
export function StewardProposal({ proposal, on_open }: { proposal: Proposal; on_open: (chamber: ModuleId) => void }) {
  return <article className="shell-steward-proposal" aria-label={`${proposal.title} proposal`}>
    <b>PROPOSAL · AWAITING YOUR SEAL</b><h3>{proposal.title}</h3>
    <p>Rev {proposal.revision} · {proposal.state}. Review the draft before holding to seal.</p>
    <InkButton onClick={() => { proposalQueue.select(proposal.id); on_open(proposal.chamber); }}>Review in the room</InkButton>
  </article>;
}

const sampleSnapshot: Snapshot = { mode: 'fixture', phase: 'ready' };

export function ShellSteward({ context, chamber, snapshot = sampleSnapshot, connection, input_ref,
  on_select, on_open, on_overview, on_chamber }: {
  context: ModuleId | Surface; input_ref?: Ref<HTMLInputElement>;
  /** The flow chamber, when it differs from the engine context (stream, rehearsal). */
  chamber?: FlowChamber; snapshot?: Snapshot;
  connection?: StewardConnection;
  on_select: (chamber: ModuleId) => void; on_open: (chamber: ModuleId) => void; on_overview: () => void;
  on_chamber?: (chamber: FlowChamber) => void;
}) {
  const port = shellStewardPort(connection);
  const live = port instanceof LiveSteward;
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const proposal = queue.proposals.findLast(isPending);
  const registry = useMemo(() => stewardRegistry(snapshot), [snapshot]);
  async function unmatched(text: string): Promise<UnmatchedReply> {
    // The existing engine (live core, or the offline simulated one) answers what no flow matched.
    const turn = await stewardConversation.ask(text, stewardContext(context), port);
    routeStewardTurn(turn, context, on_select, on_open, on_overview);
    if (!live && !turn.focus && turn.proposals.length === 0) {
      const steward = registry[chamber ?? flowChamber(context)];
      const chips = [...steward.flows.map(flow => flow.chip ?? flow.title), ...(steward.demo ? ['Play demo'] : [])].map(label => label.toLowerCase());
      return { reply: unmatchedReply(steward.name, chips) };
    }
    return { reply: turn.reply, ...(live ? { live: true } : {}) };
  }
  return <StewardDock chamber={chamber ?? flowChamber(context)} registry={registry} mode={live ? 'live' : 'simulated'}
    on_unmatched={unmatched}
    on_chamber={target => {
      if (on_chamber) on_chamber(target);
      else if (target !== 'keep' && target !== 'stream' && target !== 'rehearsal') on_open(target);
    }}
    proposal={proposal ? <StewardProposal proposal={proposal} on_open={on_open} /> : null}
    {...(input_ref ? { input_ref } : {})} />;
}
