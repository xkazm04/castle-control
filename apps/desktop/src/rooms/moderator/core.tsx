import { useId, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Rule } from '@castle-control/contract';
import { EmptyState, FieldGroup, HeraldicCard, InkButton, Plate, PlateBand, PlateBody, SectionHeading, Stamp, WindowedRows, rowHeight } from '@castle-control/ui';
import { coreGatehouseConnection } from '../../client.js';
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
import './gatehouse.css';
import { GateArt } from './gate-art.jsx';
import { gatehousePort } from './core-port.js';
import { VoteBarSourceAction } from './vote-source.jsx';
import { stewardDock } from '@castle-control/ui/steward-flow';
import { coreDemoFlow } from './flow-demo.jsx';
import { ChamberSection } from '@castle-control/ui/chamber';
import { proposalQueue } from '@castle-control/ui/steward';
import { GatehouseDeck, GateProposalMini } from './deck.jsx';
import { useGatehouseDrawer } from './drawer-state.js';

function CoreRule({ rule, busy, port }: { rule: Rule; busy: boolean; port: CoreGatehousePort }) {
  const name_id = useId();
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
      <Stamp kind={rule.mode} word={rule.mode === 'armed' ? copy.armed : copy.watching} /></div>
    {editable && <FieldGroup label={copy.rule_name} control_id={name_id}><input id={name_id} name="name" defaultValue={rule.name} disabled={busy} required /></FieldGroup>}
    {editable && <InkButton type="submit" size="room" disabled={busy}>{copy.save_watching}</InkButton>}
    {!editable && <p>{rule.rule_class === 'rail' ? copy.rail_fixed : rule.mode === 'shadow' ? copy.bench_edit_here : copy.edit_shadow}</p>}
  </form></HeraldicCard>;
}

