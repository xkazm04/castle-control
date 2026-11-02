import { lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EmptyState } from '@castle-control/ui';
import { ChamberSection } from '@castle-control/ui/chamber';
import type { ReactNode } from 'react';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { useFlowDraft, useStewardDraft } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { busyNight, fixtureCandidate, fixtureCharts, fixtureDelay, fixtureReplay } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { Drill } from './drill.jsx';
import { moderationSession } from './session.js';
import { ruleBenchLink } from './rule-bench.jsx';
import { benchInput, evaluateDraft } from '../../moderation-bench.js';
import { BanQueue } from './controls.jsx';
import { GatePlate } from './gate.jsx';
import { Herald } from './herald.jsx';
import { NeedsYou } from './needs.jsx';
import { MoreBenches } from './more.jsx';
import { movedConsensus } from './demo-model.js';
import { demoFlow, isDemoClosing } from './flow-demo.jsx';
import { SandboxBanner, useDemoSandbox } from '../../demo-sandbox.jsx';
import { RulesPicture, rulesFlow, rulesRibbon } from './flow-rules.jsx';
import { voteBarFlow, voteLook, voteRibbon } from './flow-votebar.jsx';
import { DrillPicture, drillFlow, drillRibbon } from './flow-drill.jsx';
import { GatehouseDeck, GateProposalMini, VoteControls } from './deck.jsx';
import SealSlot from '../seal-slot/index.jsx';
import { useGatehouseDrawer } from './drawer-state.js';
import './room.css';
import './gatehouse.css';

const CoreModeratorRoom = lazy(() => import('./core.jsx'));
type Props = { snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode;
  /** Core mode's Play demo: the fixture Gatehouse as a local SIMULATED sandbox; the core is untouched. */
  core_sandbox?: boolean };
const fixtureSnapshot: Snapshot = { mode: 'fixture', phase: 'ready' };
const voteFlow = voteBarFlow(fixtureSnapshot);
const practiceFlow = drillFlow(fixtureSnapshot);

export default function ModeratorRoom(props: Props) {
  const sandbox = useDemoSandbox('moderator', demoFlow.id, isDemoClosing);
  if (props.snapshot.mode === 'core' && sandbox && !props.replay) return <FixtureModeratorRoom {...props} seal_slot={undefined} core_sandbox />;
  return props.snapshot.mode === 'core' ? <CoreModeratorRoom snapshot={props.snapshot} replay={props.replay} seal_slot={props.seal_slot} />
    : <FixtureModeratorRoom {...props} />;
}

