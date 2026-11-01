import { renderToStaticMarkup } from 'react-dom/server';
import { createLadderSession, SAMPLE, stepLadder } from '@castle-control/duel';
import type { DuelEvent, LadderSession, Side } from '@castle-control/duel';
import { expect, test } from 'vitest';
import { nextDue } from './clock.js';
import { Ladder, ladderAnnouncement } from './ladder.jsx';
import { Tiltyard } from './stage.jsx';
import { tiltyardWords as words } from './words.js';

const list = SAMPLE.ladder;
const initial = () => createLadderSession(list.top.items.map(item => item.id), list.queue.items.map(item => item.id));
const noop = () => undefined;
const render = (session: LadderSession) => renderToStaticMarkup(<Ladder session={session} list={list} words={words} on_event={noop} />);
const rows = (html: string) => [...html.matchAll(/<div class="ty-rung[^"]*"[^>]*>[\s\S]*?<\/div>/g)].map(match => match[0]);
const settle = (session: LadderSession) => stepLadder(session, { kind: 'tick', ms: session.theatre_ms });
function finish(session: LadderSession, side: Side = 0): LadderSession {
  let next = stepLadder(session, { kind: 'enter' });
  for (let count = 0; count < 4 && next.phase !== 'done'; count++) next = settle(stepLadder(next, { kind: 'pick', side }));
  expect(next.phase).toBe('done');
  return next;
}
const announcement = (before: LadderSession, event: DuelEvent) => {
  const after = stepLadder(before, event);
  return { after, text: ladderAnnouncement(before, after, event, list, words) };
};

test('idle stage has the incoming static SAMPLE card, ten undimmed rungs and the labelled hill', () => {
  const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="SAMPLE · SIMULATED" initial_mode="ladder" />);
  expect(html).toContain('data-provenance="sample"');
  expect(html).toContain('A challenger arrives');
  expect(html).toContain('Incoming suggestion · 1 of 3');
  expect(html).toContain('from simulated_viewer_0412');
  expect(html).toContain('by binary search: at most 4 picks over 11 spots.');
  expect(html).toContain('Climb the hill<kbd>Enter</kbd>');
  expect(html).not.toContain('<button type="button" class="ty-card');
  expect(html).not.toContain('data-role="ty-card-pick"');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(rows(html)).toHaveLength(10);
  expect(html).not.toContain('ty-out');
  expect(html).not.toContain('Undo last climb');
  expect(html).toContain('<aside class="ty-hill" data-role="ty-hill" aria-label="Chat&#x27;s all-time top 10 games">');
  expect(html).toContain('<h3 data-role="ty-hill-heading">The hill<small>Chat&#x27;s all-time top 10 games · simulated · session only</small></h3>');
  expect(html.match(/data-state="now"/g)).toHaveLength(1);
  expect(html.match(/data-state="next"/g)).toHaveLength(2);
});

