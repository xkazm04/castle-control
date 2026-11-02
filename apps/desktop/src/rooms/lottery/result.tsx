import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import type { LotsPort } from '../../lots-model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { DrawDisplay } from './display.js';
import { revealStyle } from './display.js';

const drawScale = { S: 0.75, M: 1, L: 1.5 } as const;

/** The fixed cast beside the stage: winners in cast order, the proof and a fresh roll. */
export function FixtureCast({ port, display, hash, on_prove, on_new }: {
  port: LotsPort; display: DrawDisplay; hash?: string | undefined; on_prove?: () => void; on_new?: () => void;
}) {
  const state = port.getSnapshot();
  const winners = state.simulated_winners ?? [];
  const proof_id = `lots-${state.draw.draw_id}-current-proof`;
  return <section className="lottery-cast" aria-label={copy.journey.cast_title}>
    <p className="cc-kicker">{copy.journey.cast_title}</p>
    <ol className="lottery-cast-winners reveal" style={revealStyle(display.reveal_ms)} aria-label={copy.core.winner_list}>
      {winners.map((winner, index) => <li key={winner} className="ticket" data-role="lot-ticket" data-current-winner="true">
        <b aria-hidden="true">{index + 1}</b><span>{winner}</span></li>)}
    </ol>
    <p className="lottery-cast-note">{copy.cast_notice}</p>
    <div className="lottery-draw-actions">
      {on_prove && <button type="button" className="cc-btn cc-btn--primary" onClick={on_prove}><RoomKeyBadge room="lottery" action="prove" />Prove it</button>}
      <button type="button" className="cc-btn" disabled={state.recomputing} onClick={() => { void port.recompute(); }}>{copy.cast_recompute}</button>
      {on_new && <button type="button" className="cc-btn cc-btn--quiet" onClick={on_new}><RoomKeyBadge room="lottery" action="setup" />{copy.draft_new}</button>}
    </div>
    <p className="cc-status lottery-cast-status" role="status">{state.notice}</p>
    <button type="button" className="cc-link lottery-cast-toggle" aria-expanded={state.nested} aria-controls={proof_id}
      onClick={() => port.nested(!state.nested)}>{state.nested ? copy.journey.close : copy.journey.read}</button>
    <section id={proof_id} hidden={!state.nested} className="lottery-cast-proof" aria-label={copy.journey.proof_title}>
      <p>{copy.journey.proof_notice}</p>
      {hash && <p className="cc-hash">{copy.seal_hash} · {hash}</p>}
      <p>{state.draw.name} · {state.entries.length} {copy.entries}</p>
      <p>{copy.winners}: {winners.join(', ')}</p>
      {state.writ && <pre className="cc-hash">{JSON.stringify(state.writ, undefined, 2)}</pre>}
    </section>
  </section>;
}

/** Where an accepted draw would appear in OBS; this rehearsal stays in the app. */
export function OverlayNote({ draw_id, display }: { draw_id: string; display: DrawDisplay }) {
  return <section className="lottery-more-card" aria-label={copy.journey.overlay}>
    <h3 className="lottery-card-title">{copy.journey.overlay}</h3>
    <p className="cc-aside">{copy.journey.overlay_gap}</p>
    <code className="cc-hash">{`/lots/${draw_id}?scale=${drawScale[display.size]}&anchor=${display.anchor}&shape=${display.shape}`}</code>
    <p className="cc-aside">{copy.journey.overlay_art_gap}</p>
  </section>;
}
