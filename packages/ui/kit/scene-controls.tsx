import { useState } from 'react';
import type { ModuleId } from '../src/primitives.jsx';
import { ChamberStrip } from '../src/chamber-strip.jsx';
import { DraftFrame } from '../src/draft-frame.jsx';
import { PreviewMonitor, ProgramMonitor } from '../src/program-monitor.jsx';
import { SealButton } from '../src/seal-button.jsx';
import { Stamp } from '../src/stamp/stamp.jsx';
import './shell-examples.css';
import { ProposalCard } from '../src/proposal-card.jsx';
import { ProposalQueue } from '../src/steward/queue.js';
import { SimulatedSteward } from '../src/steward/simulated.js';
import type { Proposal } from '../src/steward/port.js';

/** Isolated kit example only; the desktop always imports proposalQueue. */
export default function SceneControls() {
  const [chamber, setChamber] = useState<ModuleId>('lottery');
  const [current, setCurrent] = useState<ModuleId | 'keep'>('lottery');
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
    <ChamberStrip selected={chamber} current={current} on_keep={() => setCurrent('keep')}
      states={{ lottery: state, moderator: state, visuals: state, studio: state }} on_select={setChamber} on_open={setCurrent} />
    <div className="cc-kit-monitor-grid">
      <aside className="cc-monitor-column" aria-label="Empty Preview and Program">
        <PreviewMonitor>{null}</PreviewMonitor><ProgramMonitor>{null}</ProgramMonitor>
        <SealButton disabled on_seal={() => undefined} />
        <div className="cc-fair"><b>Fairness stays in the room</b>Free entry · equal odds. Simulated fixtures only.</div>
      </aside>
      <aside className="cc-monitor-column" aria-label="Simulated Preview and sealed Program">
        <PreviewMonitor><DraftFrame><b>Question draw</b><small>Five winners · simulated draft</small></DraftFrame></PreviewMonitor>
        <ProgramMonitor><div className="cc-monitor-reveal">
          <Stamp kind="sealed" /><b className="cc-monitor-reveal-title">Simulated draw</b>
          <span className="cc-monitor-ticket">simulated-viewer-01</span>
          <span className="cc-monitor-ticket">simulated-viewer-02</span>
        </div></ProgramMonitor>
        <SealButton on_seal={() => undefined} />
        <p className="cc-colnote">Drafts stay in Preview until your hold.</p>
        <div className="cc-fair"><b>Fairness stays in the room</b>Paid entry and paid weight on prize draws are blocked by default. A barred message never counts toward a draw.</div>
      </aside>
    </div>
    <button type="button" onClick={() => { void draft(); }}>Draft and amend a sample writ</button>
    {proposal && <ProposalCard proposal={proposal} focused
      on_seal={() => { const result = queue.seal(proposal.id); if (result.ok) setProposal(result.proposal); }}
      on_tear={() => { const result = queue.tearUp(proposal.id); if (result.ok) setProposal(result.proposal); }} />}
  </div>;
}
