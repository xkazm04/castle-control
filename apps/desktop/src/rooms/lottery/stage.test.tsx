import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { buildDrawScene } from '@castle-control/renderer';
import { ProposalQueue } from '@castle-control/ui/steward';
import { fixtureEntries } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createRevealClock } from './playback.js';
import { DrawStage } from './stage.jsx';
import { draw_shapes, isDrawShape, layoutMarks, sampleEntries, stageScene } from './stage-model.js';
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

test('a finished ceremony closes on its proof: a verdict card with the lab handoff in theatre, a chip at the desk', () => {
  const clock = createRevealClock();
  const scene = stageScene('wheel', cast, 'question', false);
  clock.tick(scene, `${seal}:wheel:0`, 0); clock.tick(scene, `${seal}:wheel:0`, 5000);
  const theatre = render({ shape: 'wheel', clock, cast, sealed: true, seal, theatre: true, on_theatre: () => undefined,
    on_prove: () => undefined });
  expect(theatre).toContain('lottery-stage-verdict');
  expect(theatre).toContain(copy.stage.complete(3)); expect(theatre).toContain(copy.stage.proof.local[0]);
  expect(theatre).toContain(`>${copy.stage.prove}</button>`);
  const core = render({ shape: 'wheel', clock, cast, sealed: true, seal, theatre: true, proof: 'core' });
  expect(core).toContain(copy.stage.proof.core[0]); expect(core).not.toContain(copy.stage.prove);
  const desk = render({ shape: 'wheel', clock, cast, sealed: true, seal, on_prove: () => undefined });
  expect(desk).not.toContain('lottery-stage-verdict');
  expect(desk).toMatch(new RegExp(`data-variant="ok"[^>]*>${copy.stage.proof.local[0]}<`));
  const playing = createRevealClock(); playing.tick(scene, `${seal}:wheel:0`, 0);
  expect(render({ shape: 'wheel', clock: playing, cast, sealed: true, seal, theatre: true })).not.toContain(copy.stage.proof.local[0]);
});

test('theatre toggle is exposed with its pressed state, and the sealed stage stamps its wax', () => {
  const html = render({ sealed: true, seal, theatre: true, on_theatre: () => undefined });
  expect(html).toContain('data-phase="sealed"'); expect(html).toContain('lottery-stage-wax');
  expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${copy.stage.desk}<`));
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
