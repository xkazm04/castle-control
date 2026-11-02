import { keyFor } from '../../shell/steward-keys.jsx';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { buildDrawScene } from '@castle-control/renderer';
import { ProposalQueue } from '@castle-control/ui/steward';
import { fixtureEntries } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createRevealClock } from './playback.js';
import { DrawStage } from './stage.jsx';
import { chatLine, draw_shapes, isDrawShape, layoutMarks, lift_path, sampleEntries, stageScene, weightShare } from './stage-model.js';
import type { StageCast } from './stage-model.js';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';

const entries = fixtureEntries(87);
const cast: StageCast = { winners: ['simulated_00014', 'simulated_00002', 'simulated_00080'], label: 'streamer-controlled' };
const seal = 'ab'.repeat(32);

test('the reveal cursor follows the renderer scene events, resumes one key and resets for another', () => {
  const scene = stageScene('wheel', cast, 'question', false);
  expect(scene.events.map(event => event.at_ms)).toEqual(buildDrawScene('wheel', { winners: [...cast.winners], label: cast.label },
    { content: 'question' }).events.map(event => event.at_ms));
  const clock = createRevealClock();
  expect(clock.tick(scene, 'a', 0)).toBe(1200);
  expect(clock.getSnapshot().revealed).toEqual([]);
  expect(clock.tick(scene, 'a', 1300)).toBe(800);
  expect(clock.getSnapshot().revealed).toEqual(['simulated_00014']);
  clock.tick(scene, 'a', 3000);
  expect(clock.getSnapshot()).toMatchObject({ revealed: cast.winners, finished: true });
  clock.tick(scene, 'a', 9000); expect(clock.getSnapshot().revealed).toHaveLength(3);
  clock.tick(scene, 'b', 9100); expect(clock.getSnapshot().revealed).toEqual([]);
  clock.tick(undefined, undefined, 9200); expect(clock.getSnapshot().key).toBeUndefined();
  clock.replay(); expect(clock.getSnapshot().take).toBe(1);
});

test('by hand, the flourish plays, then each call reveals exactly the next winner in the renderer order', () => {
  const scene = stageScene('wheel', cast, 'question', false);
  const first = scene.events[0]?.at_ms ?? 0;
  const clock = createRevealClock(); clock.pace(true, 0);
  expect(clock.by_hand).toBe(true);
  expect(clock.tick(scene, 'h', 0)).toBe(first - 1);
  expect(clock.tick(scene, 'h', 9000)).toBeUndefined();
  expect(clock.getSnapshot()).toMatchObject({ revealed: [], waiting: true, finished: false });
  clock.callNext(9001);
  expect(clock.getSnapshot()).toMatchObject({ revealed: [cast.winners[0]], waiting: true });
  // Held again at once: a quick second call is never lost to an in-between tick.
  expect(clock.tick(scene, 'h', 9002)).toBeUndefined();
  clock.callNext(9003); clock.callNext(9004);
  expect(clock.getSnapshot()).toMatchObject({ revealed: cast.winners, waiting: false, finished: true });
  clock.callNext(9005); expect(clock.getSnapshot().revealed).toEqual(cast.winners);
});

test('switching back to auto after a long hold continues from the hold, never flooding the backlog', () => {
  const scene = stageScene('urn', cast, 'question', false);
  const [first, second, third] = scene.events.map(event => event.at_ms);
  const clock = createRevealClock(); clock.pace(true, 0);
  clock.tick(scene, 'a', 0); clock.tick(scene, 'a', 4000); clock.callNext(4000);
  // The streamer chats for ten seconds, then switches back to auto.
  clock.pace(false, 14000);
  expect(clock.getSnapshot()).toMatchObject({ revealed: [cast.winners[0]], waiting: false });
  expect(clock.tick(scene, 'a', 14001)).toBe((third ?? 0) - (second ?? 0));
  expect(clock.getSnapshot().revealed).toEqual(cast.winners.slice(0, 2));
  const held = createRevealClock(); held.pace(true, 0);
  held.tick(scene, 'b', 0); held.tick(scene, 'b', 30000);
  held.pace(false, 30000);
  expect(held.tick(scene, 'b', 30001)).toBe((second ?? 0) - (first ?? 0));
  expect(held.getSnapshot().revealed).toEqual(cast.winners.slice(0, 1));
});

test('switching by hand off during the flourish keeps the renderer cadence', () => {
  const scene = stageScene('wheel', cast, 'question', false);
  const first = scene.events[0]?.at_ms ?? 0;
  const clock = createRevealClock(); clock.pace(true, 0);
  clock.tick(scene, 'f', 0);
  clock.pace(false, 1000);
  expect(clock.tick(scene, 'f', 1000)).toBe(first - 1000);
  clock.tick(scene, 'f', first);
  expect(clock.getSnapshot().revealed).toEqual(cast.winners.slice(0, 1));
});

