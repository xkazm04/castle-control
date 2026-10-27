import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SealButton, WindowedRows } from '@castle-control/ui';
import { coreLotsConnection } from '../../client.js';
import { createCoreLotsPort } from '../../lots-core.js';
import type { CoreLotsPort } from '../../lots-core.js';
import type { Snapshot } from '../../model.js';
import './room.css';

function ConnectedLotsRoom({ port, seal_slot }: { port: CoreLotsPort; seal_slot?: ReactNode }) {
  const state = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [user, setUser] = useState('');
  useEffect(() => { if (!port.getSnapshot().locked) void port.load(); }, [port]);
  const draw = state.draw;
  return <div className="lottery-room" aria-label="Core Lot Chamber" aria-busy={state.busy}>
    <div className="lottery-columns">
      <div className="room-column lottery-workbench">
        <section className="room-stage lottery-stage" aria-label="Core draw workbench">
          <h2>Draws in your core</h2>
          <button type="button" disabled={state.busy || state.locked} onClick={() => { void port.load(); }}>Refresh draws</button>
          <label>Draw<select value={draw?.draw_id ?? ''} disabled={state.busy || state.locked}
            onChange={event => { void port.select(event.currentTarget.value); }}>
            {!draw && <option value="">No draw selected</option>}
            {state.draws.map(item => <option key={item.draw_id} value={item.draw_id}>{item.name}</option>)}
          </select></label>
          {draw && <>
            <label>Number of winners<input type="number" min={1} max={65535} value={draw.rules.winner_count}
              disabled={state.busy || state.locked} onChange={event => {
                const winner_count = event.currentTarget.valueAsNumber;
                if (Number.isInteger(winner_count)) void port.edit({ ...draw, rules: { ...draw.rules, winner_count } });
              }} /></label>
            <p>Pool: {draw.rules.pool.kind} · {draw.policy.content} · {draw.rules.cooldown_s} second cooldown</p>
            <button type="button" disabled={state.busy} onClick={() => { void port.check(); }}>Check giveaway guardrails</button>
            {state.check && <p className="lottery-guardrails">Giveaway guardrails · {state.check.result}</p>}
            {state.check?.reasons.map(reason => <p key={reason}>{reason}</p>)}
            <p>Sealing freezes the eligible roll in the core and selects a future public round. Entries and randomness stay with the service.</p>
            <SealButton disabled={state.busy || state.locked || !state.check || state.check.result === 'blocked'}
              on_seal={() => { void port.seal(); }} />
          </>}
          {state.seal_result && <>
            <p className="room-hash">Seal · SHA-256 · {state.seal_result.sealed.seal}</p>
            <p>{state.entries.length} frozen entries · {state.seal_result.sealed.roll.randomness.source}</p>
            <button type="button" disabled={state.busy || state.started} onClick={() => { void port.start(); }}>Cast the lots</button>
          </>}
          {state.cast_result && <section aria-label="Core draw result">
            <h3>Winners · {state.cast_result.cast.label}</h3>
            <WindowedRows rows={state.cast_result.cast.winners} label="Draw winners" row_key={winner => winner}>
              {winner => <p>{winner}</p>}
            </WindowedRows>
            <button type="button" disabled={state.busy} onClick={() => { port.nested(!state.nested); }}>Proof bundle</button>
            <button type="button" disabled={state.busy} onClick={() => { void port.recompute(); }}>Reload proof bundle</button>
          </section>}
          {state.nested && state.writ && <section aria-label="Core proof bundle">
            <p>Proof from the core. Download and check with the independent cc-verify or web verifier.</p>
            <a download="castle-control-writ.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(state.writ))}`}>Download proof bundle</a>
          </section>}
        </section>
        <p role="status">{state.notice}</p>
      </div>
      <div className="room-column lottery-details">
        <h2>Entry lookup</h2><p>Use a Twitch user ID. Eligibility is read from the core.</p>
        <label>Twitch user ID<input inputMode="numeric" value={user} onChange={event => setUser(event.currentTarget.value)} /></label>
        <button type="button" disabled={state.busy || !draw || !user} onClick={() => { void port.lookup(user); }}>Look up entry</button>
        {state.lookup_result && <p>{state.lookup_result.entry ? `Eligible · weight ${state.lookup_result.entry.weight}` : 'No currently eligible entry.'}</p>}
        <h3>Frozen roll</h3>
        <p>{state.sealed ? 'These entries came from the core seal.' : 'The roll is owned by the core; entries appear after sealing.'}</p>
        <WindowedRows rows={state.entries} label="Frozen entries" row_key={entry => entry.handle}>
          {entry => <p>{entry.handle} · weight {entry.weight}</p>}
        </WindowedRows>
        {seal_slot}
      </div>
    </div>
  </div>;
}

export default function CoreLotteryRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const connection = coreLotsConnection(snapshot);
  if (!connection) return <section className="lottery-room" aria-label="Core Lot Chamber">
    <p role="status">Local draw connection unavailable. Reopen the desktop shell.</p>{seal_slot}
  </section>;
  connection.port ??= createCoreLotsPort(connection.launch, connection.transport);
  return <ConnectedLotsRoom port={connection.port} seal_slot={seal_slot} />;
}
