import { chatOpenedAt, chatWindowFor, currentMatch, matchNumber, totalMatches } from '@castle-control/duel';
import type { ChatSession, DuelEvent, DuelItem, Side } from '@castle-control/duel';
import { tallyAt } from '@castle-control/duel/ballots';
import type { IndexedWindow } from '@castle-control/duel/ballots';
import { Arena } from './arena.jsx';
import { ChatBoard } from './boards.jsx';
import { Card } from './card.jsx';
import { Champion } from './champion.jsx';
import { Rail } from './rail.jsx';
import { Countdown, Seal } from './seal.jsx';
import { Ticker } from './ticker.jsx';
import { Tug } from './tug.jsx';
import type { TiltyardProps } from './types.js';
import type { TiltyardWords } from './words.js';

/** One ingestion per match key for this source, including undo and New vote. */
export function chatWindows(source: TiltyardProps['ballots']): (session: ChatSession) => IndexedWindow | undefined {
  const windows = new Map<string, IndexedWindow>();
  return session => {
    if (!source) return undefined;
    if (!session.match_key) {
      const bracket = session.history.at(-1);
      const last = bracket ? currentMatch(bracket) : null;
      return last ? windows.get(`${session.key}:${last.round}:${last.index}`) : undefined;
    }
    let window = windows.get(session.match_key);
    if (!window) {
      window = chatWindowFor(session, source(session.match_key, session.window_ms, chatOpenedAt(session)));
      windows.set(session.match_key, window);
    }
    return window;
  };
}

export function Chat({ session, window, words, on_event }: {
  session: ChatSession; window?: IndexedWindow | undefined; words: TiltyardWords; on_event: (event: DuelEvent) => void;
}) {
  const { bracket, list, verdict } = session;
  const current = currentMatch(bracket);
  const match = verdict ?? current?.match;
  const a = list.items.find(item => item.id === match?.a);
  const b = list.items.find(item => item.id === match?.b);
  const elapsed = verdict?.elapsed ?? session.elapsed;
  const tally = window ? window.prefix[tallyAt(window, elapsed).seen]! : undefined;
  const second = Math.ceil((verdict ? session.remaining_ms : session.window_ms - elapsed) / 1000);
  const undo = () => on_event({ kind: 'undo' });
  const reset = () => on_event({ kind: 'reset' });
  const resume = () => on_event({ kind: 'enter' });
  function card(item: DuelItem, side: Side) {
    return <Card key={`${session.match_key}-${side}-${verdict ? 'verdict' : 'live'}`} item={item} side={side} words={words}
      tag={words.chat.tag(side + 1, bracket.seeds.indexOf(item.id) + 1)} pick={words.chat.call} verb={words.chat.call_verb}
      stamp={verdict?.how === 'call' ? words.chat.your_call : words.chat.chose}
      result={verdict ? verdict.side === side ? 'won' : 'lost' : 'enter'} on_pick={() => on_event({ kind: 'pick', side })} />;
  }
  return <>
    {!window ? <Arena><ChatBoard words={words} missing on_resume={resume} on_reset={reset} /></Arena>
      : session.phase === 'called_off' ? <Arena><ChatBoard words={words} on_resume={resume} on_reset={reset} /></Arena>
        : session.phase === 'done' ? <Arena><Champion bracket={bracket} list={list} words={words} on_undo={undo} on_reset={reset} /></Arena>
          : a && b && tally && <Arena live verdict={verdict?.side ?? null}>
            {card(a, 0)}
            <div className="ty-center">
              <span className="ty-round" data-role="ty-round">{words.round(bracket, verdict?.round ?? current?.round ?? 0)}</span>
              <Seal><Countdown window_ms={session.window_ms} elapsed={elapsed} speed={session.speed}
                paused={session.phase !== 'live'} closed={verdict !== null} seconds={words.chat.seconds} closed_label={words.chat.closed} /></Seal>
              <span className="ty-of" data-role="ty-of">{words.match(verdict ? session.history.length : matchNumber(bracket),
                totalMatches(bracket), verdict ? words.chat.window_closed : list.prompt ?? list.title)}</span>
              <span className="ty-hint" data-role="ty-hint">{verdict
                ? verdict.how === 'tally' ? <>{words.chat.tally_line(verdict)}<b>{second}</b>{words.chat.tally_enter}
                  <kbd>{words.keys.enter}</kbd>{words.chat.now}</>
                  : verdict.how === 'tie' ? <span className="ty-tie">{words.chat.verdict(verdict, second)}</span>
                    : words.chat.verdict(verdict, second)
                : <><kbd>{words.keys.enter}</kbd>{words.chat.close_now}<kbd>{words.keys.left}</kbd>/<kbd>{words.keys.right}</kbd> {words.chat.call}</>}</span>
            </div>
            {card(b, 1)}
            <Tug tally={tally} a={a.title} b={b.title} words={words} second={second} />
          </Arena>}
    {window && <ChatRail session={session} window={window} words={words} on_event={on_event} />}
  </>;
}

function ChatRail({ session, window, words, on_event }: {
  session: ChatSession; window: IndexedWindow; words: TiltyardWords; on_event: (event: DuelEvent) => void;
}) {
  const { bracket, list, verdict } = session;
  const elapsed = session.phase === 'done' ? session.window_ms : verdict?.elapsed ?? session.elapsed;
  const seen = tallyAt(window, elapsed).seen;
  return <Rail bracket={bracket} list={list} words={words} verdict={verdict} can_undo={session.history.length > 0}
    on_undo={() => on_event({ kind: 'undo' })} on_reset={() => on_event({ kind: 'reset' })} aside={
      <div><h4>{words.chat.ticker_title} <span>{words.chat.ticker_detail}</span></h4>
      <Ticker window={window} seen={seen} second={Math.ceil(elapsed / 1000)} words={words} />
      <p className="ty-closed" data-role="ty-closed-note">{words.chat.closed_before}
        <code>{'{"kind":"vote","option_index":0|1}'}</code>{words.chat.closed_after}</p>
      <div className="ty-btns">
        <button className="ty-yb" data-role="ty-rail-button" type="button" aria-pressed={session.speed > 1}
          onClick={() => on_event({ kind: 'speed' })}>{words.chat.speed(session.speed)}</button>
        <button className="ty-yb" data-role="ty-rail-button" type="button" disabled={session.history.length === 0}
          onClick={() => on_event({ kind: 'undo' })}>{words.undo}<kbd>{words.keys.undo}</kbd></button>
        <button className="ty-yb" data-role="ty-rail-button" type="button" onClick={() => on_event({ kind: 'reset' })}>{words.chat.new_vote}</button>
      </div>
    </div>} />;
}
