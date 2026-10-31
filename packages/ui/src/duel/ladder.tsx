import { climbDone, climbTarget, maxClimbPicks, stillPossible } from '@castle-control/duel';
import type { DuelEvent, DuelItem, DuelItemId, LadderSession, Side } from '@castle-control/duel';
import { Arena } from './arena.jsx';
import { LadderBoard } from './boards.jsx';
import { Card } from './card.jsx';
import { Centre } from './centre.jsx';
import { Hill } from './hill.jsx';
import { Shield } from './shield.jsx';
import type { TiltyardLists } from './types.js';
import type { TiltyardWords } from './words.js';

const ladderItems = (list: TiltyardLists['ladder']) =>
  new Map<DuelItemId, DuelItem>([...list.top.items, ...list.queue.items].map(item => [item.id, item]));

/** Announce recorded transitions; theatre settlement never repeats a result. */
export function ladderAnnouncement(before: LadderSession, after: LadderSession, event: DuelEvent,
  list: TiltyardLists['ladder'], words: TiltyardWords): string | null {
  if (before === after) return null;
  const copy = words.ladder;
  if (event.kind === 'cancel') return words.cancelled;
  if (event.kind === 'undo') {
    return before.climb && !climbDone(before.climb) ? copy.abandoned_announcement
      : before.prev !== after.prev ? copy.undone : null;
  }
  const items = ladderItems(list);
  const climb = after.climb;
  if (!climb) return null;
  const challenger = items.get(climb.challenger);
  if (!challenger) return null;
  const target = climbTarget(climb);
  if (after.verdict && after.verdict !== before.verdict) {
    return copy.picked(challenger.title, after.verdict.at + 1, after.verdict.side)
      + (after.last ? copy.placement(after.last, after.last.fell ? items.get(after.last.fell)?.title : undefined)
        : target !== null ? copy.next_announcement(target + 1) : '');
  }
  const incumbent = target === null ? undefined : items.get(climb.order[target]!);
  return event.kind === 'enter' && before.phase !== 'verdict' && incumbent && target !== null
    ? copy.opened(challenger.title, target + 1, incumbent.title) : null;
}

export function Ladder({ session, list, words, on_event }: {
  session: LadderSession; list: TiltyardLists['ladder']; words: TiltyardWords; on_event: (event: DuelEvent) => void;
}) {
  const items = ladderItems(list);
  const { climb, verdict } = session;
  const copy = words.ladder;
  const at = verdict?.at ?? (climb ? climbTarget(climb) : null);
  const active = at !== null && (session.phase === 'live' || session.phase === 'verdict');
  const possible = active && climb ? stillPossible(climb, session.order.length) : null;
  const card = (side: Side) => {
    if (at === null || !climb) return null;
    const id = side === 0 ? climb.challenger : verdict?.incumbent ?? climb.order[at];
    const item = id ? items.get(id) : undefined;
    if (!item) return null;
    return <Card key={`${climb.steps.length}-${item.id}-${verdict ? 'verdict' : 'live'}`} item={item} side={side} words={words}
      tag={side === 0 ? verdict ? copy.challenger : copy.challenger_tag(climb.steps.length + 1, maxClimbPicks(session.order.length))
        : copy.incumbent_tag(at + 1, verdict !== null)}
      result={verdict ? verdict.side === side ? 'won' : 'lost' : 'enter'}
      pick={side === 0 ? copy.challenger_wins : verdict ? copy.holds_verdict_pick : copy.holds_pick}
      stamp={side === 0 ? copy.climbs : copy.holds} verb={copy.verb(at + 1, side)}
      on_pick={() => on_event({ kind: 'pick', side })} />;
  };
  return <>
    <Arena with_hill bare={!active} live={active} verdict={verdict?.side ?? null}>
      {active && at !== null ? <>
        {card(0)}
        <Centre key={`${climb?.steps.length}-${verdict ? 'verdict' : 'live'}`} words={words} verdict={verdict !== null}
          round={copy.challenging(at + 1)} of={!verdict && possible ? copy.range(possible, copy.off) : ''}
          hint={verdict ? copy.verdict(at + 1, verdict.side)
            : <><kbd>{words.keys.left}</kbd>{copy.climbs_hint}<kbd>{words.keys.right}</kbd>{copy.holds_hint(at + 1)}</>} />
        {card(1)}
      </> : <LadderBoard session={session} list={list} items={items} words={words} on_event={on_event} />}
      <Hill session={session} possible={possible} title={list.title} items={items} words={words} />
    </Arena>
    <div className="ty-rail" data-role="ty-rail">
      <div><h4>{copy.queue} <span>{copy.queue_detail}</span></h4>
        <div className="ty-queue" data-role="ty-queue">{session.queue.map((id, index) => {
          const item = items.get(id);
          return item && <span key={id} className="ty-qi" data-role="ty-queue-item"
            data-state={index < session.queue_index ? 'done' : index === session.queue_index ? 'now' : 'next'}>
            <Shield item={item} words={words} />{item.title} <small>{item.by}</small>
          </span>;
        })}</div>
      </div>
      {climb && climb.steps.length > 0 && <div><h4>{copy.log}</h4>
        <div className="ty-log" data-role="ty-climb-log">{climb.steps.map(step => <span key={step.at}
          className={`ty-step ty-${step.won ? 'w' : 'l'}`}>
          {copy.step(step.won, step.at + 1, items.get(step.incumbent)?.title ?? '')}
        </span>)}</div>
      </div>}
    </div>
  </>;
}
