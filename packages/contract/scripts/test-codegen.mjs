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
assert.equal(Object.keys(files).length, 7);
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
const compiled = await import(`data:text/javascript;base64,${Buffer.from(files['validators.mjs']).toString('base64')}`);
assert.equal(compiled.p0, compiled.p1, 'identical Empty roots compile once');
assert.equal(compiled.writSealParams, compiled.writTearParams, 'Steward ID-only parameters share one validator');
assert.equal(compiled.askResult, compiled.writSealResult, 'Steward snapshots share one validator');
assert.equal(compiled.askResult, compiled.writTearResult, 'tear snapshots keep the same strict envelope');
const conflict = parseJson(JSON.stringify(schema));
conflict.methods[0].result.$defs.Timestamp.pattern = '^simulated$';
assert.throws(() => artifacts(conflict), /Conflicting shared definition: Timestamp/);
const booleans = artifacts({ ...schema, methods: schema.methods.map((method, i) =>
  i === 0 ? { ...method, params: false, result: true } : method) });
const booleanValidators = await import(`data:text/javascript;base64,${Buffer.from(booleans['validators.mjs']).toString('base64')}`);
assert.equal(booleanValidators.p0({}), false, 'false schema still rejects everything');
assert.equal(booleanValidators.r0(null), true, 'true schema still accepts everything');
console.log('Contract generator, drift, empty-inventory and parity assertions passed');
