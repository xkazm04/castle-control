import { useSyncExternalStore } from 'react';
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

export default function ModeratorRoom({ snapshot, replay, queue = proposalQueue }: {
  snapshot: Snapshot; replay: boolean; queue?: ProposalQueue;
}) {
  const { port } = moderationSession(queue);
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  if (snapshot.mode !== 'fixture') return <p>No live moderation controls are available.</p>;
  return <div className="moderator-room">
    {replay ? <Drill result={fixtureReplay} /> : <div className="moderator-columns">
      <div className="room-column"><HeldQueue state={state} queue={queue} /><Consensus results={fixtureCharts} /></div>
      <div className="room-column"><MessageList messages={state.messages.slice(0, 420)} /></div>
      <div className="room-column"><Rules state={state} queue={queue} /><GateControls state={state} queue={queue} />
        <h3>{copy.replay}</h3><p>{copy.replay_gloss}</p><a href="#/chamber/moderator/drill">{copy.replay_open}</a>
        <GateLog state={state} queue={queue} /></div>
    </div>}
  </div>;
}
