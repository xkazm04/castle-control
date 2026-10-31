import type { CSSProperties, ReactNode } from 'react';
import { currentMatch, finalOrder, plannedRounds, totalMatches } from '@castle-control/duel';
import type { Bracket, DuelItem, DuelItemId, DuelList, PlannedMatch, ShowVerdict } from '@castle-control/duel';
import { Shield } from './shield.jsx';
import type { TiltyardWords } from './words.js';

type ColumnStyle = CSSProperties & { '--ty-matches': number };
const columnStyle = (matches: number): ColumnStyle => ({ '--ty-matches': matches });
export function RailButtons({ words, on_undo, on_reset, can_undo = true, again = false }: {
  words: TiltyardWords; on_undo: () => void; on_reset: () => void; can_undo?: boolean; again?: boolean;
}) {
  return <div className="ty-btns">
    <button className="ty-yb" data-role="ty-rail-button" type="button" onClick={on_undo} disabled={!can_undo}>
      {words.undo}<kbd>{words.keys.undo}</kbd>
    </button>
    <button className={`ty-yb${again ? ' ty-primary' : ''}`} data-role="ty-rail-button" type="button" onClick={on_reset}>
      {again ? words.run_again : words.new_bracket}{again && <kbd>{words.keys.enter}</kbd>}
    </button>
  </div>;
}
export function Rail({ bracket, list, words, verdict, can_undo, on_undo, on_reset, aside }: {
  bracket: Bracket; list: DuelList; words: TiltyardWords;
  verdict: Pick<ShowVerdict, 'round' | 'index'> | null;
  can_undo: boolean; on_undo: () => void; on_reset: () => void;
  aside?: ReactNode;
}) {
  const rounds = plannedRounds(bracket);
  const current = verdict ?? currentMatch(bracket);
  const items = new Map<DuelItemId, DuelItem>(list.items.map(item => [item.id, item]));
  const champion = finalOrder(bracket)?.[0];
  function row(id: DuelItemId | null, match: PlannedMatch) {
    const item = id === null ? undefined : items.get(id);
    if (!item) return <div className="ty-row ty-tbd" data-role="ty-match-row">
      <span /><span className="ty-sd">{words.unknown_seed}</span><span>{words.winner_to_come}</span>
    </div>;
    return <div className={`ty-row${match.winner ? match.winner === id ? ' ty-w' : ' ty-l' : ''}`} data-role="ty-match-row">
      <Shield item={item} words={words} /><span className="ty-sd">{words.seed_number(bracket.seeds.indexOf(item.id) + 1)}</span>
      <span>{item.title}</span>
    </div>;
  }
  return <div className={`ty-rail${aside ? ' ty-split' : ''}`} data-role="ty-rail">
    <div><h4 data-role="ty-rail-heading">{words.rail_heading(list.title)} <span>{words.rail_detail(totalMatches(bracket))}</span></h4>
      <div className="ty-tree">{rounds.map((round, r) => <div className="ty-tcol" key={r}
        style={columnStyle(round.length)}>
        <small>{words.round(bracket, r, round.length > 1)}</small><div className="ty-ms">
          {round.map((match, index) => {
            const is_current = current?.round === r && current.index === index;
            return <div className={`ty-tm${is_current ? ' ty-cur' : ''}`} data-role="ty-match" key={index}
              aria-current={is_current ? 'step' : undefined}>{row(match.a, match)}{row(match.b, match)}</div>;
          })}
        </div>
      </div>)}<div className="ty-tcol"><small>{words.champion}</small>
        <div className={`ty-champ-slot${champion ? ' ty-set' : ''}`} data-role="ty-champ-slot">
          {champion ? items.get(champion)?.title : words.unknown_champion}
        </div>
      </div></div>
    </div>
    {aside ?? <RailButtons words={words} on_undo={on_undo} on_reset={on_reset} can_undo={can_undo} />}
  </div>;
}