export function ConnectedGatehouse({ port, replay, seal_slot }: { port: CoreGatehousePort; replay: boolean; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const bench = coreRuleBench(port);
  const draft = useSyncExternalStore(bench.subscribe, bench.getSnapshot, bench.getSnapshot);
  // Snapshot publishes (busy flips, notices) and unrelated renders must not rebuild the accumulated chat
  // or re-run the pattern over it; only a new chat page, rule list or bench edit does.
  const messages = useMemo(() => state.chat?.items.map(item => ({ ...item.decision, message_text: item.message.text })) ?? [], [state.chat]);
  const result = useMemo(() => {
    const { input, original } = benchInput(draft, state.rules);
    return evaluateDraft(input, state.rules, messages, original);
  }, [draft, state.rules, messages]);
  const [more, setMore] = useState(false);
  const drawer = useGatehouseDrawer({ open: more, setOpen: setMore });
  useEffect(() => { void port.load(); }, [port]);
  if (replay) return <div className="moderator-room" aria-label="Core Gatehouse" aria-busy={state.busy}>
    <div className="moderator-core-status"><p role="status">{state.notice}</p>
      <InkButton size="room" type="button" disabled={state.busy} onClick={() => { void port.load(); }}>{copy.refresh_gatehouse}</InkButton></div>
    <div className="moderator-drill-room"><CoreDrill state={state} port={port} />{seal_slot}</div></div>;
  const items = state.chat?.items ?? [];
  const count = (verdict: string) => items.filter(item => item.decision.verdict === verdict).length;
  const open = () => drawer.setOpen(true);
  return <div className="moderator-room gh-room gh-room--core" aria-label="Core Gatehouse" aria-busy={state.busy}>
    <GatehouseDeck open={drawer.open} on_close={() => drawer.setOpen(false)} picture_label="Gatehouse picture · core"
      caption="Core · held-message queue unavailable · stylised illustration" preview_title="Proposal · awaiting your seal" program_title="Program · core"
      picture={<div className="gh-picture"><GateArt waiting={0} simulated={false} unavailable /><span className="gh-picture__label">Held queue unavailable · stylised illustration</span></div>}
      preview={<GateProposalMini queue={proposalQueue} on_open={open} />}
      program={<div className="gh-mini-copy"><b>Chat and Herald</b><p>{items.length} lines read · {count('pass')} passed · {count('hold')} held · {count('bar')} barred</p>
        <p>{state.consensus?.directions[0]?.label ?? copy.core_consensus_empty}</p></div>}
      columns={[
        <ChamberSection key="queue" title="At the portcullis">
        <aside className="cc-panel gh-gate moderator-held-plate" aria-label={copy.held} data-part="queue">
          <div className="gh-gate__main">
            <p className="gh-sm">{items.length ? `The gate is watching · ${items.length} lines read in shadow` : state.phase === 'loading' ? 'Opening the gate…' : 'Quiet at the gate'}</p>
            <p role="status" className="gh-notice">{state.notice}</p>
          </div>
          <div className="gh-gate__side">
            <button type="button" className="cc-btn cc-btn--sm" disabled={state.busy} onClick={() => { void port.load(); }}>{copy.refresh_gatehouse}</button>
            {!items.length && <button type="button" className="cc-btn cc-btn--quiet cc-btn--sm" onClick={() => stewardDock.open(coreDemoFlow)}>Play demo</button>}
          </div>
        </aside>
        <p className="gh-sm">The held-message queue and pending ban queue are unavailable in this connection.</p>
        <button type="button" className="cc-btn cc-btn--sm" onClick={open}>Live room · more of the Gatehouse</button>
        </ChamberSection>,
        <ChamberSection key="herald" title="The Herald’s chart" aside={<button type="button" className="cc-btn cc-btn--sm" onClick={open}>Full chart</button>}>
          <CoreConsensus state={state} port={port} compact />
          <div className="gh-vote-summary"><p className="gh-sm">Vote bar on stream · aggregate shares only</p>
            <VoteBarSourceAction mode="core" busy={state.busy} on_copy={() => { void port.copyVoteBarSource(); }} /></div>
        </ChamberSection>,
      ]}>
          <section aria-label="Core queue details">
            <p className="gh-sm">{copy.core_held_gloss} · {copy.core_label}</p>
            {items.length ? <p>{items.length} line{items.length === 1 ? '' : 's'} read in shadow · {count('pass')} passed · {count('hold')} held · {count('bar')} barred. Every verdict is in the live room in the drawer.</p>
              : <EmptyState compact title={state.phase === 'loading' ? 'Opening the gate…' : 'Quiet at the gate'}
                description="No chat has reached the gate on your core yet. When it does, every line gets a verdict in shadow and the herald counts what chat asks for." />}
          </section>
          <section className="gh-herald" aria-label={copy.consensus}>
            <header className="gh-section-head"><h2 className="cc-section__title">{copy.consensus}<em>{copy.consensus_caption}</em></h2>
              <span className="cc-stamp cc-stamp--inked">{copy.core_label}</span></header>
            <CoreConsensus state={state} port={port} />
            <div className="gh-herald__stage"><h3 className="gh-kicker">Vote bar on stream</h3>
              <p className="gh-sm">Aggregate shares only; no chat text reaches the OBS page.</p>
              <VoteBarSourceAction mode="core" busy={state.busy} on_copy={() => { void port.copyVoteBarSource(); }} /></div>
          </section>
          <section aria-label={copy.live}><CoreChat state={state} port={port} marked={draft.draft ? result.hit_ids : undefined} /></section>
          <div className="gh-seal">{seal_slot}</div>
          <details className="gh-more" open>
            <summary><span className="gh-more__title">More of the Gatehouse</span><span className="gh-more__list">Rule bench · moat · garrison orders · drill · gate roll</span></summary>
            <div className="gh-more__body moderator-tools">
              <p className="gh-sm">{copy.core_queues_unavailable} {copy.core_review_notice}</p>
              <div className="gh-bench"><RuleBench rules={state.rules} messages={messages} bench={bench} core={port} />
                <Plate ink="azure" offset="space-8" className="moderator-moat"
                  band={<PlateBand title={copy.moat_title} gloss={copy.moat_gloss} count={<CountLabel first={copy.unavailable} />} />}>
                  <PlateBody><p>{copy.core_moat_unavailable}</p></PlateBody>
                </Plate></div>
              <div className="gh-bench"><section className="moderator-block moderator-core-rules"><SectionHeading title={copy.orders_title} gloss={copy.core_rules_gloss} />
                <div className="moderator-figures"><span><b>{state.rules.filter(rule => rule.mode === 'armed').length}</b><Stamp kind="armed" word={copy.armed} /></span>
                  <span><b>{state.rules.filter(rule => rule.mode === 'shadow').length}</b><Stamp kind="shadow" word={copy.watching} /></span></div>
                <p className="moderator-note">{copy.core_rules_notice}</p>
                <WindowedRows rows={state.rules} label={copy.core_rules_label} row_height={rowHeight * 10}
                  row_key={rule => rule.rule_id} empty_state={copy.core_rules_empty}>
                  {rule => <CoreRule rule={rule} busy={state.busy} port={port} />}
                </WindowedRows>
              </section>
              <section className="moderator-block"><SectionHeading title={copy.replay} gloss={copy.replay_gloss} />
                <HeraldicCard><p>{copy.capture_intro}</p><a className="moderator-drill-link" href="#/chamber/moderator/drill">{copy.open_drill}</a></HeraldicCard></section>
              <CoreHistory state={state} port={port} /></div>
            </div>
          </details>
    </GatehouseDeck>
  </div>;
}

export default function CoreModeratorRoom({ snapshot, replay, seal_slot }: { snapshot: Snapshot; replay: boolean; seal_slot?: ReactNode }) {
  if (!coreGatehouseConnection(snapshot)) return <section className="moderator-room" aria-label="Core Gatehouse">
    <p role="status">{copy.core_connection_unavailable}</p>{seal_slot}</section>;
  let port: CoreGatehousePort | undefined;
  try { port = gatehousePort(snapshot); }
  catch { port = undefined; }
  if (!port) return <section className="moderator-room"><p role="status">{copy.core_connection_invalid}</p>{seal_slot}</section>;
  return <ConnectedGatehouse port={port} replay={replay} seal_slot={seal_slot} />;
}
