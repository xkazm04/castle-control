import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { fixtureCandidate, fixtureReplay } from '../../moderation-fixture.js';
import { simulatedDrill } from '../../drill-fixture.js';
import { buildMoat } from '../../moat/moat-model.js';
import { Drill } from './drill.jsx';
import { CompareInspector, MoatCompare } from './moat-compare.jsx';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const note = 'Candidate rules are simulated.';

test('the comparison draws baseline above candidate on one playhead, with the changes ringed', () => {
  const html = renderToStaticMarkup(<MoatCompare diff={fixtureCandidate} note={note} delay_s={4} />);
  expect(text(html)).toContain('Moat comparison · simulated');
  expect(text(html)).toContain('Baseline held 3 of 40 · candidate held 6 of 40 · simulated');
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html.match(/class="moat-scene"/g)).toHaveLength(2);
  expect(html.indexOf('BASELINE · held 3 of 40')).toBeLessThan(html.indexOf('CANDIDATE · held 6 of 40'));
  expect(html.match(/class="moat-changed"/g)?.length).toBeGreaterThanOrEqual(5);
  expect(html.match(/<input\b[^>]*type="range"/g)).toHaveLength(1);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(text(html)).toContain(note);
  expect(text(html)).not.toMatch(/Simulated (viewer|question|repeated)/);
});

test('the inspector sets the two runs side by side and says what changed', () => {
  const before = buildMoat(fixtureCandidate.baseline);
  const after = buildMoat(fixtureCandidate.candidate);
  const released = before.markers.find(marker => marker.rule_id === 'links');
  const same = after.markers.find(marker => marker.message_id === released?.message_id);
  const html = text(renderToStaticMarkup(<CompareInspector before={released} after={same} changed />));
  expect(html).toContain(released?.message_id ?? 'missing');
  expect(html).toContain('Changed by the candidate');
  expect(html).toMatch(/BASELINE CANDIDATE/i);
  expect(html).toContain('Outcome Held · not on air Aired');
  expect(html).toContain('Rule links none recorded');
  expect(text(renderToStaticMarkup(<CompareInspector before={undefined} after={undefined} changed={false} />))).toContain('Select a stamp or a ringed dot');
  expect(text(renderToStaticMarkup(<CompareInspector before={released} after={undefined} changed={false} />))).toContain('not in this run');
});

test('runs on different timelines fall back to a note, never a shared playhead', () => {
  const other = simulatedDrill({ seed: 'unrelated' });
  const html = renderToStaticMarkup(<MoatCompare diff={{ ...fixtureCandidate, candidate: other }} note={note} />);
  expect(text(html)).toContain('do not share one timeline');
  expect(html).not.toContain('moat-scene');
});

test('the fixture drill offers the candidate behind a button and the core diff owns its moat', () => {
  const fixture = renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} compare={fixtureCandidate} />);
  expect(fixture).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Compare with a simulated candidate<\/button>/);
  expect(fixture).not.toContain('moat-compare"');
  expect(renderToStaticMarkup(<Drill result={fixtureReplay} origin="core" />)).not.toContain('Compare with a simulated candidate');
  const quiet = renderToStaticMarkup(<Drill result={fixtureReplay} origin="core" moat={false} />);
  expect(quiet).not.toContain('moat-panel');
  expect(quiet).toContain('moderator-drill-columns');
});
