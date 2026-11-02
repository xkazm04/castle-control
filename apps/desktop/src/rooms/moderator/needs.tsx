import { useSyncExternalStore } from 'react';
import { isPending } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPreview } from '../../moderation-model.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ShieldButton } from './controls.jsx';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One sentence for what needs a human, read from the fixture state and the open drafts. */
export function needsLine(held: number, bans: number, drafts: number): string {
  const parts = [held && plural(held, 'held message', 'held messages'), bans && plural(bans, 'pending ban', 'pending bans'),
    drafts && plural(drafts, 'draft awaiting your seal', 'drafts awaiting your seal')].filter(Boolean);
  if (!parts.length) return 'Nothing needs you. The gate keeps watch.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${list} ${held + bans + drafts === 1 ? 'needs' : 'need'} you.`;
}

export function NeedsYou({ state, queue }: { state: ModerationPreview; queue: ProposalQueue }) {
  const proposals = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot).proposals;
  const drafts = proposals.filter(item => item.chamber === 'moderator' && isPending(item)).length;
  const delay = state.delay.kind === 'confirming' ? `${state.delay.value} s → ${state.delay.target} s` : state.delay.value ? `${state.delay.value} s` : copy.delay_off;
  return <section className="gh-needs" aria-label="What needs you">
    <p className="gh-needs__line">{needsLine(state.held.length, state.bans.length, drafts)}</p>
    <dl className="gh-needs__facts">
      <div data-tone={state.held.length ? 'held' : 'ok'}><dt>{copy.held_unit}</dt><dd>{state.held.length}</dd></div>
      <div data-tone={state.bans.length ? 'ban' : 'ok'}><dt>Pending bans</dt><dd>{state.bans.length}</dd></div>
      <div data-tone={drafts ? 'held' : 'ok'}><dt>To seal</dt><dd>{drafts}</dd></div>
      <div><dt>Chat delay</dt><dd>{delay}</dd></div>
      <div data-tone={state.shield.value ? 'ban' : 'ok'}><dt>Drawbridge</dt><dd>{state.shield.value ? copy.bridge_up : copy.bridge_down}</dd></div>
    </dl>
    <ShieldButton state={state} queue={queue} />
  </section>;
}