test('reduced motion reveals every winner at once and drops the flourish', () => {
  const scene = stageScene('deck', cast, 'question', true);
  expect(scene.motions).toEqual([]);
  const clock = createRevealClock();
  expect(clock.tick(scene, 'r', 0)).toBeUndefined();
  expect(clock.getSnapshot().revealed).toEqual(cast.winners);
});

test('prize scenes carry the canonical disclaimer layer and an idle scene has no events', () => {
  expect(stageScene('urn', cast, 'prize', false).layers.some(layer => layer.kind === 'disclaimer')).toBe(true);
  expect(stageScene('urn', undefined, 'question', false).events).toEqual([]);
});

test('every shape lays every lot inside the artwork space, with dot area following weight', () => {
  const weighted = entries.map((entry, index) => ({ ...entry, weight: 4 + (index % 5) * 2 }));
  for (const shape of draw_shapes) {
    const marks = layoutMarks(shape, weighted);
    expect(marks).toHaveLength(87);
    expect(marks.every(mark => mark.x - mark.r >= 0 && mark.x + mark.r <= 320 && mark.y - mark.r >= 0 && mark.y + mark.r <= 240)).toBe(true);
    const light = marks.find(mark => mark.handle === 'simulated_00001'); const heavy = marks.find(mark => mark.handle === 'simulated_00005');
    expect(heavy && light && heavy.r > light.r).toBe(true);
  }
  expect(isDrawShape('wheel')).toBe(true); expect(isDrawShape('spinner')).toBe(false);
});

test('sampling bounds 10,000 lots and always keeps every winner', () => {
  const many = fixtureEntries(10000);
  const winners = ['simulated_09999', 'simulated_00003'];
  const kept = sampleEntries(many, winners);
  expect(kept.length).toBeLessThanOrEqual(242);
  for (const winner of winners) expect(kept.some(entry => entry.handle === winner)).toBe(true);
});

const render = (props: Partial<Parameters<typeof DrawStage>[0]> = {}) => renderToStaticMarkup(<DrawStage shape="urn"
  on_shape={() => undefined} entries={entries} cast={undefined} content="question" sealed={false} clock={createRevealClock()}
  reveal_ms={1500} {...props} />);

