import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { ConsensusFilter, Rule } from '@castle-control/contract';
import { ConsensusChart, WindowedRows, rowHeight } from '@castle-control/ui';
import { coreGatehouseConnection } from '../../client.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import type { Snapshot } from '../../model.js';
import { CoreDrill } from './core-drill.jsx';
import { CoreChat, CoreHistory } from './core-reads.jsx';
import { moderationCopy as copy } from '../../moderation-copy.js';
import './room.css';

function CoreRule({ rule, busy, port }: { rule: Rule; busy: boolean; port: CoreGatehousePort }) {
  const editable = rule.mode === 'shadow' && rule.rule_class !== 'rail';
  return <form className="moderator-rule" onSubmit={event => {
    event.preventDefault();
    if (!editable || busy) return;
    const form = new FormData(event.currentTarget);
    const name = form.get('name'); const pattern = form.get('pattern');
    if (typeof name !== 'string') return;
    void port.upsertRule({ rule: { ...rule, name,
      ...(rule.rule_class === 'pattern' && typeof pattern === 'string' ? { pattern } : {}) } });
  }}>
    <b>{rule.name}</b><span>{rule.rule_class} · {rule.action} · {rule.mode === 'armed' ? 'Armed' : 'Watching (shadow)'}</span>
    <label>Rule name<input name="name" defaultValue={rule.name} disabled={busy || !editable} required /></label>
    {rule.rule_class === 'pattern' && <label>Match pattern<input name="pattern" defaultValue={rule.pattern ?? ''}
      disabled={busy || !editable} required /></label>}
    {editable && <button type="submit" disabled={busy}>Save watching rule</button>}
    {!editable && <p>{rule.rule_class === 'rail' ? 'Safety rail · fixed by the core.' : 'Editing requires shadow mode in the core.'}</p>}
  </form>;
}

function CoreConsensus({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const [kind, setKind] = useState<ConsensusFilter['kind']>('all');
  const [emote, setEmote] = useState('');
  const result = state.consensus;
  return <section className="moderator-consensus moderator-card"><h2>The Herald’s chart · consensus from core</h2>
    <p>Describes the room; never acts on anyone. Refresh to read the current window.</p>
    <form className="moderator-toolbar" onSubmit={event => {
      event.preventDefault();
      void port.consensus({ filter: kind === 'emote' ? { kind, emote } : { kind }, window_s: 900 });
    }}>
      <label>Consensus messages<select value={kind} disabled={state.busy} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'all' || value === 'emotes' || value === 'text' || value === 'emote') setKind(value);
      }}><option value="all">All messages</option><option value="emotes">Emotes only</option>
        <option value="text">Text only</option><option value="emote">One emote</option></select></label>
      {kind === 'emote' && <label>Emote<input value={emote} required disabled={state.busy}
        onChange={event => setEmote(event.currentTarget.value)} /></label>}
      <button type="submit" disabled={state.busy || (kind === 'emote' && !emote.trim())}>Refresh consensus</button>
    </form>
    <ConsensusChart title="Core opinion directions" filter_label="Loaded window" empty_state="No core consensus loaded."
      results={result ? [{ at: result.at, window_s: result.window_s,
        label: result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind,
        aria_label: 'Core opinion direction history', summary: `${result.shed_count} messages shed · ${result.window_s} second window · ${result.at}`,
        directions: result.directions.map(item => ({ ...item, change_label: item.delta_3m === undefined
          ? 'History unavailable' : `${(item.delta_3m * 100).toFixed(1)} pp / 3 min` })),
      }] : []} />
    {result && !result.directions.length && <p>No opinion directions in the core window.</p>}
  </section>;
}

export function ConnectedGatehouse({ port, replay, seal_slot }: { port: CoreGatehousePort; replay: boolean; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  useEffect(() => { void port.load(); }, [port]);
  return <div className="moderator-room" aria-label="Core Gatehouse" aria-busy={state.busy}>
    <div className="moderator-core-status"><p role="status">{state.notice}</p>
      <button type="button" disabled={state.busy} onClick={() => { void port.load(); }}>Refresh Gatehouse</button></div>
    {replay ? <div className="moderator-drill-room"><CoreDrill state={state} port={port} />{seal_slot}</div>
      : <div className="moderator-columns">
        <div className="room-column moderator-workbench" role="region" aria-label="Core room consensus" tabIndex={0}>
          <CoreConsensus state={state} port={port} />
          <CoreChat state={state} port={port} />
          <section className="moderator-card"><h3>Held messages and ban review</h3>
            <p>The held-message queue and pending ban queue are unavailable in this connection. No sample messages are shown.</p>
            <p>Bans require the original message and human review. Use the channel’s moderation tools.</p></section>
        </div>
        <div className="room-column moderator-details" role="region" aria-label="Core Gatehouse rules" tabIndex={0}>
          <section className="moderator-card"><h2>Garrison orders · core rules</h2>
            <p>{state.rules.filter(rule => rule.mode === 'armed').length} Armed · {state.rules.filter(rule => rule.mode === 'shadow').length} Watching</p>
            <p>This view edits watching rules. It does not arm rules or grant automatic bans.</p>
            <WindowedRows rows={state.rules} label="Core moderation rules" row_height={rowHeight * 8}
              row_key={rule => JSON.stringify(rule)} empty_state="No rules loaded from the core.">
              {rule => <CoreRule rule={rule} busy={state.busy} port={port} />}
            </WindowedRows>
          </section>
          <section className="moderator-card"><h3>The drill · replay simulator</h3>
            <p>{copy.capture_intro}</p>
            <a href="#/chamber/moderator/drill">Open the drill</a></section>
          <CoreHistory state={state} port={port} />{seal_slot}
        </div>
      </div>}
  </div>;
}

export default function CoreModeratorRoom({ snapshot, replay, seal_slot }: { snapshot: Snapshot; replay: boolean; seal_slot?: ReactNode }) {
  const connection = coreGatehouseConnection(snapshot);
  if (!connection) return <section className="moderator-room" aria-label="Core Gatehouse">
    <p role="status">Local Gatehouse connection unavailable. Reopen the desktop shell.</p>{seal_slot}</section>;
  try { connection.port ??= createCoreGatehousePort(connection.launch, connection.transport); }
  catch { return <section className="moderator-room"><p role="status">Local Gatehouse connection is invalid. Reopen the desktop shell.</p>{seal_slot}</section>; }
  return <ConnectedGatehouse port={connection.port} replay={replay} seal_slot={seal_slot} />;
}
