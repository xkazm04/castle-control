import { ChamberStrip, ProgramMonitor, SealButton, chambers } from '@castle-control/ui';
import type { ChamberLayerState, ModuleId } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Snapshot } from '../model.js';
import type { StewardConnection } from '../client.js';
import { shellSealAuthority } from '../shell/core-steward.js';
import { keepReadModel } from '../keep/read-model.js';
import { StreamScene } from './scene.jsx';
import { Inspector, Talkback } from './inspector.jsx';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from './program.js';
import './overview.css';

export type OverviewProps = {
  snapshot: Snapshot; selected: ModuleId; on_select: (id: ModuleId) => void;
  on_open: (id: ModuleId) => void; steward?: ReactNode;
  connection?: StewardConnection;
};

export function Overview({ snapshot, selected, on_select, on_open, steward, connection }: OverviewProps) {
  const authority = shellSealAuthority(connection);
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const program = useSyncExternalStore(sampleProgram.subscribe, sampleProgram.getSnapshot, sampleProgram.getSnapshot);
  const [tab, setTab] = useState<'talkback' | 'inspector'>('inspector');
  const [notice, setNotice] = useState('Drafts stay in Preview until your hold. No live output.');
  const [sealing, setSealing] = useState(false);
  const read = keepReadModel(snapshot);
  const candidate = programCandidate(selected);
  const proclaimCaptionId = useId();
  const candidateChamber = chambers.find(chamber => chamber.id === candidate?.chamber)?.name;
  const pending = queue.proposals.filter(isPending);
  useEffect(() => {
    if (queue.selected_proposal_id && queue.proposals.some(item => item.id === queue.selected_proposal_id && isPending(item))) setTab('inspector');
  }, [queue.selected_proposal_id, queue.proposals]);
  const states = Object.fromEntries(Object.entries(read.states).map(([id, state]) => {
    const drafts = pending.filter(item => item.chamber === id);
    const draft = drafts.at(-1);
    const aired = program.find(item => item.chamber === id);
    return [id, { line: draft ? `${draft.title} · rev ${draft.revision}` : aired ? `${aired.title} · simulated Program` : state.line,
      on_air: program.some(item => item.chamber === id) || snapshot.mode === 'fixture' && (id === 'moderator' || id === 'visuals'),
      preview: true, draft: Boolean(draft), pending_count: drafts.length }];
  })) as Record<ModuleId, ChamberLayerState>;
  const select = (chamber: ModuleId) => {
    on_select(chamber); setTab('inspector');
    const proposal = proposalQueue.pending(chamber).at(-1);
    proposalQueue.select(proposal?.id);
    proposalQueue.focus({ chamber });
  };
  async function proclaim() {
    if (!candidate || sealing) return;
    setSealing(true);
    try { setNotice(await proclaimToSampleProgram(candidate.id, authority)); }
    catch { setNotice('The sample seal could not be computed. Program was unchanged.'); }
    finally { setSealing(false); }
  }
  return <section className="overview-workspace" aria-label="Overview">
    <div className="overview-bench">
      <header className="overview-heading"><div><h1>Preview and Proclaim</h1><span>The whole keep, in one picture.</span></div>
        <b>{pending.length} {pending.length === 1 ? 'proposal' : 'proposals'}</b></header>
      <div className="overview-preview-wrap"><div className="overview-preview" aria-label="Stream preview">
        <StreamScene mode="preview" proposals={[...program, ...pending]} sample={snapshot.mode === 'fixture'} on_select={select} />
      </div></div>
      {steward}
      <ChamberStrip selected={selected} states={states} on_select={select} on_open={on_open} />
    </div>
    <aside className="overview-sidebar">
      <ProgramMonitor><StreamScene mode="program" proposals={program} sample={snapshot.mode === 'fixture'} /></ProgramMonitor>
      <div className="overview-proclaim" role="group" aria-describedby={proclaimCaptionId}>
        <p id={proclaimCaptionId} className="overview-proclaim-caption">{candidate
          ? `Next to proclaim: ${candidate.title} · rev ${candidate.revision} (${candidateChamber ?? candidate.chamber})`
          : 'Nothing to proclaim: ask the Steward to draft one'}</p>
        <SealButton key={`${candidate?.id}-${candidate?.revision}-${candidate?.state}`} variant="proclaim" disabled={!candidate || sealing}
          on_seal={() => { void proclaim(); }} />
        <p role="status">{notice}</p>
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
  </section>;
}
