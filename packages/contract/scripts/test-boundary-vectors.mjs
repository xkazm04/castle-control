// Cross-language boundary vectors: crates/cc-types/tests/boundary_vectors.rs runs the same table.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as validators from '../src/generated/validators.mjs';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const vectors = read('../vectors/boundary-vectors.json');
const schema = read('../src/generated/contract.schema.json');
const index = (name) => schema.methods.findIndex((method) => method.name === name);
const authResult = validators[`r${index('auth.twitch.status')}`];
assert.equal(typeof authResult, 'function');

const authAccepts = (user_id) => authResult({ connected: true, pending: false, user_id, scopes: [] });

for (const id of vectors.twitch_user_id.accepted) assert.equal(authAccepts(id), true, `accept ${JSON.stringify(id)}`);
for (const id of vectors.twitch_user_id.refused) assert.equal(authAccepts(id), false, `refuse ${JSON.stringify(id)}`);
console.log(`[boundary vectors] ${vectors.twitch_user_id.accepted.length + vectors.twitch_user_id.refused.length} ids`);
