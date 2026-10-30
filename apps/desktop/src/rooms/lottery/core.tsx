import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { HeraldicCard, InkButton, SealButton, SectionHeading, WindowedRows } from '@castle-control/ui';
import { coreLotsConnection } from '../../client.js';
import { createCoreLotsPort, lotsRoundLabel } from '../../lots-core.js';
import type { CoreLotsPort } from '../../lots-core.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { Snapshot } from '../../model.js';
import { FairnessSteps, PolicyRibbon, PoolStage, Ticket, policyReason } from './print.jsx';
import './room.css';

export function ConnectedLotsRoom({ port, simulated, seal_slot }: { port: CoreLotsPort; simulated?: boolean; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [user, setUser] = useState('');
  useEffect(() => { if (!port.getSnapshot().locked) void port.load(); }, [port]);
  const draw = state.draw;
  const cap = draw?.rules.cohort_caps.find(item => item.cohort === 'raider');
  return <div className="lottery-room" aria-label={copy.core.title} aria-busy={state.busy}>
    <div className="cc-hall">
      <PoolStage count={state.entries.length} winners={draw?.rules.winner_count ?? copy.not_available}
        winner_detail={copy.selected_draw} held_out={copy.not_available}
        cap={cap ? `${cap.numerator}/${cap.denominator}` : copy.no_cap}
        illustration={lotsRoundLabel(simulated, state.seal_result)} caption={copy.core.caption} title={copy.core.frozen_roll}
        foot={<p>{state.sealed ? copy.core.frozen_notice : copy.core.roll_notice}</p>}>
        <div className="lottery-urn-window">
          <WindowedRows rows={state.entries} label={copy.core.frozen_list} row_key={entry => entry.handle}>
            {entry => <p>{copy.core.entry(entry.handle, entry.weight)}</p>}
          </WindowedRows>
        </div>
      </PoolStage>
      <div className="cc-desk" aria-label={copy.core.workbench}>
        <SectionHeading variant="banner" level={2} title={copy.writ} gloss={copy.writ_gloss} ink="gules" />
        <HeraldicCard variant="raised">
          <h2 className="lottery-card-title">{copy.core.draws}</h2>
          <p className="cc-aside" aria-label={copy.core.round_source}>{lotsRoundLabel(simulated, state.seal_result)}</p>
          <InkButton size="room" disabled={state.busy || state.locked} onClick={() => { void port.load(); }}>{copy.core.refresh}</InkButton>
          {!state.draws.some(item => item.draw_id === 'questions') && <InkButton size="room" disabled={state.busy || state.locked}
            onClick={() => { void port.createQuestionDraw(); }}>{copy.core.create}</InkButton>}
          <div className="lottery-core-fields">
            <label>{copy.core.draw}<select value={draw?.draw_id ?? ''} disabled={state.busy || state.locked}
              onChange={event => { void port.select(event.currentTarget.value); }}>
              {!draw && <option value="">{copy.core.no_draw}</option>}
              {state.draws.map(item => <option key={item.draw_id} value={item.draw_id}>{item.name}</option>)}
            </select></label>
            {draw && <label>{copy.core.winner_count}<input type="number" min={1} max={65535} value={draw.rules.winner_count}
              disabled={state.busy || state.locked} onChange={event => {
                const winner_count = event.currentTarget.valueAsNumber;
                if (Number.isInteger(winner_count)) void port.edit({ ...draw, rules: { ...draw.rules, winner_count } });
              }} /></label>}
          </div>
          {draw && <>
            <p className="cc-aside">{copy.core.pool(draw.rules.pool.kind, draw.policy.content, draw.rules.cooldown_s)}</p>
            <InkButton size="room" disabled={state.busy} onClick={() => { void port.check(); }}>{copy.core.check}</InkButton>
          </>}
        </HeraldicCard>
        {state.check && <PolicyRibbon result={state.check.result} core />}
        {state.check?.reasons.map(reason => <p className="cc-aside" key={reason}>{policyReason(reason)}</p>)}
        {draw && <HeraldicCard variant="raised" tone="seal" ink="gules">
          <p className="cc-aside">{copy.core.seal_notice}</p>
          <SealButton size="large" disabled={state.busy || state.locked || !state.check || state.check.result === 'blocked'}
            on_seal={() => { void port.seal(); }} />
        </HeraldicCard>}
        <div className="lottery-seal-frame"><HeraldicCard variant="raised" tone="seal" ink="gules">{seal_slot}</HeraldicCard></div>
        <HeraldicCard variant="raised" aria-label={copy.lookup_title}>
          <h2 className="lottery-card-title">{copy.lookup_title}</h2><p className="cc-aside">{copy.core.lookup_hint}</p>
          <div className="lottery-lookup"><label htmlFor="lottery-core-lookup">{copy.core.user_id}</label>
            <input id="lottery-core-lookup" inputMode="numeric" value={user} onChange={event => setUser(event.currentTarget.value)} />
          </div>
          <InkButton size="room" disabled={state.busy || !draw || !user} onClick={() => { void port.lookup(user); }}>{copy.core.lookup}</InkButton>
          {state.lookup_result && <p className="lottery-lookup-result" role="status">
            {state.lookup_result.entry ? copy.core.eligible(state.lookup_result.entry.weight) : copy.core.ineligible}</p>}
        </HeraldicCard>
        {state.seal_result && <Ticket label={copy.core.frozen_roll}>
          <p className="cc-kicker">{copy.core.announced}</p>
          <p className="cc-hash">{copy.writ_fields.seal} · {state.seal_result.sealed.seal}</p>
          <p className="cc-aside">{copy.core.frozen_entries(state.entries.length, state.seal_result.sealed.roll.randomness.source)}</p>
          {state.seal_result.sealed.roll.randomness.source === 'drand_quicknet' && <p className="cc-aside">
            {copy.core.target_round(state.seal_result.sealed.roll.randomness.round)}</p>}
          <InkButton size="room" disabled={state.busy || state.started} onClick={() => { void port.start(); }}>{copy.core.cast}</InkButton>
        </Ticket>}
        {state.cast_result && <Ticket label={copy.core.result}>
          <h3 className="lottery-card-title">{copy.core.winners(state.cast_result.cast.label)}</h3>
          <WindowedRows rows={state.cast_result.cast.winners} label={copy.core.winner_list} row_key={winner => winner}>
            {winner => <p>{winner}</p>}
          </WindowedRows>
          <InkButton size="room" disabled={state.busy} onClick={() => { port.nested(!state.nested); }}>{copy.core.proof}</InkButton>
          <InkButton size="room" disabled={state.busy} onClick={() => { void port.recompute(); }}>{copy.core.reload}</InkButton>
          {state.nested && state.writ && <section aria-label={copy.core.proof_title}>
            <p className="cc-aside">{copy.core.proof_notice}</p>
            <a download="castle-control-writ.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(state.writ))}`}>{copy.core.download}</a>
          </section>}
        </Ticket>}
        <p className="cc-status" role="status">{state.notice}</p>
        <FairnessSteps />
      </div>
    </div>
  </div>;
}

export default function CoreLotteryRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const connection = coreLotsConnection(snapshot);
  if (!connection) return <section className="lottery-room" aria-label={copy.core.title}>
    <p role="status">{copy.core.unavailable}</p>{seal_slot}
  </section>;
  connection.port ??= createCoreLotsPort(connection.launch, connection.transport);
  return <ConnectedLotsRoom port={connection.port} {...(snapshot.status ? { simulated: snapshot.status.simulated } : {})} seal_slot={seal_slot} />;
}
