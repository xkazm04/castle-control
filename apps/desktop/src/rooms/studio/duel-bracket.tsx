import { useEffect, useRef } from 'react';
import { roundName } from './duel-model.js';
import type { DuelPicture, DuelSlot } from './duel-model.js';

const size = (picture: DuelPicture) => (picture.rounds[0]?.length ?? 1) * 2;
const shortRound = (name: string) => name === 'Quarterfinal' ? 'QF' : name === 'Semifinal' ? 'SF' : name;
type SlotState = 'done' | 'current' | 'next';
function slotState(picture: DuelPicture, round: number, index: number, slot: DuelSlot): SlotState {
  if (picture.phase !== 'done' && picture.phase !== 'empty' && round === picture.round && index === picture.index) return 'current';
  return slot.winner ? 'done' : 'next';
}

/** One row: rounds as small pips, the current match lit, the champion slot. Only where you are. */
export function BracketStrip({ picture, on_open }: { picture: DuelPicture; on_open: () => void }) {
  const total = size(picture);
  return <div className="duel-strip" data-role="ty-strip">
    <ol className="duel-strip__rounds" aria-label="Where the tournament stands">
      {picture.rounds.map((slots, round) => {
        const name = roundName(total, round);
        const here = slots.some((slot, index) => slotState(picture, round, index, slot) === 'current');
        return <li key={round} className="duel-strip__round" data-here={here || undefined}>
          <span className="duel-strip__name" title={name}>{shortRound(name)}</span>
          <span className="duel-strip__pips">{slots.map((slot, index) => {
            const state = slotState(picture, round, index, slot);
            return <i key={index} className="duel-pip" data-state={state}
              aria-label={`${name} match ${index + 1}: ${state === 'current' ? 'now' : state === 'done' ? 'decided' : 'to come'}`} />;
          })}</span>
        </li>;
      })}
      <li className="duel-strip__round duel-strip__crown" data-here={picture.champion ? true : undefined}>
        <span className="duel-strip__name">Champion</span>
        <b data-role="ty-champ-slot">{picture.champion?.title ?? '?'}</b>
      </li>
    </ol>
    <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet duel-strip__open" onClick={on_open}
      aria-haspopup="dialog" disabled={!picture.rounds.length}>Full bracket</button>
  </div>;
}

/** The whole bracket, on demand. Sized to fit eight contestants at 1280 × 800 without scrolling. */
export function BracketSheet({ picture, on_close }: { picture: DuelPicture; on_close: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  // Focus returns to the stage through on_close, so the duel keys work again at once.
  useEffect(() => { close.current?.focus(); }, []);
  const total = size(picture);
  const name = (id: string | null) => id ? picture.entrants[id]?.title ?? id : 'To be decided';
  const seed = (id: string | null) => id ? picture.entrants[id]?.seed : undefined;
  return <div className="duel-sheet-scrim" onClick={event => { if (event.target === event.currentTarget) on_close(); }}>
    <div className="duel-sheet" role="dialog" aria-modal="true" aria-label="Full bracket"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); on_close(); }
        else event.stopPropagation();
      }}>
      <header className="duel-sheet__head">
        <h2 className="duel-sheet__title">{picture.title}</h2>
        {picture.prompt && <p className="duel-sheet__prompt">{picture.prompt}</p>}
        <button ref={close} type="button" className="cc-btn cc-btn--sm" onClick={on_close}>Close <kbd className="cc-kbd">Esc</kbd></button>
      </header>
      <div className="duel-sheet__tree" style={{ gridTemplateColumns: `repeat(${picture.rounds.length + 1}, minmax(0, 1fr))` }}>
        {picture.rounds.map((slots, round) => <section key={round} className="duel-sheet__col" aria-label={roundName(total, round)}>
          <h3>{roundName(total, round)}</h3>
          <div className="duel-sheet__matches">{slots.map((slot, index) => {
            const state = slotState(picture, round, index, slot);
            return <div key={index} className="duel-sheet__match" data-role="ty-match" data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}>
              {[slot.a, slot.b].map((id, row) => <div key={row} className="duel-sheet__row"
                data-won={slot.winner !== null && slot.winner === id ? true : undefined}
                data-lost={slot.winner !== null && id !== null && slot.winner !== id ? true : undefined}>
                <span className="duel-sheet__seed">{seed(id) ?? '·'}</span><span>{name(id)}</span>
              </div>)}
            </div>;
          })}</div>
        </section>)}
        <section className="duel-sheet__col duel-sheet__champ" aria-label="Champion">
          <h3>Champion</h3>
          <p data-role="ty-champion-slot">{picture.champion?.title ?? 'To be crowned'}</p>
        </section>
      </div>
      {picture.simulated && <p className="duel-sheet__note"><span className="cc-sim">Simulated</span>
        {picture.source === 'core' ? 'Ballots in this tournament are simulated.' : 'Sample contestants and generated ballots; nothing reaches chat.'}</p>}
    </div>
  </div>;
}
