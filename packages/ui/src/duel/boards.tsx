import { maxClimbPicks } from '@castle-control/duel';
import type { DuelEvent, DuelItem, DuelItemId, DuelList, LadderSession } from '@castle-control/duel';
import { Card } from './card.jsx';
import { Shield } from './shield.jsx';
import type { TiltyardLists } from './types.js';
import type { TiltyardWords } from './words.js';

export function ChatBoard({ words, missing = false, on_resume, on_reset }: {
  words: TiltyardWords; missing?: boolean; on_resume: () => void; on_reset: () => void;
}) {
  return <div className="ty-board">
    <h2 data-role="ty-board-title">{missing ? words.chat.no_source_title : words.chat.paused_title}</h2>
    <p data-role="ty-board-text">{missing ? words.chat.no_source_text : <>{words.chat.paused_before_enter}
      <kbd>{words.keys.enter}</kbd>{words.chat.paused_before_escape}<kbd>{words.keys.escape}</kbd>{words.chat.paused_after_escape}</>}</p>
    {!missing && <div className="ty-btns">
      <button className="ty-yb ty-primary" data-role="ty-rail-button" type="button" onClick={on_resume}>
        {words.chat.resume}<kbd>{words.keys.enter}</kbd></button>
      <button className="ty-yb" data-role="ty-rail-button" type="button" onClick={on_reset}>{words.chat.new_vote}</button>
    </div>}
  </div>;
}

export function ClosedBoard({ list, words, on_reopen, on_reset }: {
  list: DuelList; words: TiltyardWords; on_reopen: () => void; on_reset: () => void;
}) {
  return <div className="ty-board">
    <h2 data-role="ty-board-title">{words.closed_title}</h2>
    <p data-role="ty-board-text">{words.closed_before_enter}<kbd>{words.keys.enter}</kbd>
      {words.closed_before_escape}<kbd>{words.keys.escape}</kbd>{words.closed_after_escape}</p>
    <Lineup list={list} words={words} />
    <div className="ty-btns">
      <button className="ty-yb ty-primary" data-role="ty-rail-button" type="button" onClick={on_reopen}>
        {words.reopen}<kbd>{words.keys.enter}</kbd>
      </button>
      <button className="ty-yb" data-role="ty-rail-button" type="button" onClick={on_reset}>{words.new_bracket}</button>
    </div>
  </div>;
}
export function Lineup({ list, words }: { list: DuelList; words: TiltyardWords }) {
  return <div className="ty-lineup">{list.items.slice(0, 8).map((item, index) => <figure key={item.id}>
    <Shield item={item} words={words} /><b>{words.seed_number(index + 1)}</b>{item.title}
  </figure>)}</div>;
}

export function LadderBoard({ session, list, items, words, on_event }: {
  session: LadderSession; list: TiltyardLists['ladder']; items: ReadonlyMap<DuelItemId, DuelItem>;
  words: TiltyardWords; on_event: (event: DuelEvent) => void;
}) {
  const copy = words.ladder;
  const last = session.last;
  const incoming = items.get(session.queue[session.queue_index]!);
  const placed = last ? items.get(last.item) : undefined;
  const fallen = last?.fell ? items.get(last.fell) : undefined;
  const button = (text: string, event: DuelEvent, primary = false, undo = false) =>
    <button className={`ty-yb${primary ? ' ty-primary' : ''}`} data-role="ty-rail-button" type="button" onClick={() => on_event(event)}>
      {text}<kbd>{undo ? words.keys.undo : words.keys.enter}</kbd>
    </button>;
  return <div className={`ty-board ty-ladder-board${last ? ' ty-placed' : ''}`}>
    {last && placed ? <>
      <h2 data-role="ty-board-title">{last.made_it ? copy.placed(last.place + 1) : copy.off_title}</h2>
      <p data-role="ty-board-text">{copy.result(placed.title, last)}</p>
      {fallen && <p className="ty-fallen">{copy.fallen(fallen.title)}</p>}
      <div className="ty-btns">
        {button(copy.undo, { kind: 'undo' }, false, true)}
        {button(incoming ? copy.next : copy.reset, { kind: incoming ? 'enter' : 'reset' }, true)}
      </div>
    </> : incoming ? <>
      <h2 data-role="ty-board-title">{copy.idle_title}</h2>
      <Card item={incoming} side={0} use="preview" result="enter" note="" words={{ ...words, suggested_by: copy.from }}
        tag={copy.incoming(session.queue_index + 1, session.queue.length)} />
      <p data-role="ty-board-text">{copy.search(list.title, maxClimbPicks(session.order.length), session.order.length + 1)}
        {session.phase === 'called_off' && copy.abandoned}</p>
      <div className="ty-btns">
        {button(copy.start, { kind: 'enter' }, true)}
        {session.prev && button(copy.undo_last, { kind: 'undo' }, false, true)}
      </div>
    </> : <>
      <h2 data-role="ty-board-title">{copy.empty_title}</h2>
      <p data-role="ty-board-text">{copy.empty_text}</p>
      {button(copy.reset, { kind: 'reset' }, true)}
    </>}
  </div>;
}
