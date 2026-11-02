import { roundName } from './duel-model.js';
import type { DuelPicture, DuelSlot } from './duel-model.js';

const size = (picture: DuelPicture) => (picture.rounds[0]?.length ?? 1) * 2;
type SlotState = 'done' | 'current' | 'next';
function slotState(picture: DuelPicture, round: number, index: number, slot: DuelSlot): SlotState {
  if (picture.phase !== 'done' && picture.phase !== 'empty' && round === picture.round && index === picture.index) return 'current';
  return slot.winner ? 'done' : 'next';
}

/** The full seeded tree belongs to the room's shared Drawer. */
export function BracketSheet({ picture }: { picture: DuelPicture }) {
  const total = size(picture);
  const name = (id: string | null) => id ? picture.entrants[id]?.title ?? id : 'To be decided';
  const seed = (id: string | null) => id ? picture.entrants[id]?.seed : undefined;
  return <div className="duel-sheet">
      <header className="duel-sheet__head">
        <h2 className="duel-sheet__title">{picture.title}</h2>
        {picture.prompt && <p className="duel-sheet__prompt">{picture.prompt}</p>}
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
  </div>;
}

/** The last two rounds stay readable in two columns; earlier rounds remain in the drawer. */
export function BracketSummary({ picture }: { picture: DuelPicture }) {
  const total = size(picture);
  const final = picture.rounds.length - 1;
  const round = (r: number) => <div className="duel-bracket__round">
    {(picture.rounds[r] ?? []).map((slot, index) => <div key={index} className="duel-bracket__match"
      data-state={slotState(picture, r, index, slot)}>
      <h4>{roundName(total, r)} {r === final ? '' : index + 1}</h4>
      {[slot.a, slot.b].map((id, row) => <p key={row} data-won={id !== null && id === slot.winner || undefined}>
        {id ? picture.entrants[id]?.title ?? id : `Winner of ${r === 0 ? 'match' : roundName(total, r - 1).toLowerCase()} ${index * 2 + row + 1}`}
      </p>)}
    </div>)}
  </div>;
  return <div className="duel-bracket" aria-label="Bracket summary">
    {final > 0 && round(final - 1)}
    <div className="duel-bracket__finish">{final >= 0 && round(final)}
      <div className="duel-bracket__match"><h4>Champion</h4>
        <b data-role="ty-champ-slot">{picture.champion?.title ?? '?'}</b></div>
    </div>
  </div>;
}
