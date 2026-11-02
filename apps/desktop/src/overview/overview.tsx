import { ChamberStrip, ProgramMonitor, SealButton, chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Snapshot } from '../model.js';
import type { StewardConnection } from '../client.js';
import { useSampleProgram } from '../shell/program.js';
import { stripStates } from '../shell/strip-states.js';
import { StreamScene } from './scene.jsx';
import { Inspector, Talkback } from './inspector.jsx';
import './overview.css';

export type OverviewProps = {
  snapshot: Snapshot; selected: ModuleId; on_select: (id: ModuleId) => void;
  on_open: (id: ModuleId) => void; steward?: ReactNode;
  connection?: StewardConnection;
};

export function Overview({ snapshot, selected, on_select, on_open, steward, connection }: OverviewProps) {
  const { authority, queue, program, candidate, notice, sealing, proclaim } = useSampleProgram(selected, connection);
  const [tab, setTab] = useState<'talkback' | 'inspector'>('inspector');
  const proclaimCaptionId = useId();
  const candidateChamber = chambers.find(chamber => chamber.id === candidate?.chamber)?.name;
  const pending = queue.proposals.filter(isPending);
  useEffect(() => {
    if (queue.selected_proposal_id && queue.proposals.some(item => item.id === queue.selected_proposal_id && isPending(item))) setTab('inspector');
  }, [queue.selected_proposal_id, queue.proposals]);
  const states = stripStates(snapshot, queue.proposals, program, 'line');
  const select = (chamber: ModuleId) => {
    on_select(chamber); setTab('inspector');
    const proposal = proposalQueue.pending(chamber).at(-1);
    proposalQueue.select(proposal?.id);
    proposalQueue.focus({ chamber });
  };
  return <section className="overview-workspace" aria-label="Overview">
    <div className="overview-bench">
      <header className="overview-heading"><div><h1>Preview and Proclaim</h1><span>The whole keep, in one picture.</span></div>
        <b>{pending.length} {pending.length === 1 ? 'proposal' : 'proposals'}</b></header>
      <div className="overview-preview-wrap"><div className="overview-preview" aria-label="Stream preview">
        <StreamScene mode="preview" proposals={[...program, ...pending]} sample={snapshot.mode === 'fixture'}
          simulated={snapshot.mode === 'fixture' || snapshot.status?.simulated === true} on_select={select} />
      </div></div>
      <ChamberStrip selected={selected} states={states} on_select={select} on_open={on_open} />
    </div>
    <aside className="overview-sidebar">
      <ProgramMonitor><StreamScene mode="program" proposals={program} sample={snapshot.mode === 'fixture'}
        simulated={snapshot.mode === 'fixture' || snapshot.status?.simulated === true} /></ProgramMonitor>
      <div className="overview-proclaim" role="group" aria-describedby={proclaimCaptionId}>
        <p id={proclaimCaptionId} className="overview-proclaim-caption">{candidate
          ? `Next to proclaim: ${candidate.title} · rev ${candidate.revision} (${candidateChamber ?? candidate.chamber})`
          : 'Nothing to proclaim: ask the Steward to draft one'}</p>
        <SealButton key={`${candidate?.id}-${candidate?.revision}-${candidate?.state}`} variant="proclaim" disabled={!candidate || sealing}
          on_seal={() => { void proclaim(); }} />
        <p className="overview-proclaim-note" role="status">{notice || 'Drafts stay in Preview until your hold. No live output.'}</p>
      </div>
      <div className="overview-tabs" role="tablist" aria-label="Steward and layer details">
        <button type="button" role="tab" id="overview-talkback-tab" aria-controls="overview-talkback" aria-selected={tab === 'talkback'} onClick={() => setTab('talkback')}>Talkback</button>
        <button type="button" role="tab" id="overview-inspector-tab" aria-controls="overview-inspector" aria-selected={tab === 'inspector'} onClick={() => setTab('inspector')}>Inspector</button>
      </div>
      <div className="overview-pane" id="overview-talkback" role="tabpanel" aria-labelledby="overview-talkback-tab" hidden={tab !== 'talkback'}><Talkback /></div>
      <div className="overview-pane" id="overview-inspector" role="tabpanel" aria-labelledby="overview-inspector-tab" hidden={tab !== 'inspector'}>
        <Inspector selected={selected} proposals={queue.proposals} on_open={on_open} active={tab === 'inspector'} authority={authority} />
      </div>
    </aside>
    {steward && <div className="overview-steward">{steward}</div>}
  </section>;
}
