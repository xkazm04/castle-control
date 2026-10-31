import { InkButton, WindowedRows } from '@castle-control/ui';
import type { LotsPort } from '../../lots-model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { DrawDisplay } from './display.js';
import { revealStyle } from './display.js';
import { Ticket } from './print.jsx';

export function FixtureCast({ port, hash, display }: { port: LotsPort; hash: string; display: DrawDisplay }) {
  const state = port.getSnapshot();
  return <Ticket label={copy.sealed}>
    <p className="cc-hash">{copy.seal_hash} · {hash}</p>
    <p className="cc-aside">{copy.sealed_notice}</p>
    <InkButton size="room" disabled={state.started} onClick={() => port.start()}>{copy.start}</InkButton>
    {state.started && <section aria-label={copy.journey.cast_title}>
      <h3 className="lottery-card-title">{copy.journey.cast_title}</h3>
      <p>{copy.cast_notice}</p>
      <div className="lottery-current-winners" style={revealStyle(display.reveal_ms)}>
        <WindowedRows rows={state.simulated_winners ?? []} label={copy.core.winner_list} row_key={winner => winner}>
          {winner => <p data-current-winner="true">{winner}</p>}
        </WindowedRows>
      </div>
      <InkButton size="room" onClick={() => port.nested(!state.nested)}>{state.nested ? copy.journey.close : copy.journey.read}</InkButton>
      {state.nested && <section aria-label={copy.journey.proof_title}>
        <h3 className="lottery-card-title">{copy.journey.proof_title}</h3>
        <p>{copy.journey.proof_notice}</p>
        <p className="cc-hash">{copy.seal_hash} · {hash}</p>
        <p>{state.draw.name} · {state.entries.length} {copy.entries}</p>
        <p>{copy.winners}: {state.simulated_winners?.join(', ')}</p>
      </section>}
      <h3 className="lottery-card-title">{copy.journey.overlay}</h3>
      <p className="cc-aside">{copy.journey.overlay_gap}</p>
      <code className="cc-hash">{`/lots/${state.draw.draw_id}?scale=1&anchor=${display.anchor}`}</code>
      <p className="cc-aside">{copy.journey.overlay_art_gap}</p>
    </section>}
  </Ticket>;
}
