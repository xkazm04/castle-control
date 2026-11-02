import type { ConsensusGetResult, Decision } from '@castle-control/contract';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { ModerationPort, ModerationPreview } from '../../moderation-model.js';
import type { RuleBenchPort } from '../../moderation-bench.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { GateControls, Rules } from './controls.jsx';
import { GateLog } from './log.jsx';
import { MessageList } from './messages.jsx';
import { OutputPreview } from './output.jsx';
import type { OutputPort } from './output-model.js';
import { ChatPlayback } from './playback.jsx';
import { RuleBench } from './rule-bench.jsx';

export const moreSummary = 'Live room · rule bench · moat · garrison orders · drill · gate roll · stream output';

/**
 * Rarely used benches, behind one disclosure. Every feature the old ten-section room had is
 * still here; setup journeys also live as Steward flows (Set the rules, Vote bar on stream,
 * Practice a drill).
 */
export function MoreBenches({ state, port, queue, bench, output, marked, directions }: {
  state: ModerationPreview; port: ModerationPort; queue: ProposalQueue; bench: RuleBenchPort; output: OutputPort;
  marked: ReadonlySet<string> | undefined;
  directions: ConsensusGetResult['directions'];
}) {
  const messages: readonly Decision[] = state.messages.slice(0, state.replay_count);
  return <details className="gh-more" open>
    <summary><span className="gh-more__title">More of the Gatehouse</span><span className="gh-more__list">{moreSummary}</span></summary>
    <div className="gh-more__body">
      <section className="gh-bench gh-bench--room moderator-replay" aria-label={copy.live}>
        <ChatPlayback port={port} state={state} /><MessageList messages={messages} marked={marked} />
      </section>
      <div className="gh-bench gh-bench--tools moderator-tools">
        <RuleBench rules={state.rules} messages={messages} bench={bench} queue={queue} />
        <GateControls state={state} queue={queue} />
        <Rules state={state} queue={queue} />
        <section className="moderator-block gh-drill-entry"><h3 className="gh-kicker">{copy.replay}</h3>
          <p className="gh-sm">{copy.replay_gloss} · {copy.drill_ready}. The Steward’s “Practice a drill” guides you through it.</p>
          <a className="cc-btn moderator-drill-link" href="#/chamber/moderator/drill">{copy.replay_open}</a></section>
        <GateLog state={state} queue={queue} />
      </div>
      <div className="gh-bench gh-bench--output"><OutputPreview port={output} messages={messages} directions={directions} /></div>
    </div>
  </details>;
}