test('the open stage draws renderer artwork, a pressed shape and one mark per lot', () => {
  for (const shape of draw_shapes) {
    const html = render({ shape });
    expect(html).toContain(`data-shape="${shape}"`); expect(html).toContain('data-phase="open"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*data-shape-option="${shape}"`));
    expect(html.match(/data-lot-dot=/g)).toHaveLength(87);
    expect(html).toMatch(/data-ink="(gules|key|or|paper)"/);
  }
});

test('a revealed ceremony shows medals and scoreboard in cast order; an unverified cast never plays', () => {
  const clock = createRevealClock();
  const scene = stageScene('urn', cast, 'question', false);
  clock.tick(scene, `${seal}:urn:0`, 0); clock.tick(scene, `${seal}:urn:0`, 5000);
  const html = render({ clock, cast, sealed: true, seal });
  expect(html).toContain('data-phase="revealed"');
  expect(html.match(/data-medal=/g)).toHaveLength(3);
  const order = [...html.matchAll(/data-stage-winner="(\d)"[^>]*><b>\d<\/b><span>([a-z0-9_]+)</g)].map(match => match[2]);
  expect(order).toEqual(cast.winners);
  expect(html).toContain(copy.stage.labels['streamer-controlled']);
  const refused = render({ clock: createRevealClock(), cast, sealed: true, seal, verified: false });
  expect(refused).toContain('data-phase="casting"'); expect(refused).toContain(copy.stage.unverified);
  expect(refused).not.toContain('data-medal=');
});

test('mid-ceremony, the latest winner lifts out of its shape and the proclamation shows its weight share', () => {
  const weighted = entries.map((entry, index) => ({ ...entry, weight: index === 13 ? 10 : 1 }));
  for (const shape of draw_shapes) {
    const clock = createRevealClock();
    const scene = stageScene(shape, cast, 'question', false);
    clock.tick(scene, `${seal}:${shape}:0`, 0); clock.tick(scene, `${seal}:${shape}:0`, 1300);
    const html = render({ shape, entries: weighted, clock, cast, sealed: true, seal });
    expect(html).toContain('data-phase="revealing"');
    expect(html.match(/data-lift=/g)).toHaveLength(1); expect(html).toContain(`data-lift="${shape}"`);
    expect(html).toContain(copy.stage.share(weightShare(10, 96)).replace("'", '&#x27;'));
  }
  expect(weightShare(10, 96)).toBe(10.4); expect(weightShare(3, 0)).toBe(0);
  for (const shape of draw_shapes) expect(lift_path[shape].out.y).toBeLessThan(lift_path[shape].via.y);
});

test('a held ceremony says so and offers the next call', () => {
  const clock = createRevealClock(); clock.pace(true, 0);
  const scene = stageScene('deck', cast, 'question', false);
  clock.tick(scene, `${seal}:deck:0`, 0); clock.tick(scene, `${seal}:deck:0`, 5000);
  const held = render({ shape: 'deck', clock, cast, sealed: true, seal, theatre: true, by_hand: true, on_by_hand: () => undefined });
  expect(held).toContain(copy.stage.held); expect(held).toContain(`>${copy.stage.call_first}</button>`);
  expect(held).toMatch(new RegExp(`aria-pressed="true"[^>]*><span class="cc-control-key"[^>]*><kbd[^>]*>${keyFor('lottery', 'by_hand')}</kbd></span>${copy.stage.by_hand}<`));
  clock.callNext(5001);
  const next = render({ shape: 'deck', clock, cast, sealed: true, seal, theatre: true, by_hand: true });
  expect(next).toContain(`>${copy.stage.call_next(2, 3)}</button>`); expect(next.match(/data-medal=/g)).toHaveLength(1);
});

test('a finished ceremony closes on its proof: a verdict card with the lab handoff in theatre, a chip at the desk', () => {
  const clock = createRevealClock();
  const scene = stageScene('wheel', cast, 'question', false);
  clock.tick(scene, `${seal}:wheel:0`, 0); clock.tick(scene, `${seal}:wheel:0`, 5000);
  const theatre = render({ shape: 'wheel', clock, cast, sealed: true, seal, theatre: true, on_theatre: () => undefined,
    on_prove: () => undefined });
  expect(theatre).toContain('lottery-stage-verdict');
  expect(theatre).toContain(copy.stage.complete(3)); expect(theatre).toContain(copy.stage.proof.local[0]);
  expect(theatre).toContain(`>${copy.stage.prove}</button>`);
  expect(theatre).toContain(`>${copy.stage.chat}</button>`); expect(theatre).toContain('[SIMULATED rehearsal] Winners: @simulated_00014');
  const core = render({ shape: 'wheel', clock, cast, sealed: true, seal, theatre: true, proof: 'core' });
  expect(core).toContain(copy.stage.proof.core[0]); expect(core).not.toContain(copy.stage.prove);
  const desk = render({ shape: 'wheel', clock, cast, sealed: true, seal, on_prove: () => undefined });
  expect(desk).not.toContain('lottery-stage-verdict');
  expect(desk).toMatch(new RegExp(`data-stamp="ok"[^>]*>[\\s\\S]*?${copy.stage.proof.local[0]}<`));
  const playing = createRevealClock(); playing.tick(scene, `${seal}:wheel:0`, 0);
  expect(render({ shape: 'wheel', clock: playing, cast, sealed: true, seal, theatre: true })).not.toContain(copy.stage.proof.local[0]);
});

test('pointing at an equalizer bar lights exactly the lots holding that weight', () => {
  const weighted = entries.map((entry, index) => ({ ...entry, weight: index % 3 === 0 ? 4 : 11 }));
  const html = render({ entries: weighted, focus_weight: 4 });
  expect(html).toContain('data-focusing="true"');
  expect(html.match(/data-focus="true"/g)).toHaveLength(29);
  expect(render({ entries: weighted })).not.toContain('data-focus');
});

test('the chat line names winners in cast order, carries the seal and labels anything not live', () => {
  expect(chatLine(cast.winners, seal, false)).toBe(`[SIMULATED rehearsal] Winners: @simulated_00014 @simulated_00002 @simulated_00080 · seal ${seal.slice(0, 8)}…${seal.slice(-4)}`);
  expect(chatLine(cast.winners, undefined, true)).toBe('Winners: @simulated_00014 @simulated_00002 @simulated_00080');
  expect(chatLine(Array.from({ length: 40 }, (_, index) => `simulated_${String(index).padStart(5, '0')}`), seal, true).length).toBeLessThanOrEqual(500);
});

test('theatre toggle is exposed with its pressed state, and the sealed stage stamps its wax', () => {
  const html = render({ sealed: true, seal, theatre: true, on_theatre: () => undefined });
  expect(html).toContain('data-phase="sealed"'); expect(html).toContain('lottery-stage-wax');
  expect(html).toMatch(new RegExp(`data-theatre-toggle="true" aria-pressed="true"[^>]*aria-label="${copy.stage.desk}"`));
  expect(html).toContain(`title="${copy.stage.desk}"`);
});

test('the fixture room stage animates only the frozen roll it sealed', async () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const { port } = lotterySession(queue);
  const proposal = queue.getSnapshot().proposals.at(-1);
  if (!proposal) throw new Error('Missing simulated proposal');
  await sealLotteryProposal(queue, proposal); await port.start();
  const writ = port.getSnapshot().writ;
  expect(writ?.winners.every(winner => port.getSnapshot().entries.some(entry => entry.handle === winner))).toBe(true);
});

test('stage CSS stays on tokens: no hex, rgb, hsl or px', () => {
  const css = readFileSync(new URL('./stage.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
});
