import { entranceStyle, InkButton, rowHeight, Stamp, WindowedRows } from '@castle-control/ui';
import type { LotsPort } from '../../lots-model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { DrawDisplay } from './display.js';
import { revealStyle } from './display.js';
import { Ticket } from './print.jsx';

const drawScale = { S: 0.75, M: 1, L: 1.5 } as const;

export function FixtureCast({ port, hash, display }: { port: LotsPort; hash: string; display: DrawDisplay }) {
  const state = port.getSnapshot();
  const winners = state.simulated_winners ?? [];
  const proof_id = `lots-${state.draw.draw_id}-current-proof`;
  return <Ticket label={copy.sealed} entrance={7}>
    <p className="cc-hash">{copy.seal_hash} · {hash}</p>
    <p className="cc-aside">{copy.sealed_notice}</p>
    {!state.started && <div className="cc-group">
      <InkButton size="room" disabled={state.casting} onClick={() => { void port.start(); }}>{copy.cast_rehearsal}</InkButton>
      <InkButton size="room" disabled={state.casting} onClick={() => { void port.start(); }}>{copy.start}</InkButton>
    </div>}
    <p className="cc-status" role="status">{state.notice}</p>
    {state.started && <section aria-label={copy.journey.cast_title}>
      <h3 className="lottery-card-title">{copy.journey.cast_title}</h3>
      <p>{copy.cast_notice}</p>
      <div className="lottery-current-winners reveal" style={revealStyle(display.reveal_ms)}>
        <div className="lottery-reveal-seal"><Stamp kind="sealed" word={copy.sealed_stamp} land /></div>
        <WindowedRows rows={winners} label={copy.core.winner_list} row_key={winner => winner} row_height={rowHeight * 2}>
          {winner => <p className="ticket cc-print-in" data-role="lot-ticket" data-current-winner="true"
            style={entranceStyle(winners.indexOf(winner))}>{winner}</p>}
        </WindowedRows>
      </div>
      {state.writ && <>
        <p className="cc-caption">{copy.cast_writ}</p>
        <code className="cc-hash">{state.writ.seal}</code>
        <InkButton size="room" disabled={state.recomputing} onClick={() => { void port.recompute(); }}>{copy.cast_recompute}</InkButton>
      </>}
      <InkButton size="room" aria-expanded={state.nested} aria-controls={proof_id}
        onClick={() => port.nested(!state.nested)}>{state.nested ? copy.journey.close : copy.journey.read}</InkButton>
      <section id={proof_id} hidden={!state.nested} aria-label={copy.journey.proof_title}>
        <h3 className="lottery-card-title">{copy.journey.proof_title}</h3>
        <p>{copy.journey.proof_notice}</p>
        <p className="cc-hash">{copy.seal_hash} · {hash}</p>
        <p>{state.draw.name} · {state.entries.length} {copy.entries}</p>
        <p>{copy.winners}: {state.simulated_winners?.join(', ')}</p>
        {state.writ && <pre className="cc-hash">{JSON.stringify(state.writ, undefined, 2)}</pre>}
      </section>
      <h3 className="lottery-card-title">{copy.journey.overlay}</h3>
      <p className="cc-aside">{copy.journey.overlay_gap}</p>
      <code className="cc-hash">{`/lots/${state.draw.draw_id}?scale=${drawScale[display.size]}&anchor=${display.anchor}`}</code>
      <p className="cc-aside">{copy.journey.overlay_art_gap}</p>
    </section>}
  </Ticket>;
}
