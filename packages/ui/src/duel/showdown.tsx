import { currentMatch, matchNumber, totalMatches } from '@castle-control/duel';
import type { DuelEvent, ShowSession, Side } from '@castle-control/duel';
import { Arena } from './arena.jsx';
import { Card } from './card.jsx';
import { Centre } from './centre.jsx';
import { Champion } from './champion.jsx';
import { ClosedBoard } from './boards.jsx';
import { Rail } from './rail.jsx';
import type { TiltyardWords } from './words.js';

export function Showdown({ session, words, on_event }: {
  session: ShowSession; words: TiltyardWords; on_event: (event: DuelEvent) => void;
}) {
  const { bracket, list, verdict } = session;
  const current = currentMatch(bracket);
  const match = verdict ?? current?.match;
  const round = verdict?.round ?? current?.round ?? 0;
  const left = list.items.find(item => item.id === match?.a);
  const right = list.items.find(item => item.id === match?.b);
  const undo = () => on_event({ kind: 'undo' });
  const reset = () => on_event({ kind: 'reset' });
  const card = (side: Side) => {
    const item = side === 0 ? left : right;
    if (!item) return null;
    return <Card key={`${session.history.length}-${item.id}-${verdict ? 'verdict' : 'live'}`} item={item} side={side} words={words}
      tag={words.seed(bracket.seeds.indexOf(item.id) + 1, side)} result={verdict ? verdict.side === side ? 'won' : 'lost' : 'enter'}
      on_pick={() => on_event({ kind: 'pick', side })} />;
  };
  return <>
    {session.phase === 'called_off' ? <Arena bare><ClosedBoard list={list} words={words}
      on_reopen={() => on_event({ kind: 'enter' })} on_reset={reset} /></Arena>
      : session.phase === 'done' ? <Arena bare><Champion bracket={bracket} list={list} words={words} on_undo={undo} on_reset={reset} /></Arena>
        : <Arena live verdict={verdict?.side ?? null}>
          {card(0)}
          <Centre key={`${session.history.length}-${verdict ? 'verdict' : 'live'}`} words={words} verdict={verdict !== null}
            round={words.round(bracket, round)} of={verdict
              ? words.decided(session.history.length, totalMatches(bracket))
              : words.match(matchNumber(bracket), totalMatches(bracket), list.title)}
            hint={<>{verdict ? words.theatre_hint : words.card_hint}<kbd>{words.keys.left}</kbd>
              {verdict ? words.skip_separator : ' '}<kbd>{words.keys.right}</kbd>{verdict && words.skip}</>} />
          {card(1)}
        </Arena>}
    <Rail bracket={bracket} list={list} words={words} verdict={verdict} can_undo={session.history.length > 0}
      on_undo={undo} on_reset={reset} />
  </>;
}