function FixtureModeratorRoom({ snapshot, replay, queue = proposalQueue, seal_slot, core_sandbox = false }: Props) {
  const { port, output, bench, view } = moderationSession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const draft = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const room = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const drawer = useGatehouseDrawer({ open: room.more, setOpen: view.setMore });
  // The herald's vote bar redraws when a sealed look changes the session's output.
  const current_output = useSyncExternalStore(output.subscribe, output.getSnapshot, output.getSnapshot);
  const [plan] = useState(() => replay ? view.takeDrill() : undefined);
  const publication = useStewardDraft('moderator');
  const demo = useFlowDraft(demoFlow);
  const rules = useFlowDraft(rulesFlow);
  const voting = useFlowDraft(voteFlow);
  const practice = useFlowDraft(practiceFlow);
  const root = useRef<HTMLDivElement>(null);
  const flow_open = publication?.flow;
  const sandbox = useDemoSandbox('moderator', demoFlow.id, isDemoClosing);
  // A flow raises the Steward's sheet over the lower room: bring the gate, the picture, into view.
  useEffect(() => { if (flow_open) root.current?.scrollIntoView({ block: 'start' }); }, [flow_open]);
  // Another flow moves on from the demo: the gate returns to the real held queue.
  useEffect(() => { if (flow_open && flow_open !== demoFlow.id) view.setDemoResolved(undefined); }, [flow_open, view]);
  const messages = state.messages.slice(0, state.replay_count);
  const { input, original } = benchInput(draft, state.rules);
  const result = evaluateDraft(input, state.rules, messages, original);
  if (snapshot.mode !== 'fixture' && !core_sandbox) return <EmptyState compact title={copy.no_controls} />;
  const link = ruleBenchLink(state.rules, bench);
  if (replay) return <div className="moderator-room"><div className="moderator-drill-room">
    <Drill result={fixtureReplay} delay_s={fixtureDelay.delay_s} draft={draft.draft ? result : undefined}
      rule_bench={{ ...link, open: rule_id => { link.open(rule_id); view.setMore(true); } }}
      compare={fixtureCandidate} busy_night={busyNight} start={plan} />{seal_slot}</div></div>;

  const stage = demo && publication?.step ? publication.step : undefined;
  const moved = room.demo_moved || stage === 'herald' || stage === 'seal';
  const charts = moved ? fixtureCharts.map(chart => movedConsensus(chart)) : fixtureCharts;
  const filter = voting?.shows ?? room.filter;
  const draft_picture = rules ? <section className="gh-draft" aria-label="Draft rules"><RulesPicture draft={rules} /></section>
    : practice ? <section className="gh-draft" aria-label="Drill plan"><DrillPicture draft={practice} /></section> : undefined;
  const resolved = room.demo_resolved ? { choice: room.demo_resolved.choice, on_next: () => view.setDemoResolved(undefined) } : undefined;
  const gate = { state, queue, demo: stage ? { stage, choice: demo?.choice } : undefined, resolved };
  const herald = { results: charts, selected: filter, on_select: (index: number) => view.setFilter(index), look: voteLook(voting, current_output.vote), draft: !!voting,
    caption: moved ? 'the Play demo’s simulated burst moved it' : undefined };
  const open = () => drawer.setOpen(true);
  return <div ref={root} className="moderator-room gh-room" data-demo={stage} data-sandbox={sandbox ? '' : undefined}>
    {sandbox && <SandboxBanner chamber="moderator" demo_id={demoFlow.id} />}
    <GatehouseDeck open={drawer.open} on_close={() => drawer.setOpen(false)}
      picture={<GatePlate {...gate} part="picture"
        ribbon={rules ? rulesRibbon(rules) : voting ? voteRibbon(voting) : practice ? drillRibbon(practice) : undefined} />}
      picture_label="Gatehouse picture · SIMULATED" preview_title="Proposal · awaiting your seal"
      preview={<GateProposalMini queue={queue} flow={[demoFlow, rulesFlow, voteFlow, practiceFlow].find(flow => flow.id === publication?.flow)?.title} on_open={open} />}
      program={<div className="gh-mini-copy"><b>Chat and Herald</b><p>{state.messages.slice(0, state.replay_count).filter(item => item.verdict === 'pass').length} passed · {charts[filter]?.directions[0]?.label ?? 'No direction yet'}</p>
        <p>{herald.look.anchor.replace('-', ' ')} · size {herald.look.size} · {herald.look.art_style}</p></div>}
      columns={[
        <ChamberSection key="queue" title="At the portcullis"><GatePlate {...gate} part="queue" /><BanQueue state={state} queue={queue} /></ChamberSection>,
        <div key="herald" className="gh-deck-column"><ChamberSection title="The gate"><NeedsYou state={state} queue={queue} /></ChamberSection>
          <ChamberSection title="The Herald’s chart" aside={<button type="button" className="cc-btn cc-btn--sm" onClick={open}>Full chart</button>}>
            <Herald {...herald} compact action={<VoteControls queue={queue} />} />
          </ChamberSection></div>,
      ]}>
      {draft_picture}
      <Herald {...herald} action={<VoteControls queue={queue} full />} />
      <MoreBenches state={state} port={port} queue={queue} bench={bench} output={output}
        marked={draft.draft ? result.hit_ids : undefined} directions={charts[filter]?.directions ?? []} />
      <div className="gh-seal">{seal_slot ?? <SealSlot chamber="moderator" queue={queue} />}</div>
    </GatehouseDeck>
  </div>;
}
