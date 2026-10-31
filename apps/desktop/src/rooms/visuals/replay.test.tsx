import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { ProposalQueue } from '@castle-control/ui/steward';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { createBeaconsPreview } from '../../beacons-model.js';
import { nightBursts, replayTrace } from '../../beacons-replay.js';
import { createFixtureCurveEditor } from './fixture-curve.jsx';
import { NightReplay } from './replay.jsx';
import { scrubSeconds } from './replay-trace.jsx';
import { openCurveDraft, proposeCurve, sealedCurve } from './replay-proposal.js';
import { VisualsWork } from './room.jsx';

const bursts = nightBursts(fixtureOfferings);

test('a curve edit re-runs the trace and changes nothing else', () => {
  const port = createBeaconsPreview();
  const before = port.getSnapshot();
  const altar = before.visuals[0];
  if (!altar) throw new Error('Missing generated altar');
  const trace = replayTrace(altar.visual.curve, altar.gift_weight, bursts);
  const editor = createFixtureCurveEditor(port);
  editor.move(3, 60, 1);
  const after = port.getSnapshot();
  const edited = after.visuals[0];
  if (!edited) throw new Error('Missing generated altar');
  const retraced = replayTrace(edited.visual.curve, edited.gift_weight, bursts);
  expect(retraced).not.toEqual(trace);
  expect(retraced.peak.intensity).toBeGreaterThan(trace.peak.intensity);
  // Same night, same accounting: only the curve and therefore the intensities differ.
  expect(retraced.points.map(point => [point.t, point.total])).toEqual(trace.points.map(point => [point.t, point.total]));
  expect(edited.total).toBe(altar.total);
  expect(after.events).toBe(before.events);
  expect(after.visuals[1]).toBe(before.visuals[1]);
  expect(after.visuals[2]).toBe(before.visuals[2]);
  expect(edited.gift_weight).toBe(altar.gift_weight);
});

test('the room shows the simulated replay above the bench without fetching anything', () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const html = renderToStaticMarkup(<VisualsWork />);
    for (const text of ['Replay a night · Offering altar', 'Sample night · 00:00 / 48:00', 'SIMULATED', 'Money affects visuals only',
      'Send curve to the Steward', 'Scrub the night', '1×', '10×', '30×']) expect(html).toContain(text);
    expect(html.match(/data-offering-tick=/g)).toHaveLength(60);
    expect(html.match(/class="visuals-replay-tick"/g)).toHaveLength(bursts.length);
    expect(html.indexOf('visuals-replay')).toBeGreaterThan(html.indexOf('class="visuals-plates"'));
    expect(html.indexOf('visuals-replay')).toBeLessThan(html.indexOf('visuals-bench'));
    expect(html).toContain('data-trace="current"');
    expect(html).not.toContain('data-trace="before"');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('the curve goes to the Steward as a proposal, amends in place, and seals as the new baseline', () => {
  const queue = new ProposalQueue();
  const port = createBeaconsPreview();
  const editor = createFixtureCurveEditor(port);
  const visual = () => port.getSnapshot().visuals[0]?.visual;
  const first = visual();
  if (!first) throw new Error('Missing generated altar');
  expect(sealedCurve(first.visual_id, queue)).toBe(first.curve);
  editor.move(3, 160, 1);
  const tuned = visual();
  if (!tuned) throw new Error('Missing generated altar');
  const sent = proposeCurve(tuned, 'Peak 90% at minute 47', queue);
  expect(sent.ok).toBe(true);
  const draft = openCurveDraft(tuned.visual_id, queue);
  expect(draft?.chamber).toBe('visuals');
  expect(draft?.state).toBe('drafted');
  expect(draft?.fields.find(field => field.key === 'curve')?.value).toBe('0→0% · 10→25% · 30→60% · 160→100%');
  expect(draft?.fields.find(field => field.key === 'scope')?.value).toContain('money affects visuals only');
  // Nothing is written by proposing: the sealed baseline is still the sample curve.
  expect(sealedCurve(tuned.visual_id, queue)).toBe(first.curve);
  editor.move(3, 200, 1);
  const retuned = visual();
  if (!retuned) throw new Error('Missing generated altar');
  proposeCurve(retuned, 'Peak 80% at minute 47', queue);
  const amended = openCurveDraft(retuned.visual_id, queue);
  expect(amended?.id).toBe(draft?.id);
  expect(amended?.revision).toBe(2);
  expect(amended?.fields.find(field => field.key === 'curve')?.struck).toEqual(['0→0% · 10→25% · 30→60% · 160→100%']);
  expect(queue.seal(amended?.id ?? '').ok).toBe(true);
  expect(sealedCurve(retuned.visual_id, queue)).toEqual(retuned.curve);
  expect(openCurveDraft(retuned.visual_id, queue)).toBeUndefined();
  expect(proposeCurve(retuned, 'again', queue).ok).toBe(true);
  expect(openCurveDraft(retuned.visual_id, queue)?.id).not.toBe(amended?.id);
});

test('the replay draws the last sealed curve dashed once the draft differs', () => {
  const queue = new ProposalQueue();
  const port = createBeaconsPreview();
  const editor = createFixtureCurveEditor(port);
  editor.move(3, 60, 1);
  const item = port.getSnapshot().visuals[0];
  if (!item) throw new Error('Missing generated altar');
  const html = renderToStaticMarkup(<NightReplay item={item} editor={editor} queue={queue} />);
  expect(html).toContain('data-trace="before"');
  expect(html).toContain('Dashed, the last sealed curve: climbs · Peak');
});

test('replay styles stay token-only', () => {
  const css = readFileSync(new URL('./replay.css', import.meta.url), 'utf8');
  const known = new Set([...Object.keys(tokens.layout), ...Object.keys(tokens.theme.paper)]);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) expect(known.has(token ?? '')).toBe(true);
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
});

test('pressing on the trace scrubs to that moment on the range steps, clamped to the night', () => {
  const rect = { left: 100, width: 400 };
  expect(scrubSeconds(150, rect, 2880)).toBe(360);
  expect(scrubSeconds(301, rect, 2880)).toBe(1450);
  expect(scrubSeconds(40, rect, 2880)).toBe(0);
  expect(scrubSeconds(900, rect, 2880)).toBe(2880);
  expect(scrubSeconds(150, { left: 0, width: 0 }, 2880)).toBeUndefined();
});

test('a pinned night offers one fit, and the fit button never writes by itself', () => {
  const queue = new ProposalQueue();
  const port = createBeaconsPreview();
  const editor = createFixtureCurveEditor(port);
  const item = port.getSnapshot().visuals[0];
  if (!item) throw new Error('Missing generated altar');
  const html = renderToStaticMarkup(<NightReplay item={item} editor={editor} queue={queue} initial_night="gift_wave" />);
  expect(html).toContain('Gift wave · 00:00 / 48:00');
  expect(html).toContain('Saturates');
  expect(html).toMatch(/Fit the top point to this night&#x27;s peak · move it to \d+/);
  expect(html.match(/class="visuals-replay-pinned"/g)?.length).toBeGreaterThan(0);
  expect(html).toContain('pinned at max');
  expect(queue.getSnapshot().proposals).toHaveLength(0);
  expect(port.getSnapshot().visuals[0]).toBe(item);
});
