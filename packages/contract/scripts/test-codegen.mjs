import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
try {
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['missing one.ts']);
  writeFileSync(join(scratch, 'one.ts'), 'stale\n');
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['stale one.ts']);
  writeFileSync(join(scratch, 'one.ts'), 'fresh\r\n');
  writeFileSync(join(scratch, 'orphan.ts'), 'simulated orphan\n');
  assert.deepEqual(differences({ 'one.ts': 'fresh\n' }, scratch), ['orphan orphan.ts']);
  assert.throws(() => usages(scratch), /empty/);
} finally {
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
console.log('Contract generator, drift, empty-inventory and parity assertions passed');
