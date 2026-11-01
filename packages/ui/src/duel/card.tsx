import type { DuelItem, Side } from '@castle-control/duel';
import { Shield } from './shield.jsx';
import type { TiltyardWords } from './words.js';

export interface CardProps {
  readonly item: Omit<DuelItem, 'id'> & { readonly id: string };
  readonly side: Side;
  readonly words: TiltyardWords;
  readonly tag: string;
  readonly note?: string;
  readonly use?: 'duel' | 'champion' | 'preview';
  readonly result?: 'won' | 'lost' | 'enter';
  readonly verb?: string;
  readonly pick?: string;
  readonly stamp?: string;
  readonly on_pick?: () => void;
  readonly disabled?: boolean;
}
export function Card(props: CardProps) {
  const { item, side, words, tag, note = item.note, use = 'duel', result, on_pick } = props;
  const className = `ty-card${result ? ` ty-${result}` : ''}`;
  const content = <>
    {use === 'champion' && <svg className="ty-crown" viewBox="0 0 100 60" aria-hidden="true">
      <path d="M8 54L12 14L32 36L50 6L68 36L88 14L92 54Z" fill="var(--or)"
        stroke="var(--ty-parchment-ink)" strokeWidth="4" strokeLinejoin="round" />
    </svg>}
    <span className="ty-seedtag" data-role="ty-card-tag">{tag}</span>
    <span className="ty-arms"><Shield item={item} words={words} /></span>
    <b className="ty-ctitle" data-role="ty-card-title">{item.title}</b>
    {note && <i className="ty-cnote" data-role="ty-card-note">{note}</i>}
    <small className="ty-cby" data-role="ty-card-by">{words.suggested_by(item.by)}</small>
    {use === 'duel' && <span className="ty-pick" data-role="ty-card-pick">
      <kbd>{side === 0 ? words.keys.left : words.keys.right}</kbd>{props.pick ?? words.wins}
    </span>}
    {use !== 'preview' && <span className="ty-stamp" data-role="ty-stamp" aria-hidden="true">
      {props.stamp ?? (use === 'champion' ? words.champion_stamp : words.wins_stamp)}
    </span>}
  </>;
  return use === 'duel' ? <button type="button" className={className} data-role="ty-card" data-side={side}
    data-result={result === 'won' || result === 'lost' ? result : undefined}
    aria-label={words.card_label(item.title, side, props.verb ?? words.wins)} disabled={props.disabled} onClick={on_pick}>{content}</button>
    : <div className={className} data-role={use === 'champion' ? 'ty-champion-card' : 'ty-card'}
      data-side={side}>{content}</div>;
}
