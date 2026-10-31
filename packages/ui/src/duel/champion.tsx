import type { CSSProperties } from 'react';
import { finalOrder } from '@castle-control/duel';
import type { Bracket, DuelList } from '@castle-control/duel';
import { Card } from './card.jsx';
import { Shield } from './shield.jsx';
import { RailButtons } from './rail.jsx';
import type { TiltyardWords } from './words.js';

type OrderStyle = CSSProperties & { '--ty-order-index': number };
const orderStyle = (index: number): OrderStyle => ({ '--ty-order-index': index });
export function Champion({ bracket, list, words, on_undo, on_reset }: {
  bracket: Bracket; list: DuelList; words: TiltyardWords; on_undo: () => void; on_reset: () => void;
}) {
  const order = finalOrder(bracket);
  const champion = list.items.find(item => item.id === order?.[0]);
  if (!order || !champion) return null;
  return <>
    <div className="ty-rays" aria-hidden="true" />
    <div className="ty-champ">
      <Card item={champion} side={0} use="champion" words={words} tag={words.champion_tag(list.title)}
        note={words.champion_note(bracket.seeds.indexOf(champion.id) + 1, champion.note ?? '')} />
      <div>
        <div className="ty-order"><h3>{words.placed(order.length)}</h3>
          <ol aria-label={words.final_order}>{order.map((id, index) => {
            const item = list.items.find(item => item.id === id);
            if (!item) return null;
            const out_round = bracket.rounds.findIndex(round => round.some(match =>
              (match.a === id || match.b === id) && match.winner !== null && match.winner !== id));
            return <li key={id} data-role="ty-order-row" style={orderStyle(index)}>
              <span className="ty-n">{index + 1}</span><Shield item={item} words={words} />
              <span>{item.title}</span><small>{out_round < 0 ? words.champion_rank
                : words.out_in(words.round(bracket, out_round))}</small>
            </li>;
          })}</ol>
        </div>
        <div className="ty-rail ty-champ-actions">
          <RailButtons words={words} on_undo={on_undo} on_reset={on_reset} again />
          <p className="ty-closed">{words.closing_note}</p>
        </div>
      </div>
    </div>
  </>;
}
