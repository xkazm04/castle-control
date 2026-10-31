import { useState, useSyncExternalStore } from 'react';
import type { Ref } from 'react';
import { InkButton, StewardBar } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal, StewardContext, StewardPort, StewardTurn } from '@castle-control/ui/steward';
import type { Surface } from '../navigation.js';
import type { StewardConnection } from '../client.js';
import { shellStewardPort } from './core-steward.js';
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
  } else if (current === 'keep') overview();
}

/** Review uses the room's existing guarded seal/tear paths, never a second authorization control. */
export function StewardProposal({ proposal, on_open }: { proposal: Proposal; on_open: (chamber: ModuleId) => void }) {
  return <article className="shell-steward-proposal" aria-label={`${proposal.title} proposal`}>
    <b>PROPOSAL · AWAITING YOUR SEAL</b><h3>{proposal.title}</h3>
    <p>Rev {proposal.revision} · {proposal.state}. Review the draft before holding to seal.</p>
    <InkButton onClick={() => { proposalQueue.select(proposal.id); on_open(proposal.chamber); }}>Review in the room</InkButton>
  </article>;
}

export function ShellSteward({ context, connection, input_ref, on_select, on_open, on_overview }: {
  context: ModuleId | Surface; input_ref?: Ref<HTMLInputElement>;
  connection?: StewardConnection;
  on_select: (chamber: ModuleId) => void; on_open: (chamber: ModuleId) => void; on_overview: () => void;
}) {
  const port = shellStewardPort(connection);
  const live = port instanceof LiveSteward;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useSyncExternalStore(stewardConversation.subscribe, stewardConversation.getSnapshot, stewardConversation.getSnapshot);
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const proposal = queue.proposals.findLast(isPending);
  const message = busy ? 'Drafting. Nothing acts until your hold to seal.' : history.at(-1)?.text ?? greeting;
  async function tell() {
    if (busy || !value.trim()) return;
    setBusy(true);
    const text = value.trim(); setValue('');
    const turn = await stewardConversation.ask(text, stewardContext(context), port);
    routeStewardTurn(turn, context, on_select, on_open, on_overview);
    setBusy(false);
  }
  return <StewardBar mode={live ? 'live' : 'simulated'} message={message} value={value}
    suggestions={['Catch me up', 'Draft a question draw', 'What does chat want?']}
    identity={{ name: 'The Steward', state: busy ? 'Drafting' : live ? 'Live co-pilot' : 'Simulated co-pilot' }}
    proposal={proposal ? <StewardProposal proposal={proposal} on_open={on_open} /> : null}
    on_change={setValue} on_tell={() => { void tell(); }}
    on_suggest={text => {
      setValue(text);
      if (input_ref && 'current' in input_ref) input_ref.current?.focus();
    }} {...(input_ref ? { input_ref } : {})} />;
}
