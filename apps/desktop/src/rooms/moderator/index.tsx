import { lazy, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { proposalQueue } from '@castle-control/ui/steward';
import { HeraldicCard, SectionHeading } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { fixtureCharts, fixtureReplay } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { Consensus } from './consensus.jsx';
import { HeldQueue, GateControls, Rules } from './controls.jsx';
import { MessageList } from './messages.jsx';
import { GateLog } from './log.jsx';
import { Drill } from './drill.jsx';
import { moderationSession } from './session.js';
import { ChatPlayback } from './playback.jsx';
import { OutputPreview } from './output.jsx';
import { RuleBench } from './rule-bench.jsx';
import { benchInput, evaluateDraft } from '../../moderation-bench.js';
import './room.css';

const CoreModeratorRoom = lazy(() => import('./core.jsx'));
type Props = { snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode };

export default function ModeratorRoom(props: Props) {
  return props.snapshot.mode === 'core' ? <CoreModeratorRoom snapshot={props.snapshot} replay={props.replay} seal_slot={props.seal_slot} />
    : <FixtureModeratorRoom {...props} />;
}

function FixtureModeratorRoom({ snapshot, replay, queue = proposalQueue, seal_slot }: Props) {
  const { port, output, bench } = moderationSession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const draft = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const messages = state.messages.slice(0, state.replay_count);
  const { input, original } = benchInput(draft, state.rules);
  const result = evaluateDraft(input, state.rules, messages, original);
  if (snapshot.mode !== 'fixture') return <p>{copy.no_controls}</p>;
  return <div className="moderator-room">
    {replay ? <div className="moderator-drill-room"><Drill result={fixtureReplay} draft={draft.draft ? result : undefined} />{seal_slot}</div> : <div className="cc-keep moderator-columns moderator-fixture-columns">
      <div className="room-column moderator-workbench" role="region" aria-label="Held messages and ban review" tabIndex={0}
        aria-describedby="moderator-scroll-hint">
        <p id="moderator-scroll-hint" className="moderator-visually-hidden">{copy.scroll_hint}</p>
        <HeldQueue state={state} queue={queue} /><Consensus results={fixtureCharts} />
        <OutputPreview port={output} messages={state.messages.slice(0, state.replay_count)} directions={fixtureCharts[0]?.directions ?? []} /></div>
      <div className="room-column moderator-details moderator-replay" role="region" aria-label={copy.live} tabIndex={0} data-fill="true">
        <ChatPlayback port={port} state={state} /><MessageList messages={messages} marked={draft.draft ? result.hit_ids : undefined} />
      </div>
      <div className="room-column moderator-tools" role="region" aria-label="Gatehouse tools and seal slot" tabIndex={0}>
        <RuleBench rules={state.rules} messages={messages} bench={bench} queue={queue} />
        <GateControls state={state} queue={queue} /><Rules state={state} queue={queue} />
        <section className="moderator-block"><SectionHeading title={copy.replay} gloss={copy.replay_gloss} />
          <HeraldicCard className="moderator-drill-card"><span className="moderator-status">{copy.drill_ready}</span>
            <a className="moderator-drill-link" href="#/chamber/moderator/drill">{copy.replay_open}</a></HeraldicCard></section>
        <GateLog state={state} queue={queue} />{seal_slot}</div>
    </div>}
  </div>;
}
