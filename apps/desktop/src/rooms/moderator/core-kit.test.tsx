import { componentProbe } from './component-probe.jsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { CoreChat, CoreHistory } from './core-reads.jsx';
import { CoreConsensus } from './core-consensus.jsx';
import { CoreDrill } from './core-drill.jsx';
import { CaptureConfiguration, CaptureList } from './capture-drill.jsx';
import { ConnectedGatehouse } from './core.jsx';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { fixtureReplay, fixtureRules } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

afterEach(() => vi.restoreAllMocks());

async function seeded() {
  const capture = { recording: 'simulated-capture', from: '2026-10-29T12:00:00Z', to: '2026-10-29T12:00:02Z',
    configuration: { rules: [], bank: 'simulated-bank', judge: 'rules-only', prompts: [] },
    instrument: fixtureReplay.instrument, instrument_hash: fixtureReplay.instrument_hash, gaps: [],
    inputs: { bank: { label: 'simulated-bank', calibration: 'simulated', cases: [] },
      judge: { revision: 'simulated', model: 'none', tier: 'simulated', rubric: 'simulated', parameters: {} },
      prompts: { version: 'simulated', system: 'simulated', prompts: [], sources: {} } } };
  const decision_id = '01K8F7A0000000000000000001';
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async () => ({ items: [{ coverage: 'retained', decision_id, provenance: 'simulated', capture }], unavailable_count: 0 }) });
  await port.loadLiveRuns(); port.selectCapture(decision_id);
  expect(port.getSnapshot().selected_capture).toBeDefined();
  const state = { ...port.getSnapshot(), rules: fixtureRules.rules };
  return { port, state };
}

test('every core read, consensus, drill and capture button carries the kit class', async () => {
  const { port, state } = await seeded(); const manual = { ...state }; delete manual.selected_capture;
  const panels = [<CoreChat state={state} port={port} />, <CoreHistory state={state} port={port} />,
    <CoreConsensus state={state} port={port} />, <CoreDrill state={manual} port={port} />,
    <CaptureList state={state} port={port} />, <CaptureConfiguration state={state} port={port} />];
  for (const panel of panels) {
    const buttons = renderToStaticMarkup(panel).match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toMatch(/class="[^"]*\bcc-button\b/);
  }
});

function auditFields(html: string) {
  expect(html).not.toMatch(/<label\b[^>]*>(?:(?!<\/label>).)*<(?:input|textarea|select)\b/s);
  const labels = [...html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([^<]+)<\/label>/g)];
  const controls = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*id="([^"]+)"[^>]*>/g)];
  expect(labels.length).toBeGreaterThan(0);
  for (const control of controls) expect(labels.filter(label => label[1] === control[1])).toHaveLength(1);
  // Exact visible label -> one associated input, including generated useId IDs.
  for (const label of labels) expect(controls.filter(control => control[1] === label[1])).toHaveLength(1);
}

test('manual/capture fields use separate exact labels and unique associated controls', async () => {
  const { port, state } = await seeded(); const manual = { ...state }; delete manual.selected_capture;
  auditFields(renderToStaticMarkup(<><CoreDrill state={manual} port={port} /><CaptureConfiguration state={state} port={port} /></>));
  const classifier = { ...fixtureRules.rules[0], rule_id: 'simulated-classifier', name: 'Simulated classifier', rule_class: 'classifier', mode: 'shadow', action: 'hold', delivery: 'streamer' };
  // The public port parses the synthetic rule at its normal contract door.
  const rulePort = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'b'.repeat(64) },
    { rpc: async (_endpoint, _session, method) => method === 'gatehouse.rules.list' ? { rules: [classifier] } : Promise.reject({ code: 'unavailable', message: 'simulated unavailable read' }) });
  await rulePort.load();
  auditFields(renderToStaticMarkup(<ConnectedGatehouse port={rulePort} replay={false} />));
});

test('the conditional emote field uses the same kit field association', async () => {
  const { port, state } = await seeded(); const h = componentProbe(() => <CoreConsensus state={state} port={port} />);
  h.render(); h.click(copy.one_emote); auditFields(h.render());
});
