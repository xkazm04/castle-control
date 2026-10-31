import { renderToStaticMarkup } from 'react-dom/server';
import { createShowSession, currentMatch, finalOrder, SAMPLE, stepShow } from '@castle-control/duel';
import { expect, test } from 'vitest';
import { nextDue } from './clock.js';
import { Tiltyard } from './stage.jsx';
import { Showdown } from './showdown.jsx';
import { createTiltyardState, tiltyardReducer } from './session.js';
import { tiltyardWords as words } from './words.js';

const noop = () => undefined;
test('Showdown opens on the SAMPLE first match, one seal and all seven programme matches', () => {
  const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="Test lists" />);
  for (const value of ['The Ashen Warden', 'Glass Serpent', 'data-provenance="sample"', 'role="dialog"', 'aria-label="Test lists"',
    'aria-modal="false"', 'tabindex="-1"', 'aria-live="polite"']) expect(html).toContain(value);
  expect(html.match(/data-role="ty-card"/g)).toHaveLength(2);
  expect(html.match(/data-role="ty-seal"/g)).toHaveLength(1);
  expect(html).toContain('ty-barrier');
  expect(html.match(/class="ty-cone /g)).toHaveLength(2);
  expect(html.match(/data-role="ty-match"/g)).toHaveLength(7);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain('<b><i>I</i>Showdown</b>');
  expect(html).toContain('data-role="ty-seal-vs">VS');
  const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
});
test('seven recorded picks reach a champion with crown, Champion stamp and eight final places', () => {
  let session = createShowSession(SAMPLE.bracket);
  for (let n = 0; n < 7; n++) {
    session = stepShow(session, { kind: 'pick', side: n % 2 === 0 ? 0 : 1 });
    expect(session.history).toHaveLength(n + 1);
    session = stepShow(session, { kind: 'tick', ms: session.theatre_ms });
  }
  expect(session.phase).toBe('done');
  expect(finalOrder(session.bracket)).toHaveLength(8);
  const html = renderToStaticMarkup(<Showdown session={session} words={words} on_event={noop} />);
  expect(html).toContain('class="ty-crown"');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html).toContain('data-role="ty-champion-card"');
  expect(html).toContain('data-role="ty-stamp" aria-hidden="true">Champion');
  expect(html.match(/data-role="ty-order-row"/g)).toHaveLength(8);
});
test('verdict uses both result hooks and retains the current programme match', () => {
  const session = stepShow(createShowSession(SAMPLE.bracket), { kind: 'pick', side: 0 });
  const html = renderToStaticMarkup(<Showdown session={session} words={words} on_event={noop} />);
  expect(html).toContain('ty-card ty-won'); expect(html).toContain('data-result="won"');
  expect(html).toContain('ty-card ty-lost'); expect(html).toContain('data-result="lost"');
  expect(html).toContain('data-verdict="0"');
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain('Match 1 of 7 · decided');
});
test('cancelled Showdown keeps the lineup in the room and can reopen or undo', () => {
  const initial = createShowSession(SAMPLE.bracket);
  const picked = stepShow(initial, { kind: 'pick', side: 0 });
  const cancelled = stepShow(picked, { kind: 'cancel' });
  const html = renderToStaticMarkup(<Showdown session={cancelled} words={words} on_event={noop} />);
  expect(html).toContain('The lists are closed'); expect(html).toContain('picks so far are kept.');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html.match(/<figure>/g)).toHaveLength(8);
  expect(stepShow(cancelled, { kind: 'enter' }).phase).toBe('live');
  expect(stepShow(cancelled, { kind: 'undo' }).bracket).toBe(initial.bracket);
});
test('a cancelled final stays closed, and Enter opens a fresh bracket', () => {
  let session = createShowSession(SAMPLE.bracket);
  for (let n = 0; n < 6; n++) session = stepShow(stepShow(session, { kind: 'pick', side: 0 }), { kind: 'enter' });
  session = stepShow(stepShow(session, { kind: 'pick', side: 0 }), { kind: 'cancel' });
  expect(session.phase).toBe('called_off');
  const html = renderToStaticMarkup(<Showdown session={session} words={words} on_event={noop} />);
  expect(html).toContain(words.closed_title); expect(html).not.toContain('data-role="ty-champion-card"');
  expect(stepShow(session, { kind: 'enter' }).history).toHaveLength(0);
});
test('nextDue wakes only for theatre, at its remaining duration, in both motion settings', () => {
  for (const theatre_ms of [1050, 650] as const) {
    const live = createShowSession(SAMPLE.bracket, { theatre_ms });
    expect(nextDue(live)).toBeNull();
    const verdict = stepShow(live, { kind: 'pick', side: 0 });
    expect(nextDue(verdict)).toBe(theatre_ms);
    expect(nextDue(stepShow(verdict, { kind: 'tick', ms: 100 }))).toBe(theatre_ms - 100);
    expect(nextDue(stepShow(verdict, { kind: 'enter' }))).toBeNull();
    expect(nextDue(stepShow(verdict, { kind: 'cancel' }))).toBeNull();
  }
});
test('stage reducer keeps sessions on mode changes, skips theatre and announces the recorded result', () => {
  const initial = createTiltyardState(SAMPLE, 'show', false);
  const picked = tiltyardReducer(initial, { kind: 'event', event: { kind: 'pick', side: 0 }, words });
  expect(picked.announcement).toBe('The Ashen Warden wins. Next: Quarterfinal, Salt King versus Hollow Bell.');
  expect(picked.show.phase).toBe('verdict');
  const chat = tiltyardReducer(picked, { kind: 'mode', mode: 'chat' });
  expect(chat.show.bracket).toBe(picked.show.bracket); expect(chat.show.phase).toBe('live');
  expect(chat.chat).toBe(initial.chat); expect(chat.ladder).toBe(initial.ladder);
  expect(chat.chat.match_key).toBe('mill:0:0');
  const back = tiltyardReducer(chat, { kind: 'mode', mode: 'show' });
  expect(currentMatch(back.show.bracket)?.index).toBe(1);
  const cancelled = tiltyardReducer(back, { kind: 'event', event: { kind: 'cancel' }, words });
  expect(cancelled.announcement).toBe(words.cancelled);
  const reduced = tiltyardReducer(cancelled, { kind: 'motion', reduced: true });
  expect(reduced.show.theatre_ms).toBe(650); expect(reduced.ladder.theatre_ms).toBe(650);
  expect(createTiltyardState(SAMPLE, 'show', true).show.theatre_ms).toBe(650);
});
