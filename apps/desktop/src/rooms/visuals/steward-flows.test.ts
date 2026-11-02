import { beforeEach, expect, test } from 'vitest';
import { proposalQueue } from '@castle-control/ui/steward';
import { answerStep, chamberChips, matchIntent, startFlow, walkFlow } from '@castle-control/ui/steward-flow';
import type { AnyStewardFlow, FlowState, StewardRegistry } from '@castle-control/ui/steward-flow';
import { stewardRegistry } from '../../shell/steward-flows.js';
import { nightBursts, replayTrace } from '../../beacons-replay.js';
import { sampleNight } from '../../beacons-nights.js';
import { fittedCurve, nightPhrase, nightTrace, shotResult, tunedVisual } from './flow-model.js';
import { resetFixtureBeacons } from './stage-state.js';
import { flow_ids, stageView } from './stage-view.js';
import { narrate } from './stage-narration.js';
import { sealedCurve } from './replay-proposal.js';
import { visualsSteward } from './steward-flows.js';

const fixture = { mode: 'fixture', phase: 'ready' } as const;
beforeEach(() => { resetFixtureBeacons(); });

function play(flow: AnyStewardFlow, answers: readonly string[]): FlowState {
  let state = startFlow(flow);
  for (const value of answers) {
    const result = answerStep(flow, state, value);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  return state;
}
const steward = () => visualsSteward(fixture);
const flow = (id: string) => {
  const found = [...steward().flows, steward().demo].find(item => item?.id === id);
  if (!found) throw new Error(`Missing flow ${id}`);
  return found;
};

test('the Beacons dock offers tune and test fire chips, Play demo, and maps free text to the flows', () => {
  const chips = chamberChips('visuals', steward()).map(chip => chip.label);
  expect(chips).toEqual(['Tune a beacon', 'Test fire', 'Play demo', 'Catch me up']);
  const registry: StewardRegistry = stewardRegistry(fixture);
  expect(matchIntent('replay a night', registry, 'visuals')).toMatchObject({ kind: 'flow', flow: flow_ids.replay });
  expect(matchIntent('test fire', registry, 'visuals')).toMatchObject({ kind: 'flow', flow: flow_ids.test });
  expect(steward().demo?.simulated).toBe(true);
});

test('tune: nothing changes while drafting; the hold seals the preset curve, feed and decay into the room', async () => {
  const port = resetFixtureBeacons();
  const before = port.getSnapshot();
  const tune = flow(flow_ids.tune);
  const state = play(tune, ['gilded-frame', 'subscribe', 'eager', 'slow', 'ok']);
  const view = walkFlow(tune, state);
  expect(view.ready).toBe(true);
  expect(port.getSnapshot()).toBe(before);
  const outcome = await tune.seal(view.draft);
  const frame = port.getSnapshot().visuals.find(item => item.visual.visual_id === 'gilded-frame');
  expect(frame?.visual.input?.source).toBe('subscribe');
  expect(frame?.visual.curve.ranges.at(-1)?.total).toBe(40);
  expect(frame?.visual.curve.decay).toEqual({ kind: 'exponential', half_life_s: 900 });
  expect(port.getSnapshot().selected).toBe('gilded-frame');
  if (!frame) throw new Error('Missing frame');
  expect(sealedCurve(frame.visual.visual_id, proposalQueue)).toEqual(frame.visual.curve);
  expect(outcome.say).toContain('Sealed');
});

test('tune preset cards carry measured consequences from the generated nights', () => {
  const tune = flow(flow_ids.tune);
  const state = play(tune, ['offering-altar', 'gift']);
  const step = walkFlow(tune, state).active?.step;
  if (step?.kind !== 'preset') throw new Error('Expected the strength presets');
  const cards = step.presets(walkFlow(tune, state).draft);
  expect(cards.map(card => card.label)).toEqual(['As it is', 'Gentle', 'Balanced', 'Eager']);
  for (const card of cards) expect(card.consequence).toMatch(/^Full at \d+ · Sample night: .* · Gift wave: /);
});

test('test fire: the picture predicts the shot, and only the hold adds the simulated events', async () => {
  const port = resetFixtureBeacons();
  const fire = flow(flow_ids.test);
  const state = play(fire, ['offering-altar', 'gift50']);
  const draft = walkFlow(fire, state).draft as { visual: string; shot: 'gift50' };
  const snapshot = port.getSnapshot();
  const view = stageView(snapshot.visuals, snapshot.selected, { flow: fire.id, step: 'seal', draft, simulated: true, ready: true });
  const altar = snapshot.visuals[0];
  if (!altar) throw new Error('Missing altar');
  const predicted = shotResult(altar.visual.curve, altar.total, altar.gift_weight, 'gift50');
  expect(view.before).toBeCloseTo(predicted.before);
  expect(view.item.intensity).toBeCloseTo(predicted.after);
  expect(port.getSnapshot().events).toHaveLength(600);
  await fire.seal(draft);
  expect(port.getSnapshot().events).toHaveLength(650);
  expect(port.getSnapshot().visuals[0]?.intensity).toBeCloseTo(predicted.after);
});

test('replay: the night choice shows how each night fares; a fit seals the fitted curve', async () => {
  const port = resetFixtureBeacons();
  const replay = flow(flow_ids.replay);
  const altar = port.getSnapshot().visuals[0];
  if (!altar) throw new Error('Missing altar');
  const state = play(replay, ['offering-altar', 'gift_wave', 'ok', 'fit']);
  const view = walkFlow(replay, state);
  expect(view.ready).toBe(true);
  await replay.seal(view.draft);
  const fitted = fittedCurve(altar.visual.curve, 'gift_wave');
  expect(port.getSnapshot().visuals[0]?.visual.curve).toEqual(fitted);
  expect(nightPhrase(nightTrace(fitted, 'gift_wave'))).not.toContain('full blaze');
});

test('Play demo: a simulated night plays in the picture, the Steward narrates it, and the seal stays in the sample room', async () => {
  const port = resetFixtureBeacons();
  const demo = flow(flow_ids.demo);
  const state = play(demo, ['gift_wave']);
  const draft = walkFlow(demo, state).draft;
  const snapshot = port.getSnapshot();
  const view = stageView(snapshot.visuals, snapshot.selected, { flow: demo.id, step: 'watch', draft, simulated: true, ready: false });
  expect(view).toMatchObject({ mode: 'night', night: 'gift_wave', stamp: 'Simulated demo night' });
  expect(view.item.visual.visual_id).toBe('gilded-frame');
  const night = sampleNight('gift_wave');
  const counted = new Set(nightBursts(night.offerings).map(burst => burst.offering));
  const trace = replayTrace(view.item.visual.curve, 1, nightBursts(night.offerings));
  const line = (position: number) => narrate({ name: 'gilded camera frame', offerings: night.offerings, counted, trace, curve: view.item.visual.curve, position });
  expect(line(12 * 60 + 10)).toContain('swells to');
  expect(line(2880)).toContain('End of the night');
  const finished = play(demo, ['gift_wave', 'ok', 'keep']);
  expect(walkFlow(demo, finished).ready).toBe(true);
  const outcome = await demo.seal(walkFlow(demo, finished).draft);
  expect(outcome.say).toContain('That was the demo');
  expect(port.getSnapshot().selected).toBe('gilded-frame');
});

test('the tuned visual changes only what the draft names', () => {
  const altar = resetFixtureBeacons().getSnapshot().visuals[0]?.visual;
  if (!altar) throw new Error('Missing altar');
  expect(tunedVisual(altar, {})).toEqual(altar);
  expect(tunedVisual(altar, { decay: 'hold' }).curve).toEqual({ ...altar.curve, decay: { kind: 'none' } });
});
