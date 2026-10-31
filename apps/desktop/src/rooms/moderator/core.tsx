import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Rule } from '@castle-control/contract';
import { HeraldicCard, InkButton, Plate, PlateBand, PlateBody, SectionHeading, StatusChip, WindowedRows, rowHeight } from '@castle-control/ui';
import { coreGatehouseConnection } from '../../client.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { CoreGatehousePort } from '../../gatehouse-core.js';
import type { Snapshot } from '../../model.js';
import { CoreDrill } from './core-drill.jsx';
import { CoreChat, CoreHistory } from './core-reads.jsx';
import { CoreConsensus } from './core-consensus.jsx';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { CountLabel } from './presentation.jsx';
import { coreRuleBench } from './session.js';
import { RuleBench } from './rule-bench.jsx';
import { benchInput, evaluateDraft } from '../../moderation-bench.js';
import './room.css';

function CoreRule({ rule, busy, port }: { rule: Rule; busy: boolean; port: CoreGatehousePort }) {
  const editable = rule.mode === 'shadow' && rule.rule_class === 'classifier';
  return <HeraldicCard><form className="moderator-rule" onSubmit={event => {
    event.preventDefault();
    if (!editable || busy) return;
    const form = new FormData(event.currentTarget);
    const name = form.get('name');
    if (typeof name !== 'string') return;
    void port.upsertRule({ rule: { ...rule, name } });
  }}>
    <div className="moderator-rule-card"><div className="moderator-rule-text"><b>{rule.name}</b><span>{rule.rule_class} · {rule.action}</span></div>
      <StatusChip variant="azure" stamp="mode" ink="azure" tone={rule.mode === 'armed' ? 'solid' : 'neutral'}>
        {rule.mode === 'armed' ? copy.armed : copy.watching}</StatusChip></div>
    {editable && <label>{copy.rule_name}<input name="name" defaultValue={rule.name} disabled={busy} required /></label>}
    {editable && <InkButton type="submit" size="room" disabled={busy}>{copy.save_watching}</InkButton>}
    {!editable && <p>{rule.rule_class === 'rail' ? copy.rail_fixed : rule.mode === 'shadow' ? copy.bench_edit_here : copy.edit_shadow}</p>}
  </form></HeraldicCard>;
}

export function ConnectedGatehouse({ port, replay, seal_slot }: { port: CoreGatehousePort; replay: boolean; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const bench = coreRuleBench(port);
  const draft = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  const messages = state.chat?.items.map(item => ({ ...item.decision, message_text: item.message.text })) ?? [];
  const { input, original } = benchInput(draft, state.rules);
  const result = evaluateDraft(input, state.rules, messages, original);
  useEffect(() => { void port.load(); }, [port]);
  return <div className="moderator-room" aria-label="Core Gatehouse" aria-busy={state.busy}>
    <div className="moderator-core-status"><p role="status">{state.notice}</p>
      <InkButton size="room" type="button" disabled={state.busy} onClick={() => { void port.load(); }}>{copy.refresh_gatehouse}</InkButton></div>
    {replay ? <div className="moderator-drill-room"><CoreDrill state={state} port={port} />{seal_slot}</div>
      : <div className="cc-keep moderator-columns">
        <div className="room-column moderator-workbench" role="region" aria-label="Held messages and ban review" tabIndex={0}>
          <Plate ink="azure" offset="space-8" className="moderator-held-plate"
            band={<PlateBand title={copy.held} gloss={copy.core_held_gloss} count={<CountLabel first={copy.unavailable} />} />}>
            <PlateBody><p>{copy.core_queues_unavailable}</p><p>{copy.core_review_notice}</p></PlateBody>
          </Plate>
          <CoreConsensus state={state} port={port} />
        </div>
        <div className="room-column moderator-details moderator-replay" role="region" aria-label={copy.live} tabIndex={0} data-fill="true">
          <CoreChat state={state} port={port} marked={draft.draft ? result.hit_ids : undefined} />
        </div>
        <div className="room-column moderator-tools" role="region" aria-label="Gatehouse tools and seal slot" tabIndex={0}>
          <RuleBench rules={state.rules} messages={messages} bench={bench} core={port} />
          <Plate ink="azure" offset="space-8" className="moderator-moat"
            band={<PlateBand title={copy.moat_title} gloss={copy.moat_gloss} count={<CountLabel first={copy.unavailable} />} />}>
            <PlateBody><p>{copy.core_moat_unavailable}</p></PlateBody>
          </Plate>
          <section className="moderator-block moderator-core-rules"><SectionHeading title={copy.orders_title} gloss={copy.core_rules_gloss} />
            <div className="moderator-figures"><span><b>{state.rules.filter(rule => rule.mode === 'armed').length}</b>{copy.armed}</span>
              <span><b>{state.rules.filter(rule => rule.mode === 'shadow').length}</b>{copy.watching}</span></div>
            <p className="moderator-note">{copy.core_rules_notice}</p>
            <WindowedRows rows={state.rules} label={copy.core_rules_label} row_height={rowHeight * 10}
              row_key={rule => JSON.stringify(rule)} empty_state={copy.core_rules_empty}>
              {rule => <CoreRule rule={rule} busy={state.busy} port={port} />}
            </WindowedRows>
          </section>
          <section className="moderator-block"><SectionHeading title={copy.replay} gloss={copy.replay_gloss} />
            <HeraldicCard><p>{copy.capture_intro}</p><a className="moderator-drill-link" href="#/chamber/moderator/drill">{copy.open_drill}</a></HeraldicCard></section>
          <CoreHistory state={state} port={port} />{seal_slot}
        </div>
      </div>}
  </div>;
}

export default function CoreModeratorRoom({ snapshot, replay, seal_slot }: { snapshot: Snapshot; replay: boolean; seal_slot?: ReactNode }) {
  const connection = coreGatehouseConnection(snapshot);
  if (!connection) return <section className="moderator-room" aria-label="Core Gatehouse">
    <p role="status">{copy.core_connection_unavailable}</p>{seal_slot}</section>;
  try { connection.port ??= createCoreGatehousePort(connection.launch, connection.transport); }
  catch { return <section className="moderator-room"><p role="status">{copy.core_connection_invalid}</p>{seal_slot}</section>; }
  return <ConnectedGatehouse port={connection.port} replay={replay} seal_slot={seal_slot} />;
}
