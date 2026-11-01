// The gatehouse subpath must cover every gatehouse.* method in the registry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJson } from '../src/door.mjs';
import { artifacts, output } from './codegen.mjs';

const schema = parseJson(readFileSync(join(output, 'contract.schema.json'), 'utf8'));
delete schema.$comment;
const files = artifacts(schema);
const registry = schema.methods.map((method, index) => ({ name: method.name, index })).filter(({ name }) => name.startsWith('gatehouse.'));
const declared = files['gatehouse-validators.d.mts'];
const missing = registry.filter(({ index }) => !declared.includes(`export const p${index}:`) || !declared.includes(`export const r${index}:`)).map(({ name }) => name);
assert.deepEqual(missing, [], `gatehouse subpath omits registry methods: ${missing.join(', ')}`);
console.log(`[gatehouse registry] ${registry.length} methods covered`);
