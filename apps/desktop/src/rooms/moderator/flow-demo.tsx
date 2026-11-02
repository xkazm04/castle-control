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
 * decision, and the herald's chart and vote bar move. Fixture engine only; the room draws each
 * step from the draft, and only the final hold resolves the sample message.
 */
export type DemoDraft = { choice?: 'pass' | 'bar' };
export const demoFlowId = 'gatehouse-demo';
/** The demo's closing line opens with these words; the sandbox stays up on it until the streamer acts. */
const closing = 'Sealed: the sample line is';
export const isDemoClosing = (text: string) => text.startsWith(closing);

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

/**
 * The same SIMULATED demo in fixture and core mode: in core mode it plays in a local sandbox on the
 * fixture engine and never touches the core, and its closing chips offer the core's real flows.
 */
export const gatehouseDemoFlow = (core: boolean) => defineFlow<DemoDraft>({
  id: demoFlowId, chamber: 'moderator', title: 'Play demo · the Gatehouse', simulated: true,
  intents: ['demo', 'show me', 'play demo', 'how does it work'],
  intro: 'Keep chat safe without reading every line: the AI passes the obvious, bars clear abuse, and holds only the lines it is unsure of for you. Four steps, about a minute, all SIMULATED; nothing reaches Twitch.',
  initial: () => ({}),
  steps: [
    { id: 'burst', kind: 'preview', label: 'Burst', continue_label: 'Show me the held one',
      prompt: 'Watch the gate above: eight simulated lines arrive. Six pass, a repeat is barred, and one waits at the portcullis (your held-for-review queue).',
      lines: () => [{ label: 'Passed', value: '6 lines reach chat and the herald' }, { label: 'Barred', value: '1 repeated message' },
        { label: 'Held', value: '1 line waits for a human' }] },
    { id: 'decide', kind: 'choice', label: 'Decision',
      prompt: `The gate held this one for you: “${demoHeldText}” What do you propose?`,
      options: () => [
        { id: 'pass', label: 'Propose pass', consequence: 'A harmless guide link: it reaches chat after your seal.' },
        { id: 'bar', label: 'Propose bar', consequence: 'It never reaches chat, and the herald does not count it.' }],
      apply: (draft, id) => id === 'pass' || id === 'bar' ? { ...draft, choice: id } : draft },
    { id: 'herald', kind: 'preview', label: 'Herald',
      prompt: 'Meanwhile the herald (a live read of what chat is asking for) counts only passed lines: “Go left” surges, and the vote bar on stream moves with it.',
      render: () => <VoteBarStage directions={moved()?.directions ?? []} look={voteLook(undefined)} label="after the burst" /> },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal your decision. This is the only step that acts, and only on sample data.',
      lines, note: 'SIMULATED · demo sandbox. Sealing resolves the sample message locally; nothing reaches Twitch, OBS or your core.' },
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
    // The gate keeps showing this very line, now decided, under the release notice.
    view.setDemoResolved({ decision_id: held.decision_id, choice: draft.choice });
    return { say: `${closing} ${draft.choice === 'pass' ? 'released to chat' : 'barred'}. What you saw: the gate settled seven lines alone and asked you about one, and only passed lines moved the vote bar. That is the Gatehouse: the AI holds, you decide. ${core
      ? 'Your core was not touched. Next: put the real vote bar on stream, or practise a drill.' : 'Next: set the rules for your chat, or put the vote bar on stream.'}`,
      lines: lines(draft),
      chips: core ? [{ label: 'Show the vote bar', action: { kind: 'flow', chamber: 'moderator', flow: 'gatehouse-votebar' } },
        { label: 'Practice a drill', action: { kind: 'flow', chamber: 'moderator', flow: 'gatehouse-drill' } }]
        : [{ label: 'Set the rules', action: { kind: 'flow', chamber: 'moderator', flow: 'gatehouse-rules' } },
          { label: 'Show the vote bar', action: { kind: 'flow', chamber: 'moderator', flow: 'gatehouse-votebar' } }] };
  },
});
export const demoFlow = gatehouseDemoFlow(false);
export const coreDemoFlow = gatehouseDemoFlow(true);
