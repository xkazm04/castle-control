import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { proposalQueue } from '@castle-control/ui/steward';
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
import './room.css';

export default function ModeratorRoom({ snapshot, replay, queue = proposalQueue, seal_slot }: {
  snapshot: Snapshot; replay: boolean; queue?: ProposalQueue; seal_slot?: ReactNode;
}) {
  const { port } = moderationSession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  if (snapshot.mode !== 'fixture') return <p>No live moderation controls are available.</p>;
  return <div className="moderator-room">
    {replay ? <div className="moderator-drill-room"><Drill result={fixtureReplay} />{seal_slot}</div> : <div className="moderator-columns">
      <div className="room-column moderator-workbench" role="region" aria-label="Held messages and ban review" tabIndex={0}
        aria-describedby="moderator-scroll-hint">
        <p id="moderator-scroll-hint" className="room-scroll-hint">Scroll for the full held queue, ban review and consensus ↓</p>
        <HeldQueue state={state} queue={queue} /><Consensus results={fixtureCharts} /></div>
      <div className="room-column moderator-details" role="region" aria-label="Gatehouse tools and seal slot" tabIndex={0}>
        <MessageList messages={state.messages.slice(0, 420)} />
        <Rules state={state} queue={queue} /><GateControls state={state} queue={queue} />
        <section className="moderator-card"><h3>{copy.replay}</h3><p className="room-now">Now: sample recording ready · simulated</p>
          <p>{copy.replay_gloss}</p><a href="#/chamber/moderator/drill">{copy.replay_open}</a></section>
        <GateLog state={state} queue={queue} />{seal_slot}</div>
    </div>}
  </div>;
}
