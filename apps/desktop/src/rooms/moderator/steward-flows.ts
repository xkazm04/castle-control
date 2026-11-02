import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { coreDemoFlow, demoFlow } from './flow-demo.jsx';
import { gatehousePort } from './core-port.js';
import { drillFlow } from './flow-drill.jsx';
import { rulesFlow } from './flow-rules.jsx';
import { voteBarFlow } from './flow-votebar.jsx';
import { customFlow } from '../../custom-design/flow.js';
import { moderatorCustomHost } from './custom-host.js';
import type { AnyStewardFlow } from '@castle-control/ui/steward-flow';
import { needsLine } from './needs.jsx';
import { moderationSession } from './session.js';

/** Core mode: what the core's Gatehouse reads say now, without inventing a queue it does not expose. */
function coreCatchUp(snapshot: Snapshot) {
  let state;
  try { state = gatehousePort(snapshot)?.getSnapshot(); } catch { state = undefined; }
  if (!state) return { say: 'The Gatehouse on your core is not connected. Reopen the desktop shell.' };
  const chat = state.chat?.items.length ?? 0;
  const lead = state.consensus?.directions[0];
  return { say: chat ? `The gate has read ${chat} retained line${chat === 1 ? '' : 's'} on your core.`
    : 'No chat has reached the gate on your core yet. When chat flows, its verdicts and the herald appear here.',
  lines: [{ label: 'Rules', value: `${state.rules.filter(rule => rule.mode === 'armed').length} armed · ${state.rules.filter(rule => rule.mode === 'shadow').length} watching` },
    { label: 'Herald', value: lead ? `${lead.label} ${(lead.share * 100).toFixed(1)}%` : 'No direction yet' }] };
}

/**
 * Steward flows for the Gatehouse: setup lives here as small steps, the room keeps the live
 * picture. Fixture mode offers every flow and the Play demo; core mode offers the vote bar
 * (copies the real browser source on seal), the drill, and the Play demo in a local sandbox.
 */
export function moderatorSteward(snapshot: Snapshot): ChamberSteward {
  const base = { ...roomSteward('moderator', snapshot, ['ban', 'timeout', 'held', 'moderate', 'gatehouse', 'mod', 'spam']),
    hints: [{ phrases: ['ban', 'timeout', 'kick'],
      say: 'I never ban from a sentence. A ban starts on a line the gate flagged: choose Propose ban on it in the Gatehouse, then hold to seal. Set the rules decides what gets flagged.' }] };
  if (snapshot.mode !== 'fixture') return { ...base, flows: [voteBarFlow(snapshot), drillFlow(snapshot), customFlow('vote_bar', snapshot, () => moderatorCustomHost(snapshot)) as AnyStewardFlow], demo: coreDemoFlow,
    greeting: 'The Gatehouse on your core: the gate reads chat in shadow, the herald counts what chat asks for. Show the vote bar, or play the demo in a SIMULATED sandbox. Nothing acts until you hold to seal.',
    catch_up: () => coreCatchUp(snapshot) };
  return {
    ...base,
    greeting: 'The Gatehouse: the AI holds what it is unsure of, you decide. Set the rules, put the vote bar on stream, or play the demo; nothing acts until you hold to seal.',
    flows: [rulesFlow, voteBarFlow(snapshot), drillFlow(snapshot), customFlow('vote_bar', snapshot, () => moderatorCustomHost(snapshot)) as AnyStewardFlow],
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
