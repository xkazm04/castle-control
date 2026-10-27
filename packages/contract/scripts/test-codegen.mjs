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
assert.equal(Object.keys(files).length, 10);
const lotsMethods = schema.methods.map((method, index) => ({ ...method, index })).filter(method => method.name.startsWith('lots.'));
assert.equal(lotsMethods.length, 7);
assert(files['lots-validators.mjs'], 'Lots validators have a separate generated module');
assert(files['lots-validators.d.mts'], 'Lots validators retain typed declarations');
assert(files['lots-validation.ts'].includes("from './lots-validators.mjs'"));
assert(!files['lots-validation.ts'].includes("from './validators.mjs'"), 'lazy Lots handles must not import the shared module');
assert(!files['lots-validators.mjs'].includes('require('), 'Lots validators stay standalone browser ESM');
const manifest = parseJson(readFileSync(join(output, '../../package.json'), 'utf8'));
assert.equal(manifest.exports['./lots'], './src/generated/lots-validation.ts', 'Lots use a distinct public subpath');
assert(!/\brequire\s*\(/.test(files['validators.mjs']), 'standalone validators must run as browser ESM');
assert.deepEqual(differences(files), []);
assert.throws(() => artifacts({ methods: [], event_kinds: [], error_codes: [] }), /empty/);
assert.throws(() => artifacts({ ...schema, error_codes: [...schema.error_codes, 'extra'] }), /ten/);
assert.throws(() => differences({}), /empty/);

const scratch = mkdtempSync(join(tmpdir(), 'cc-contract-proof-'));
const authored = join(scratch, 'apps/desktop/src');
const bundled = join(scratch, 'apps/desktop/dist/assets');
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
  writeFileSync(join(authored, 'main.ts'), "export const authored = JSON.parse('null');\n");
  const usage = usages(scratch);
  assert.equal(usage.files.length, 1);
  assert.equal(usage.defects.length, 1, 'authored JSON parsing outside the door is still rejected');
} finally {
  for (const file of [join(authored, 'main.ts'), join(bundled, 'index.js')]) if (existsSync(file)) unlinkSync(file);
  for (const directory of [authored, bundled, join(scratch, 'apps/desktop/dist'), join(scratch, 'apps/desktop'), join(scratch, 'apps')]) {
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
