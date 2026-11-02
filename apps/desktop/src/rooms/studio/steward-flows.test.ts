import { afterEach, expect, test, vi } from 'vitest';
import { answerStep, chamberChips, matchIntent, startFlow, walkFlow } from '@castle-control/ui/steward-flow';
import type { AnyStewardFlow, FlowState } from '@castle-control/ui/steward-flow';
import { studioSteward } from './steward-flows.js';
import { fixtureDuel, fixturePicture } from './duel-fixture.js';
import { DEMO_KEY, duelHost } from './duel-host.js';
import { entryIds, parseEntries } from './duel-model.js';

const fixture = studioSteward({ mode: 'fixture', phase: 'ready' });
const core = studioSteward({ mode: 'core', phase: 'ready' });
function walk(flow: AnyStewardFlow, answers: string[]): FlowState {
  let state = startFlow(flow);
  for (const answer of answers) {
    const result = answerStep(flow, state, answer);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  return state;
}
afterEach(() => { duelHost.setCore(undefined); });

test('the Map Room offers Start a duel, Duel on stream, Play demo and Catch me up, and maps free text', () => {
  expect(chamberChips('studio', fixture).map(chip => chip.label)).toEqual(['Start a duel', 'Duel on stream', 'Play demo', 'Catch me up']);
  expect(fixture.demo?.simulated).toBe(true);
  const registry = { keep: fixture, lottery: fixture, moderator: fixture, visuals: fixture, studio: fixture, stream: fixture, rehearsal: fixture };
  expect(matchIntent('start a tournament', registry, 'studio')).toMatchObject({ kind: 'flow', flow: 'studio-duel' });
  expect(matchIntent('play the demo', registry, 'studio')).toMatchObject({ kind: 'demo', chamber: 'studio' });
});

test('Start a duel: preset, roster, window, preview of the first match, then the fixture seal opens the vote', async () => {
  const flow = fixture.flows[0]!;
  const state = walk(flow, ['mill', 'keep', '30', 'first']);
  const view = walkFlow(flow, state);
  expect(view.ready).toBe(true);
  expect(view.entries.filter(entry => entry.status === 'answered').map(entry => entry.summary))
    .toEqual(['List · The mill question', 'Contestants · 4 as seeded', 'Window · 30 seconds', 'Preview · looked over']);
  expect(view.draft).toMatchObject({ window_s: 30, entries: [{ title: 'Raze the mill' }, {}, {}, { title: 'Borrow the mill' }] });
  // Nothing has started before the seal.
  expect(fixturePicture(fixtureDuel.getSnapshot()).phase).toBe('ready');
  const outcome = await flow.seal(view.draft);
  expect(outcome.say).toContain('Raze the mill v Borrow the mill');
  expect(fixturePicture(fixtureDuel.getSnapshot())).toMatchObject({ phase: 'live', window_ms: 30_000, left: { title: 'Raze the mill' } });
});

test('a custom list asks the question and the seeded entries, refusing bad counts and repeats', () => {
  const flow = fixture.flows[0]!;
  let state = walk(flow, ['custom', 'Which snack wins?']);
  expect(walkFlow(flow, state).active?.step.id).toBe('entries');
  expect(answerStep(flow, state, 'Crisps; Popcorn; Pretzels').error).toContain('2, 4 or 8');
  expect(answerStep(flow, state, 'Crisps; crisps').error).toContain('different name');
  state = answerStep(flow, state, 'Crisps; Popcorn; Pretzels; Grapes').state;
  expect(walkFlow(flow, state).draft).toMatchObject({ prompt: 'Which snack wins?', entries: [{ title: 'Crisps', by: 'streamer' }, {}, {}, {}] });
  expect(parseEntries('A; B')).toEqual({ entries: ['A', 'B'] });
  expect(entryIds([{ title: 'Spare it!' }, { title: 'spare it' }, { title: '!!' }])).toEqual(['spare-it', 'spare-it-2', 'entry-3']);
});

test('the core seal starts the tournament through the mounted adapter and fails loudly when it cannot', async () => {
  const flow = core.flows[0]!;
  const draft = walkFlow(flow, walk(flow, ['bosses', 'keep', '15', 'first'])).draft;
  await expect(flow.seal(draft)).rejects.toThrow('not on screen');
  const run = vi.fn<(action: unknown) => Promise<void>>(async () => {});
  duelHost.setCore({ run, copySource: vi.fn(async () => {}), outcome: () => ({}) });
  await flow.seal(draft);
  const action = run.mock.calls[0]?.[0] as unknown as { kind: string; key: string; window_ms: number; list: { items: { id: string; seed: string }[] } };
  expect(action).toMatchObject({ kind: 'start', key: 'duel', window_ms: 15_000 });
  expect(action.list.items).toHaveLength(8);
  expect(action.list.items.map(item => item.seed)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  duelHost.setCore({ run, copySource: vi.fn(async () => {}), outcome: () => ({ error: 'start a tournament first' }) });
  await expect(flow.seal(draft)).rejects.toThrow('start a tournament first');
});

test('Play demo is SIMULATED, previews four sample contestants and plays at three times speed', async () => {
  const demo = fixture.demo!;
  const state = walk(demo, ['plan']);
  const view = walkFlow(demo, state);
  expect(view.ready).toBe(true);
  expect(view.draft).toMatchObject({ demo: true });
  await demo.seal(view.draft);
  expect(fixturePicture(fixtureDuel.getSnapshot())).toMatchObject({ phase: 'live', demo: true, speed: 3, key: DEMO_KEY });
  const run = vi.fn<(action: unknown) => Promise<void>>(async () => {});
  duelHost.setCore({ run, copySource: vi.fn(async () => {}), outcome: () => ({}) });
  await core.demo!.seal(view.draft);
  expect(run.mock.calls.map(call => (call[0] as unknown as { kind: string }).kind)).toEqual(['start', 'speed']);
});

test('Duel on stream copies only in core mode and says so in fixture mode', async () => {
  const stream = fixture.flows[1]!;
  const draft = walkFlow(stream, walk(stream, ['look', 'copy'])).draft;
  expect((await stream.seal(draft)).say).toContain('nothing was copied');
  const copySource = vi.fn(async () => {});
  duelHost.setCore({ run: vi.fn(async () => {}), copySource, outcome: () => ({ notice: 'Duel browser-source URL copied. Add it in OBS.' }) });
  const said = await core.flows[1]!.seal(draft);
  expect(copySource).toHaveBeenCalledTimes(1);
  expect(said.say).toBe('Duel browser-source URL copied. Add it in OBS.');
});
