import { proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { FlowLine } from '@castle-control/ui/steward-flow';
import { fixtureCharts } from '../../moderation-fixture.js';
import { demoBurst, demoHeldDecision, demoHeldText, movedConsensus } from './demo-model.js';
import { VoteBarStage } from './herald.jsx';
import { voteLook } from './flow-votebar.jsx';
import { moderationSession, sealCommand } from './session.js';

/**
 * Play demo: a SIMULATED chat burst arrives, the gate holds one line, the streamer proposes a
 * decision, and the herald's chart and vote bar move. Fixture mode only; the room draws each
 * step from the draft, and only the final hold resolves the sample message.
 */
export type DemoDraft = { choice?: 'pass' | 'bar' };
export const demoFlowId = 'gatehouse-demo';

const moved = () => { const base = fixtureCharts[0]; return base ? movedConsensus(base) : undefined; };
const lead = () => {
  const first = moved()?.directions[0];
  return first ? `${first.label} ${(first.share * 100).toFixed(1)}%` : 'unavailable';
};
const lines = (draft: DemoDraft): FlowLine[] => [
  { label: 'Burst', value: `${demoBurst.length} simulated lines · ${demoBurst.filter(line => line.verdict === 'pass').length} passed, 1 barred, 1 held` },
  { label: 'Held', value: demoHeldText },
  { label: 'Your decision', value: draft.choice === 'pass' ? 'Pass: it reaches chat' : draft.choice === 'bar' ? 'Bar: it never reaches chat' : 'Not chosen' },
  { label: 'Herald', value: `Vote bar now leads with ${lead()}` },
];

export const demoFlow = defineFlow<DemoDraft>({
  id: demoFlowId, chamber: 'moderator', title: 'Play demo · the Gatehouse', simulated: true,
  intents: ['demo', 'show me', 'play demo', 'how does it work'],
  intro: 'A one-minute SIMULATED demo: a raid bursts into chat, the gate holds one line for you, you decide, and the herald moves. Nothing reaches Twitch.',
  initial: () => ({}),
  steps: [
    { id: 'burst', kind: 'preview', label: 'Burst', continue_label: 'Show me the held one',
      prompt: 'Watch the gate: eight simulated lines arrive. Six pass, a repeat is barred, and one waits for you.',
      lines: () => [{ label: 'Passed', value: '6 lines reach chat and the herald' }, { label: 'Barred', value: '1 repeated message' },
        { label: 'Held', value: '1 line waits for a human' }] },
    { id: 'decide', kind: 'choice', label: 'Decision',
      prompt: `The gate held this one for you: “${demoHeldText}” What do you propose?`,
      options: () => [
        { id: 'pass', label: 'Propose pass', consequence: 'A harmless guide link: it reaches chat after your seal.' },
        { id: 'bar', label: 'Propose bar', consequence: 'It never reaches chat, and the herald does not count it.' }],
      apply: (draft, id) => id === 'pass' || id === 'bar' ? { ...draft, choice: id } : draft },
    { id: 'herald', kind: 'preview', label: 'Herald',
      prompt: 'Meanwhile the herald reads the passed lines: “Go left” surges, and the vote bar on stream moves with it.',
      render: () => <VoteBarStage directions={moved()?.directions ?? []} look={voteLook(undefined)} label="after the burst" /> },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal your decision. This is the only step that acts, and only on sample data.',
      lines, note: 'SIMULATED · fixture mode. Sealing resolves the sample message locally; nothing reaches Twitch or OBS.' },
  ],
  seal: draft => {
    if (!draft.choice) throw new Error('Choose pass or bar first.');
    const { port, view } = moderationSession(proposalQueue);
    // Each play admits a fresh simulated line, so the demo can be replayed.
    let index = 4300;
    while (port.getSnapshot().phases.has(demoHeldDecision(index).decision_id)) index++;
    const held = demoHeldDecision(index);
    port.admit(held);
    sealCommand(proposalQueue, { kind: draft.choice === 'pass' ? 'release' : 'remove', decision_id: held.decision_id },
      draft.choice === 'pass' ? 'Pass held message' : 'Bar held message');
    view.setDemoMoved(true);
    return { say: `Sealed. The sample line is ${draft.choice === 'pass' ? 'released to chat' : 'barred'} once the fixture confirms, the herald keeps the surge, and the gate roll records it. That is the Gatehouse: the AI holds, you decide.`,
      lines: lines(draft) };
  },
});
