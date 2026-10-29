import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJson } from '../src/door.mjs';
import { artifacts, differences, output } from './codegen.mjs';
import { eventParity, methodParity, usages } from './parity.mjs';

const inputs = ['codegen.mjs', 'parity.mjs', 'test-codegen.mjs'].map((name) => join(import.meta.dirname, name));
console.log(`[contract generator tests] walked ${inputs.filter(existsSync).length} files`);
assert(inputs.every(existsSync));
const schema = parseJson(readFileSync(join(output, 'contract.schema.json'), 'utf8'));
delete schema.$comment;
const files = artifacts(schema);
assert.deepEqual(files, artifacts(schema), 'generation must be byte deterministic');
assert.equal(Object.keys(files).length, 22);
const stewardNames = ['steward.ask', 'steward.writ.seal', 'steward.writ.tear'];
const stewardMethods = schema.methods.map((method, index) => ({ ...method, index })).filter(method => stewardNames.includes(method.name));
assert.equal(stewardMethods.length, 3);
assert(files['steward-validators.mjs'], 'Steward validators compile independently');
assert(files['steward-validators.d.mts'].includes('ValidateFunction<StewardEventPayload>'));
assert(files['steward-validation.ts'].includes("from './steward-validators.mjs'"));
assert(!files['steward-validation.ts'].includes("from './validators.mjs'"));
assert(files['steward-validation.ts'].includes('export const stewardEventPayload = compiled.stewardEventPayload;'));
assert.equal(schema.overlay_push_events['beacons.render.snapshot'], 'BeaconsRenderSnapshot');
assert(files['beacons-render-validators.mjs'], 'overlay render validators compile independently');
assert(files['beacons-render-validators.d.mts'], 'overlay render shape retains typed declarations');
assert(files['beacons-render-validation.ts'].includes("from './beacons-render-validators.mjs'"));
assert(!files['beacons-render-validation.ts'].includes("from './validators.mjs'"));
assert(!files['validators.d.mts'].includes('BeaconsRenderSnapshot'), 'render roots stay out of eager registry');
assert(!files['validators.mjs'].includes('snapshot intensity'), 'no eager render validation');
const beaconsNames = ['visual.list', 'visual.upsert', 'curve.set', 'simulate', 'source.url', 'art.status', 'art.generate'].map(name => `beacons.${name}`);
const beaconsMethods = schema.methods.map((method, index) => ({ ...method, index })).filter(method => beaconsNames.includes(method.name));
assert.equal(beaconsMethods.length, 7);
assert(files['beacons-validators.mjs'], 'Beacons validators have a separate generated module');
assert(files['beacons-validators.d.mts'], 'Beacons validators retain typed declarations');
assert(files['beacons-validation.ts'].includes("from './beacons-validators.mjs'"));
assert(!files['beacons-validation.ts'].includes("from './validators.mjs'"));
const gatehouseNames = ['rules.list', 'rules.upsert', 'ban.confirm', 'ban.dismiss', 'decision.undo',
  'petition.resolve', 'recording.import', 'drill.run', 'drill.diff', 'consensus.get', 'chat.list', 'history.list', 'liveRun.get'].map(name => `gatehouse.${name}`);
