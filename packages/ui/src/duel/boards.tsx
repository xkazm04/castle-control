import type { DuelList } from '@castle-control/duel';
import { Shield } from './shield.jsx';
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
