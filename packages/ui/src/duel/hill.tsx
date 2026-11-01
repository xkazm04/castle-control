import type { CSSProperties } from 'react';
import { climbTarget } from '@castle-control/duel';
import type { DuelItem, DuelItemId, LadderSession, stillPossible } from '@castle-control/duel';
import { Shield } from './shield.jsx';
import type { TiltyardWords } from './words.js';

type StepStyle = CSSProperties & { '--ty-step-index': number };
const stepStyle = (index: number): StepStyle => ({ '--ty-step-index': index });

export function Hill({ session, possible, title, items, words }: {
  session: LadderSession; possible: ReturnType<typeof stillPossible>; title: string;
  items: ReadonlyMap<DuelItemId, DuelItem>; words: TiltyardWords;
}) {
  const copy = words.ladder;
  const climb = (session.phase === 'live' || session.phase === 'verdict') && !session.last ? session.climb : null;
  const last = session.verdict ? null : session.last;
  const target = climb ? climbTarget(climb) : null;
  const row = (id: DuelItemId, index: number) => {
    const item = items.get(id);
    if (!item) return null;
    let state = 'range';
    let treatment = '';
    let marker = '';
    if (climb) {
      const step = climb.steps.find(step => step.at === index);
      if (index === target) { state = treatment = 'target'; marker = copy.challenged; }
      else if (step) {
        state = step.won ? 'beat' : 'held';
        treatment = `${state} ty-out`;
        marker = step.won ? copy.beaten : copy.held;
      } else state = treatment = index < climb.lo || index >= climb.hi ? 'out' : 'range';
    }
    if (last) {
      if (index === last.place) { state = treatment = 'new'; marker = copy.new; }
      else if (index > last.place && last.made_it) { state = treatment = 'down'; marker = copy.down; }
    }
    return <div key={id} className={`ty-rung${treatment ? ` ty-${treatment}` : ''}`} data-role="ty-rung" data-state={state}
      style={state === 'down' ? stepStyle(index - (last?.place ?? 0)) : undefined}>
      <span className="ty-n">{words.seed_number(index + 1)}</span><Shield item={item} words={words} />
      <span>{item.title}</span><span className="ty-mk">{marker}</span>
    </div>;
  };
  const fell = last?.fell ? items.get(last.fell) : undefined;
  return <aside className="ty-hill" data-role="ty-hill" aria-label={title}>
    <h3 data-role="ty-hill-heading">{copy.hill}<small>{copy.subtitle(title)}</small></h3>
    {session.order.map(row)}
    {climb && <div className={`ty-rung ty-slot ty-${possible?.below ? 'range' : 'out'}`} data-role="ty-rung" data-state="slot">
      <span className="ty-n">{words.seed_number(session.order.length + 1)}</span><span />
      <span>{copy.below}</span><span className="ty-mk" />
    </div>}
    {fell && <div className="ty-rung ty-fell" data-role="ty-rung" data-state="fell">
      <span className="ty-n">{words.unknown_seed}</span><Shield item={fell} words={words} />
      <span>{fell.title}</span><span className="ty-mk">{copy.falls}</span>
    </div>}
    {possible && <div className="ty-range-cap" data-role="ty-range-cap">{copy.range(possible, copy.below)}</div>}
  </aside>;
}
