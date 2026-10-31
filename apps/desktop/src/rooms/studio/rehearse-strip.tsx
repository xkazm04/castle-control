import { SectionHeading } from '@castle-control/ui';
import { boardGeometry } from './board.js';
import type { StudioSide } from './board.js';
import type { Rehearsal } from './rehearsal.js';
import { rehearseCopy as copy } from './rehearse-copy.js';

export type TerritoryColumn = Readonly<{ turn: number; held: readonly number[]; unclaimed: number }>;
export type Territory = Readonly<{ sides: readonly StudioSide[]; total: number; columns: readonly TerritoryColumn[] }>;

/** Tiles held per house at turn 0 (the start) and after every turn, from the simulation alone. */
export function territorySeries(run: Rehearsal): Territory {
  const start = boardGeometry(run.start);
  const first: TerritoryColumn = { turn: 0, held: start.sides.map(side => side.count), unclaimed: start.unclaimed };
  const rest = run.turns.map((turn): TerritoryColumn => ({ turn: turn.turn,
    held: run.start.sides.map(side => turn.held[side.id] ?? 0), unclaimed: turn.unclaimed }));
  return { sides: run.start.sides, total: start.tiles.length, columns: [first, ...rest] };
}

const percent = (count: number, total: number) => Math.round(count / total * 100);

/** Which columns carry a turn number: the first, the last and a few between, so a 24 turn round stays readable. */
export function tickTurns(turns: number): ReadonlySet<number> {
  const every = Math.max(1, Math.ceil(turns / 4));
  return new Set(Array.from({ length: turns + 1 }, (_, turn) => turn).filter(turn => turn === turns || turn % every === 0));
}

/** The shape of the round: one thin stacked column per turn in the houses' inks, filling in as turns are shown.
 * The gold ink is pale on paper, so every segment carries an inked edge, the legend names each house, each
 * segment has a tooltip and the same numbers are there as a table for screen readers. */
export function TerritoryStrip({ run, shown }: { run: Rehearsal; shown: number }) {
  const { sides, total, columns } = territorySeries(run);
  const ticks = tickTurns(run.turns.length);
  const word = (turn: number) => (turn === 0 ? copy.strip_start : copy.turn_word(turn));
  return <figure className="studio-strip" aria-label={copy.strip_label}>
    <SectionHeading variant="ruled" title={copy.strip} count={copy.progress(shown, run.turns.length)} />
    <ol className="studio-strip-bars" aria-hidden="true">
      {columns.map(column => <li key={column.turn} data-shown={column.turn <= shown} data-now={column.turn === shown}>
        <div className="studio-strip-stack">
          {column.turn <= shown && <>
            {column.unclaimed > 0 && <span data-unclaimed="true" style={{ flexGrow: column.unclaimed }}
              title={copy.strip_tip(word(column.turn), copy.unclaimed, column.unclaimed, percent(column.unclaimed, total))} />}
            {sides.map((side, index) => (column.held[index] ?? 0) > 0 && <span key={side.id} data-ink={side.ink} style={{ flexGrow: column.held[index] }}
              title={copy.strip_tip(word(column.turn), side.short, column.held[index] ?? 0, percent(column.held[index] ?? 0, total))} />)}
          </>}
        </div>
        <small>{ticks.has(column.turn) ? column.turn : ''}</small>
      </li>)}
    </ol>
    <ul className="studio-strip-key" aria-hidden="true">
      {sides.map(side => <li key={side.id} data-ink={side.ink}><i />{side.short}</li>)}
      <li data-unclaimed="true"><i />{copy.unclaimed}</li>
    </ul>
    <table className="studio-visually-hidden">
      <caption>{copy.strip_label}</caption>
      <thead><tr><th scope="col">{copy.strip_turn}</th>
        {sides.map(side => <th key={side.id} scope="col">{side.short}</th>)}<th scope="col">{copy.unclaimed}</th></tr></thead>
      <tbody>{columns.filter(column => column.turn <= shown).map(column => <tr key={column.turn}>
        <th scope="row">{word(column.turn)}</th>{column.held.map((held, index) => <td key={sides[index]?.id}>{held}</td>)}<td>{column.unclaimed}</td>
      </tr>)}</tbody>
    </table>
  </figure>;
}