const gatehouseMethods = schema.methods.map((method, index) => ({ ...method, index })).filter(method => gatehouseNames.includes(method.name));
assert.equal(gatehouseMethods.length, 13);
assert(files['gatehouse-validators.mjs'], 'Gatehouse validators have a separate generated module');
assert(files['gatehouse-validators.d.mts'], 'Gatehouse validators retain typed declarations');
assert(files['gatehouse-validation.ts'].includes("from './gatehouse-validators.mjs'"));
assert(!files['gatehouse-validation.ts'].includes("from './validators.mjs'"));
const lotsMethods = schema.methods.map((method, index) => ({ ...method, index })).filter(method => method.name.startsWith('lots.'));
assert.equal(lotsMethods.length, 7);
assert(files['lots-validators.mjs'], 'Lots validators have a separate generated module');
assert(files['lots-validators.d.mts'], 'Lots validators retain typed declarations');
assert(files['lots-validation.ts'].includes("from './lots-validators.mjs'"));
assert(!files['lots-validation.ts'].includes("from './validators.mjs'"), 'lazy Lots handles must not import the shared module');
assert(!files['lots-validators.mjs'].includes('require('), 'Lots validators stay standalone browser ESM');
const manifest = parseJson(readFileSync(join(output, '../../package.json'), 'utf8'));
assert.equal(manifest.exports['./lots'], './src/generated/lots-validation.ts', 'Lots use a distinct public subpath');
assert.equal(manifest.exports['./gatehouse'], './src/generated/gatehouse-validation.ts');
assert.equal(manifest.exports['./beacons'], './src/generated/beacons-validation.ts');
assert.equal(manifest.exports['./beacons-render'], './src/generated/beacons-render-validation.ts');
assert.equal(manifest.exports['./steward'], './src/generated/steward-validation.ts');
assert(!/\brequire\s*\(/.test(files['validators.mjs']), 'standalone validators must run as browser ESM');
assert.deepEqual(differences(files), []);
assert.throws(() => artifacts({ methods: [], event_kinds: [], error_codes: [] }), /empty/);
assert.throws(() => artifacts({ ...schema, error_codes: [...schema.error_codes, 'extra'] }), /ten/);
assert.throws(() => differences({}), /empty/);

const scratch = mkdtempSync(join(tmpdir(), 'cc-contract-proof-'));
const authored = join(scratch, 'apps/desktop/src');
const bundled = join(scratch, 'apps/desktop/dist/assets');
const overlay = join(scratch, 'apps/overlay');
try {
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['missing one.ts']);
  writeFileSync(join(scratch, 'one.ts'), 'stale\n');
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['stale one.ts']);
  writeFileSync(join(scratch, 'one.ts'), 'fresh\r\n');
  writeFileSync(join(scratch, 'orphan.ts'), 'simulated orphan\n');
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['orphan orphan.ts']);
  assert.throws(() => usages(scratch), /empty/);
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, 'index.js'), "export const bundled = JSON.parse('null');\n");
  assert.throws(() => usages(scratch), /empty/, 'built bundles are not authored contract usage');
  mkdirSync(authored, { recursive: true });
  mkdirSync(overlay, { recursive: true });
  writeFileSync(join(overlay, 'bundle.js'), "export const compiled = JSON.parse('{}');\n");
  writeFileSync(join(authored, 'main.ts'), "export const authored = JSON.parse('null');\n");
  const usage = usages(scratch);
  assert.equal(usage.files.length, 1);
  assert(!usage.files.includes(join(overlay, 'bundle.js')), 'only the named tracked build output is excluded');
  assert.equal(usage.defects.length, 1, 'authored JSON parsing outside the door is still rejected');
  writeFileSync(join(overlay, 'source.js'), "export const source = JSON.parse('{}');\n");
  const neighbor = usages(scratch);
  assert.equal(neighbor.files.length, 2, 'neighboring overlay JavaScript stays in the inventory');
  assert(neighbor.defects.some(defect => defect.includes('source.js: JSON parsing outside the contract door')));
  unlinkSync(join(overlay, 'bundle.js'));
  assert.throws(() => usages(scratch), /Missing listed build output: apps\/overlay\/bundle.js/, 'stale exclusions must fail');
} finally {
  for (const file of [join(authored, 'main.ts'), join(bundled, 'index.js'), join(overlay, 'bundle.js'), join(overlay, 'source.js')]) if (existsSync(file)) unlinkSync(file);
  for (const directory of [authored, bundled, overlay, join(scratch, 'apps/desktop/dist'), join(scratch, 'apps/desktop'), join(scratch, 'apps')]) {
    if (existsSync(directory)) rmdirSync(directory);
  }
  for (const name of ['one.ts', 'orphan.ts']) if (existsSync(join(scratch, name))) unlinkSync(join(scratch, name));
  rmdirSync(scratch);
}