test('Enter starts at index 5, rung #6, with no dimmed rows and the winner\'s distinct centre and hill range wording', () => {
  const live = stepLadder(initial(), { kind: 'enter' });
  const html = render(live);
  expect(rows(html)).toHaveLength(11);
  expect(rows(html)[5]).toContain('data-state="target"');
  expect(rows(html)[5]).toContain('challenged');
  expect(html).not.toContain('ty-out');
  expect(html).toContain('data-role="ty-of">Still possible: #1–off the hill</span>');
  expect(html).toContain('data-role="ty-range-cap">Still possible: #1–below the hill</div>');
  expect(html).toContain('ty-barrier');
  expect(html.match(/class="ty-cone /g)).toHaveLength(2);
  expect(html).toContain('Challenger · pick 1 of at most 4');
  expect(html).toContain('Incumbent · #6');
  expect(html).toContain('Challenging #6');
  expect(html).toContain('<kbd>←</kbd> climbs · <kbd>→</kbd> #6 holds');
  expect(html).toContain('challenger wins');
  expect(html).toContain('holds the rung');
  expect(nextDue(live)).toBeNull();
});

test('left at #6 settles to #1–#6: rung 6 is beaten and dimmed, rungs 7–10 and slot are out', () => {
  const picked = stepLadder(stepLadder(initial(), { kind: 'enter' }), { kind: 'pick', side: 0 });
  const theatre = render(picked);
  expect(theatre).toContain('data-result="won"');
  expect(theatre).toContain('data-result="lost"');
  expect(theatre).toContain('Climbs past #6');
  expect(theatre).toContain('aria-hidden="true">Climbs');
  expect(nextDue(picked)).toBe(1050);
  const html = render(settle(picked));
  expect(html.match(/Still possible: #1–#6/g)).toHaveLength(2);
  expect(rows(html)[5]).toContain('class="ty-rung ty-beat ty-out"');
  expect(rows(html)[5]).toContain('data-state="beat"');
  expect(rows(html)[5]).toContain('beaten');
  for (const row of rows(html).slice(6, 10)) expect(row).toContain('data-state="out"');
  expect(rows(html)[10]).toContain('class="ty-rung ty-slot ty-out"');
  expect(rows(html)[10]).toContain('data-state="slot"');
  expect(rows(html)[2]).toContain('data-state="target"');
  expect(html).toContain('Challenger · pick 2 of at most 4');
  expect(html).toContain('data-role="ty-climb-log"');
  expect(html).toContain('✓ beat #6 Ember Court');
  for (const row of rows(html)) expect(row.match(/data-state=/g)).toHaveLength(1);
});

test('right at #6 marks it held and keeps the below-hill slot in range', () => {
  const picked = stepLadder(stepLadder(initial(), { kind: 'enter' }), { kind: 'pick', side: 1 });
  expect(render(picked)).toContain('Holds the rung: #6');
  expect(render(picked)).toContain('aria-hidden="true">Holds');
  const html = render(settle(picked));
  expect(html).toContain('data-role="ty-of">Still possible: #7–off the hill</span>');
  expect(html).toContain('data-role="ty-range-cap">Still possible: #7–below the hill</div>');
  expect(rows(html)[5]).toContain('class="ty-rung ty-held ty-out"');
  expect(rows(html)[5]).toContain('data-state="held"');
  expect(rows(html)[10]).toContain('class="ty-rung ty-slot ty-range"');
  expect(html).toContain('✗ lost to #6 Ember Court');
});

test('completed placement lands one gold rung, steps nine down at 40ms intervals and names the old #10', () => {
  const done = finish(initial());
  const html = render(done);
  expect(html).toContain('Placed at #1');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html).toContain('Wyrmlight took #1 in 4 picks: beat #6 · beat #3 · beat #2 · beat #1.');
  expect(html.match(/data-state="new"/g)).toHaveLength(1);
  expect(html.match(/data-state="down"/g)).toHaveLength(9);
  expect(html.match(/↓ steps down/g)).toHaveLength(9);
  expect(html).toContain('--ty-step-index:1');
  expect(html).toContain('--ty-step-index:9');
  expect(rows(html).at(-1)).toContain('data-state="fell"');
  expect(rows(html).at(-1)).toContain(list.top.items[9]!.title);
  expect(html).toContain('Copper Saints falls from the hill');
  expect(html).toContain('Undo climb<kbd>⌫</kbd>');
  expect(html).toContain('Next suggestion<kbd>Enter</kbd>');
  expect(html.match(/data-state="done"/g)).toHaveLength(1);
  expect(html.match(/data-state="now"/g)).toHaveLength(1);
  expect(html).not.toContain('data-state="slot"');
  expect(html).not.toContain('data-role="ty-range-cap"');
  expect(stepLadder(done, { kind: 'undo' })).toEqual(initial());
});

test('losing every challenge renders Off the hill with no new, down or fallen rows', () => {
  const html = render(finish(initial(), 1));
  expect(html).toContain('Off the hill');
  expect(html).toContain('lost every challenge and does not make the top 10 in 3 picks: lost to #6 · lost to #9 · lost to #10.');
  expect(rows(html)).toHaveLength(10);
  for (const state of ['new', 'down', 'fell']) expect(html).not.toContain(`data-state="${state}"`);
});

test('third climb keeps its placement board; exhausted idle alone shows the queue-empty board', () => {
  let session = initial();
  for (let i = 0; i < 3; i++) session = finish(session);
  const html = render(session);
  expect(html).toContain('Placed at #1');
  expect(html).toContain('Undo climb<kbd>⌫</kbd>');
  expect(html).toContain('Reset sample ladder<kbd>Enter</kbd>');
  expect(html).not.toContain('The queue is empty');
  expect(html.match(/data-state="done"/g)).toHaveLength(3);
  expect(html).not.toContain('data-state="now"');
  // The winner has a defensive idle branch; normal Enter instead resets the sample.
  const idle = render({ ...session, phase: 'idle', last: null, climb: null });
  expect(idle).toContain('The queue is empty');
  expect(idle).not.toContain('ty-barrier');
  expect(idle).not.toContain('ty-cone');
  expect(idle).toContain('Every simulated suggestion has climbed.');
  expect(idle).toContain('Reset sample ladder<kbd>Enter</kbd>');
  expect(stepLadder(session, { kind: 'enter' })).toEqual(initial());
});

test('called-off climbs return to the preview with the unchanged list and abandonment sentence', () => {
  const live = stepLadder(initial(), { kind: 'enter' });
  const cancelled = stepLadder(live, { kind: 'cancel' });
  const html = render(cancelled);
  expect(html).toContain('A challenger arrives');
  expect(html).toContain('The last climb was abandoned; the list is unchanged.');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html).not.toContain('ty-out');
  expect(cancelled.order).toEqual(initial().order);
  expect(stepLadder(cancelled, { kind: 'enter' })).toEqual(live);
  const second = stepLadder(finish(initial()), { kind: 'enter' });
  expect(render(stepLadder(second, { kind: 'undo' }))).toContain('Undo last climb<kbd>⌫</kbd>');
});

test('winner announcements name each challenge, placement, fall, cancellation, abandonment and undo', () => {
  const started = announcement(initial(), { kind: 'enter' });
  expect(started.text).toBe('Wyrmlight climbs. Challenging number 6, Ember Court.');
  expect(announcement(started.after, { kind: 'pick', side: 0 }).text).toBe('Wyrmlight beats number 6. Challenging number 3.');
  expect(announcement(started.after, { kind: 'pick', side: 1 }).text).toBe('Number 6 holds. Challenging number 9.');
  expect(announcement(started.after, { kind: 'undo' }).text).toBe('Climb abandoned. The list is unchanged.');
  expect(announcement(started.after, { kind: 'cancel' }).text).toBe(words.cancelled);
  let session = started.after;
  while (!session.last) {
    const picked = announcement(session, { kind: 'pick', side: 0 });
    if (picked.after.last) expect(picked.text).toBe('Wyrmlight beats number 1. Placed at number 1 in 4 picks. Copper Saints falls from the hill.');
    const settled = announcement(picked.after, { kind: 'tick', ms: 1050 });
    expect(settled.text).toBeNull();
    session = settled.after;
  }
  expect(announcement(session, { kind: 'undo' }).text).toBe('Climb undone. The list is back as it was.');
  session = started.after;
  for (let count = 0; count < 4 && !session.last; count++) {
    const picked = announcement(session, { kind: 'pick', side: 1 });
    if (picked.after.last) expect(picked.text).toBe('Number 10 holds. It does not make the top 10.');
    session = settle(picked.after);
  }
  expect(session.last?.made_it).toBe(false);
});

test.each([1050, 650] as const)('final verdict holds the recorded pair for %i ms before rendering placement', theatre_ms => {
  let session = stepLadder({ ...initial(), theatre_ms }, { kind: 'enter' });
  for (let count = 0; count < 4; count++) {
    session = stepLadder(session, { kind: 'pick', side: 0 });
    if (session.last) break;
    session = settle(session);
  }
  expect(session.last?.place).toBe(0);
  const html = render(session);
  expect(html).toContain('Climbs past #1');
  expect(html).toContain('data-role="ty-card-title">Wyrmlight');
  expect(html).toContain('data-role="ty-card-title">Lantern Keeper');
  expect(html).not.toContain('data-role="ty-board-title"');
  expect(html).not.toContain('data-state="new"');
  expect(nextDue(session)).toBe(theatre_ms);
  expect(render(settle(session))).toContain('Placed at #1');
});
