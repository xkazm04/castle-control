import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { demoFlow } from './flow-demo.jsx';
import { drillFlow } from './flow-drill.jsx';
import { rulesFlow } from './flow-rules.jsx';
import { voteBarFlow } from './flow-votebar.jsx';
import { needsLine } from './needs.jsx';
import { moderationSession } from './session.js';

/**
 * Steward flows for the Gatehouse: setup lives here as small steps, the room keeps the live
 * picture. Fixture mode offers every flow and the Play demo; core mode offers the vote bar
 * (copies the real browser source on seal) and the drill.
 */
export function moderatorSteward(snapshot: Snapshot): ChamberSteward {
  const base = roomSteward('moderator', snapshot, ['ban', 'timeout', 'held', 'moderate', 'gatehouse', 'mod', 'spam']);
  if (snapshot.mode !== 'fixture') return { ...base, flows: [voteBarFlow(snapshot), drillFlow(snapshot)] };
  return {
    ...base,
    greeting: 'The Gatehouse: the AI holds what it is unsure of, you decide. Set the rules, put the vote bar on stream, or play the demo.',
    flows: [rulesFlow, voteBarFlow(snapshot), drillFlow(snapshot)],
    demo: demoFlow,
    catch_up: () => {
      const state = moderationSession(proposalQueue).port.getSnapshot();
      const drafts = proposalQueue.getSnapshot().proposals.filter(item => item.chamber === 'moderator' && isPending(item)).length;
      return { say: needsLine(state.held.length, state.bans.length, drafts), simulated: true,
        lines: [
          ...state.held.slice(0, 2).map(item => ({ label: 'Held', value: item.message_text ?? item.message_id })),
          ...state.bans.slice(0, 1).map(item => ({ label: 'Pending ban', value: item.message_text ?? item.message_id })),
          { label: 'Moat', value: `Chat delay ${state.delay.value ? `${state.delay.value} s` : 'off'} · ${state.shield.value ? 'bridge up' : 'bridge down'}` },
        ] };
    },
  };
}
