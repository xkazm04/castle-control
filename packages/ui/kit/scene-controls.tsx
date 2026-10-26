import { useState } from 'react';
import type { ModuleId } from '../src/primitives.jsx';
import { ChamberStrip } from '../src/chamber-strip.jsx';
import { DraftFrame } from '../src/draft-frame.jsx';
import { ProgramMonitor } from '../src/program-monitor.jsx';
import { ProposalCard } from '../src/proposal-card.jsx';
import { ProposalQueue } from '../src/steward/queue.js';
import { SimulatedSteward } from '../src/steward/simulated.js';
import type { Proposal } from '../src/steward/port.js';

/** Isolated kit example only; the desktop always imports proposalQueue. */
export default function SceneControls() {
  const [chamber, setChamber] = useState<ModuleId>('lottery');
  const [queue] = useState(() => new ProposalQueue());
  const [steward] = useState(() => new SimulatedSteward(queue));
  const [proposal, setProposal] = useState<Proposal | undefined>();
  const state = { line: 'Illustrative sample layer', on_air: false, preview: true, draft: Boolean(proposal) };
  async function draft() {
    await steward.ask('draft a question draw', { surface: 'overview' });
    await steward.ask('make it 5 winners', { surface: 'overview' });
    setProposal(queue.pending().at(-1));
  }
  return <div className="cc-kit-stack">
    <ChamberStrip selected={chamber} states={{ lottery: state, moderator: state, visuals: state, studio: state }} on_select={setChamber} on_open={setChamber} />
    <DraftFrame>Illustrative preview layer · no live output</DraftFrame>
    <ProgramMonitor><p>Sample Program picture</p></ProgramMonitor>
    <button type="button" onClick={() => { void draft(); }}>Draft and amend a sample writ</button>
    {proposal && <ProposalCard proposal={proposal} focused
      on_seal={() => { const result = queue.seal(proposal.id); if (result.ok) setProposal(result.proposal); }}
      on_tear={() => { const result = queue.tearUp(proposal.id); if (result.ok) setProposal(result.proposal); }} />}
  </div>;
}