assert.deepEqual(methodParity(['status.get', 'settings.get'], ['status.get'], ['status.get']), []);
assert.deepEqual(methodParity(['status.get'], ['bad.method'], ['missing.method']), [
  'registered but undeclared: bad.method', 'invoked but unregistered: missing.method',
]);
assert.throws(() => methodParity([], [], []), /empty/);
assert.deepEqual(eventParity(['resync'], ['resync'], ['resync']), []);
assert.deepEqual(eventParity(['resync'], ['unknown'], ['invented']), [
  'mirrored unknown event: unknown', 'missing mirrored event: resync', 'used unknown event: invented',
]);
assert.throws(() => eventParity([], [], []), /empty/);

// Shared references must alias identical roots without weakening any schema.
function validatorUrl(generated, name = 'validators.mjs') {
  return `data:text/javascript;base64,${Buffer.from(generated[name]).toString('base64')}`;
}
const compiled = await import(validatorUrl(files));
const lots = await import(validatorUrl(files, 'lots-validators.mjs'));
const gatehouse = await import(validatorUrl(files, 'gatehouse-validators.mjs'));
const beacons = await import(validatorUrl(files, 'beacons-validators.mjs'));
const steward = await import(validatorUrl(files, 'steward-validators.mjs'));
assert.deepEqual(Object.keys(steward).sort(), [
  ...stewardMethods.flatMap(({ index }) => [`p${index}`, `r${index}`]), 'stewardEventPayload',
].sort());
assert(!/\b(?:import |require\s*\()/.test(files['steward-validators.mjs']), 'Steward stays standalone browser ESM');
assert(!files['validators.mjs'].includes('steward-validators'), 'root registry stays independent');
for (const name of Object.keys(steward)) {
  assert.notEqual(steward[name], compiled[name], 'Steward validators must be independent of the eager module');
}
assert.deepEqual(Object.keys(beacons).sort(), beaconsMethods.flatMap(({ index }) => [`p${index}`, `r${index}`]).sort());
assert.equal(beaconsMethods.length, (files['beacons-validation.ts'].match(/export const beacons/g) ?? []).length);
assert(!/\b(?:import |require\s*\()/.test(files['beacons-validators.mjs']), 'Beacons stays standalone browser ESM');
assert(!files['validators.mjs'].includes('beacons-validators'), 'legacy registry stays independent');
const visual = { visual_id: 'simulated-frame', name: 'Simulated frame', curve: {
  ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' },
} };
const beaconsPositive = new Map([
  ['beacons.visual.list', [{}, { visuals: [visual] }]], ['beacons.visual.upsert', [{ visual }, visual]],
  ['beacons.curve.set', [{ visual_id: visual.visual_id, curve: visual.curve }, visual]],
  ['beacons.simulate', [{ visual_id: visual.visual_id, burst: { source: 'gift', amount: 50 } },
    { label: 'simulated', intensity: { visual_id: visual.visual_id, intensity: 1 } }]],
  ['beacons.source.url', [{ visual_id: visual.visual_id }, { url: 'http://localhost:4312/visuals/simulated-frame' }]],
  ['beacons.art.status', [{}, { available: false }]],
  ['beacons.art.generate', [{ design_id: 'simulated-design', prompt: 'Simulated gold frame',
    model_id: 'simulated-model', width: 512, height: 512, quantity: 1, remove_background: true },
  { design_id: 'simulated-design', assets: [{ asset: 'assets/simulated-frame.png', generated: true,
    provenance: 'leonardo_background_removed' }], costs: [{ call_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    model: 'simulated-model', charge: { credits: '1.250000' } }] }]],
]);
for (const { name, index } of beaconsMethods) {
  for (const [offset, prefix] of ['p', 'r'].entries()) {
    const eager = compiled[`${prefix}${index}`], lazy = beacons[`${prefix}${index}`];
    assert.notEqual(eager, lazy, 'Beacons functions must be independent of first-load registry');
    const positive = beaconsPositive.get(name)[offset];
    for (const value of [positive, { ...positive, extra: true }, null, [], '', 0, { extra: true }]) {
      assert.equal(lazy(value), eager(value), `unchanged ${name} ${prefix}`);
    }
    assert.equal(lazy(positive), true, `${name} ${prefix} accepts synthetic values`);
    assert.equal(lazy({ ...positive, extra: true }), false, `${name} ${prefix} rejects unknown fields`);
  }
}
const sourceIndex = beaconsMethods.find(method => method.name === 'beacons.source.url').index;
for (const url of ['http://example.com:4312/', 'http://localhost.evil:4312/', 'https://localhost:4312/',
  'http://localhost:0/', 'http://localhost:4312/#fragment']) {
  assert.equal(beacons[`r${sourceIndex}`]({ url }), false, 'lazy source URL rejects noncanonical loopback URLs');
  assert.equal(beacons[`r${sourceIndex}`]({ url }), compiled[`r${sourceIndex}`]({ url }));
}
assert.deepEqual(Object.keys(gatehouse).sort(), gatehouseMethods.flatMap(({ index }) => [`p${index}`, `r${index}`]).sort());
assert.equal(gatehouseMethods.length, (files['gatehouse-validation.ts'].match(/export const gatehouse/g) ?? []).length);
assert(!/\b(?:import |require\s*\()/.test(files['gatehouse-validators.mjs']), 'Gatehouse stays standalone browser ESM');
assert(!files['validators.mjs'].includes('gatehouse-validators'), 'legacy registry stays independent');
for (const { index } of gatehouseMethods) {
  for (const prefix of ['p', 'r']) {
    assert.notEqual(compiled[`${prefix}${index}`], gatehouse[`${prefix}${index}`], 'Gatehouse functions must be independent');
    for (const value of [null, [], '', 0, {}, { extra: true }, { decision_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }]) {
      assert.equal(compiled[`${prefix}${index}`](value), gatehouse[`${prefix}${index}`](value));
    }
  }
}
const at = '2026-10-27T12:00:00Z';
const rule = { rule_id: 'simulated-rule', name: 'Simulated rule', rule_class: 'pattern', pattern: 'simulated',
  action: 'hold', mode: 'shadow', delivery: 'streamer' };
const decision = { decision_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', message_id: 'simulated-message', at,
  kind: 'held', verdict: 'hold', operator: 'human', simulated: true, reason_codes: [] };
const configuration = { rules: [rule], bank: 'simulated-bank', judge: 'simulated-judge', prompts: [] };
const hash = 'a'.repeat(64);
const replay = { label: 'simulated', source: 'simulated-recording', instrument_hash: hash,
  instrument: { bank_hash: hash, judge_hash: hash, prompts_hash: hash, rules_hash: hash }, outcomes: [], gaps: [],
  summary: { passes: 0, states: { acted: 0, not_provoked: 0, not_evaluable: 0, judge_pending: 0, judge_void: 0, engine_failed: 0 },
    over_moderation: { evaluated: 0, false_positives: 0 } } };
const positive = new Map([
  ['gatehouse.chat.list', [{ limit: 100 }, { items: [], unavailable_count: 0 }]],
  ['gatehouse.history.list', [{ limit: 100 }, { items: [], unavailable_count: 0 }]],
  ['gatehouse.liveRun.get', [{ limit: 100 }, { items: [], unavailable_count: 0 }]],
  ['gatehouse.rules.list', [{}, { rules: [rule] }]], ['gatehouse.rules.upsert', [{ rule }, rule]],
  ...['ban.confirm', 'ban.dismiss', 'decision.undo'].map(name => [`gatehouse.${name}`, [{ decision_id: decision.decision_id }, decision]]),
  ['gatehouse.petition.resolve', [{ decision_id: decision.decision_id, outcome: 'overturned' }, decision]],
  ['gatehouse.consensus.get', [{ filter: { kind: 'all' }, window_s: 900 }, { at, filter: { kind: 'all' }, window_s: 900, shed_count: 0, directions: [] }]],
  ['gatehouse.recording.import', [{ source: 'simulated-import', messages: [], gaps: [] }, { source: 'simulated-import', recording: 'simulated-recording', message_count: 0, gaps: [] }]],
  ['gatehouse.drill.run', [{ recording: 'simulated-recording', configuration }, replay]],
  ['gatehouse.drill.diff', [{ recording: 'simulated-recording', baseline: configuration, candidate: configuration }, { baseline: replay, candidate: replay, changes: [], label: 'simulated' }]],
]);
for (const { name, index } of gatehouseMethods) {
  const values = positive.get(name);
  assert(values, `missing positive example for ${name}`);
  for (const [offset, prefix] of ['p', 'r'].entries()) {
    for (const validator of [compiled[`${prefix}${index}`], gatehouse[`${prefix}${index}`]]) {
      assert.equal(validator(values[offset]), true, `unchanged ${name} ${prefix} accepts simulated values`);
      assert.equal(validator({ ...values[offset], extra: true }), false, `${name} ${prefix} rejects unknown fields`);
    }
  }
}
assert.deepEqual(Object.keys(lots).sort(), [...lotsMethods.flatMap(({ index }) => [`p${index}`, `r${index}`]), 'lotsEvent'].sort());
for (const { index } of lotsMethods) {
  assert.notEqual(compiled[`p${index}`], lots[`p${index}`], 'lazy params must not share eager function objects');
  assert.notEqual(compiled[`r${index}`], lots[`r${index}`], 'lazy results must not share eager function objects');
  for (const value of [null, [], '', 0, { extra: true }]) {
    assert.equal(compiled[`p${index}`](value), lots[`p${index}`](value));
    assert.equal(compiled[`r${index}`](value), lots[`r${index}`](value));
  }
}
assert.equal(lotsMethods.length, (files['lots-validation.ts'].match(/export const lots/g) ?? []).length);
assert(!files['lots-validators.mjs'].includes('import '), 'lazy validators must not import the legacy compiler module');
assert(!files['validators.mjs'].includes('lots-validators'), 'legacy registry must not pull the lazy module into first load');
const writIndex = lotsMethods.find(method => method.name === 'lots.writ.get').index;
const corpus = parseJson(readFileSync(join(output, '../../../verifier-web/src/simulated-writs.json'), 'utf8'));
assert.equal(corpus.label, 'simulated');
assert.equal(corpus.cases.length, 1000);
for (const item of corpus.cases) assert.equal(lots[`r${writIndex}`](item.writ), true, 'the split accepts the unchanged verifier corpus');
assert.equal(lots[`r${writIndex}`]({ ...corpus.cases[0].writ, extra: true }), false, 'the split still denies unknown fields');
assert.equal(compiled.p0, compiled.p1, 'identical Empty roots compile once');
assert.equal(compiled.writSealParams, compiled.writTearParams, 'Steward ID-only parameters share one validator');
assert.equal(compiled.askResult, compiled.writSealResult, 'Steward snapshots share one validator');
assert.equal(compiled.askResult, compiled.writTearResult, 'tear snapshots keep the same strict envelope');
const conflict = parseJson(JSON.stringify(schema));
conflict.methods[0].result.$defs.Timestamp.pattern = '^simulated$';
assert.throws(() => artifacts(conflict), /Conflicting shared definition: Timestamp/);
const booleans = artifacts({ ...schema, methods: schema.methods.map((method, i) =>
  i === 0 ? { ...method, params: false, result: true } : method) });
const booleanValidators = await import(validatorUrl(booleans));
assert.equal(booleanValidators.p0({}), false, 'false schema still rejects everything');
assert.equal(booleanValidators.r0(null), true, 'true schema still accepts everything');
console.log('Contract generator, drift, empty-inventory and parity assertions passed');
