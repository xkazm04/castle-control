import { useState, useSyncExternalStore } from 'react';
import { InkButton, NumberedPanel, PageHeader, RoomStatusHero, RuleTable, StatusChip } from '@castle-control/ui';
import type { ModerationPort } from './moderation-model.js';
import { createModerationPreview } from './moderation-model.js';
import { fixtureCharts, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { moderationCopy as copy } from './moderation-copy.js';
import { ConsensusChart } from './moderation-chart.jsx';
import { MessageList } from './moderation-messages.jsx';
import { DecisionList, ReviewQueues } from './moderation-review.jsx';
import { ReplayPage } from './moderation-replay.jsx';
import './moderation.css';

export function ModerationPage({ replay = false, port }: { replay?: boolean; port?: ModerationPort }) {
  const [local] = useState(createModerationPreview);
  const adapter = port ?? local;
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  if (replay) return <ReplayPage result={fixtureReplay} />;
  return <>
    <PageHeader number={2} title={copy.title} description={copy.description} actions={<StatusChip variant="azure">Watching · simulated</StatusChip>} />
    <p className="moderation-notice" role="status">{copy.notice}</p>
    <RoomStatusHero label="Room status · simulated" cells={[
      { id: 'orders', label: copy.orders, value: 'Slow · 10 s', detail: 'Timed lease · 90 s remaining' },
      { id: 'tier', label: 'Room tier · hysteresis', value: 'Hall · M', detail: 'Hearth / Hall / Courtyard / Tourney field' },
      { id: 'delay', label: copy.delay, value: '4 s', detail: `${snapshot.held.length} held · ${snapshot.bans.length} bans pending` },
    ]} actions={<InkButton size="small" variant={snapshot.shield ? 'danger' : 'outline'} aria-pressed={snapshot.shield}
      onClick={() => adapter.send({ kind: 'shield' })}>{snapshot.shield ? copy.shield_on : copy.shield}</InkButton>}
      action_detail="Shield Mode · preview only" />
    <div className="moderation-grid">
      <div className="moderation-column">
        <NumberedPanel number="2.2" title={copy.consensus} gloss={copy.consensus_gloss}>
          <ConsensusChart results={fixtureCharts} />
        </NumberedPanel>
        <NumberedPanel number="2.1" title={copy.live} gloss="Pass · Hold · Bar on every line">
          <MessageList messages={snapshot.messages} />
        </NumberedPanel>
        <NumberedPanel number="2.3" title={copy.rules} gloss="Rule mode preview">
          <p className="moderation-meta">{copy.modes}</p>
          <RuleTable rules={fixtureRules.rules.map(rule => ({ id: rule.rule_id, name: rule.name,
            match: rule.pattern ?? rule.text ?? 'Safety detector', action: rule.action === 'ban' ? 'ban · human click' : rule.action,
            mode: snapshot.preview_modes.get(rule.rule_id) ?? 'shadow' }))}
            onModeChange={(id, mode) => {
              const rule = fixtureRules.rules.find(item => item.rule_id === id);
              if (rule) adapter.send({ kind: 'mode', rule_id: rule.rule_id, mode });
            }} />
        </NumberedPanel>
      </div>
      <aside className="moderation-column" aria-label="Review and replay">
        <NumberedPanel number="2.0" title={copy.room} gloss="Tier and lease table">
          <table className="moderation-tiers"><thead><tr><th>Tier</th><th>Chatters / 10 min</th></tr></thead><tbody>
            <tr><th>Hearth · S</th><td>0–49</td></tr><tr aria-current="true"><th>Hall · M</th><td>50–249 · current</td></tr>
            <tr><th>Courtyard · L</th><td>250–999</td></tr><tr><th>Tourney field · XL</th><td>1,000+</td></tr>
          </tbody></table>
          <p className="moderation-meta">30 s hysteresis · Slow mode lease: 90 s · returns to prior setting at expiry. Simulated snapshot.</p>
        </NumberedPanel>
        <ReviewQueues snapshot={snapshot} rules={fixtureRules.rules} send={adapter.send} />
        <DecisionList snapshot={snapshot} rules={fixtureRules.rules} send={adapter.send} />
        <NumberedPanel number="2.7" title={copy.replay} gloss={copy.replay_gloss}>
          <p>Last simulated night · 60 messages · 10 would act · 50 observed passes.</p>
          <a className="cc-button moderation-replay-link" data-variant="plate" href="#/moderator/drill">{copy.replay_open}</a>
          <p className="moderation-meta">Open a separate replay page before changing any live rule.</p>
        </NumberedPanel>
      </aside>
    </div>
    <p className="moderation-notice" role="status" aria-live="polite">{snapshot.notice}</p>
  </>;
}
