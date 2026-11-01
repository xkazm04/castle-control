// Cross-language boundary vectors: crates/cc-types/tests/boundary_vectors.rs runs the same table.
import assert from 'node:assert/strict';
import * as validators from '../src/generated/validators.mjs';
import Ajv from 'ajv';
import vectors from '../vectors/boundary-vectors.json' with { type: 'json' };
import schema from '../src/generated/contract.schema.json' with { type: 'json' };

const index = (name) => schema.methods.findIndex((method) => method.name === name);
const authResult = validators[`r${index('auth.twitch.status')}`];
const ruleParams = validators[`p${index('gatehouse.rules.upsert')}`];
assert.equal(typeof authResult, 'function');
assert.equal(typeof ruleParams, 'function');

const base = { rule_id: 'simulated-links', name: 'Simulated links', rule_class: 'pattern',
  mode: 'shadow', action: 'ban', delivery: 'streamer', pattern: 'simulated' };
const authAccepts = (user_id) => authResult({ connected: true, pending: false, user_id, scopes: [] });
const ruleAccepts = (field, text) => ruleParams({ rule: { ...base, [field]: text } });

for (const id of vectors.twitch_user_id.accepted) assert.equal(authAccepts(id), true, `accept ${JSON.stringify(id)}`);
for (const id of vectors.twitch_user_id.refused) assert.equal(authAccepts(id), false, `refuse ${JSON.stringify(id)}`);
for (const field of ['name', 'delivery', 'pattern']) {
  for (const text of vectors.nonblank.blank) assert.equal(ruleAccepts(field, text), false, `${field} refuses ${JSON.stringify(text)}`);
  for (const text of vectors.nonblank.nonblank) assert.equal(ruleAccepts(field, text), true, `${field} accepts ${JSON.stringify(text)}`);
}
const ajv = new Ajv({ strict: false });
for (const [section, type] of [['draw_failure_reason', 'DrawFailureReason']]) {
  assert.ok(schema.types[type], `schema is missing ${type}`);
  const { $schema, ...body } = schema.types[type];
  const check = ajv.compile(body);
  for (const text of vectors[section].accepted) assert.equal(check(text), true, `${type} accepts ${JSON.stringify(text)}`);
  for (const text of vectors[section].refused) assert.equal(check(text), false, `${type} refuses ${JSON.stringify(text)}`);
}
console.log(`[boundary vectors] ${vectors.twitch_user_id.accepted.length + vectors.twitch_user_id.refused.length} ids, ${vectors.nonblank.blank.length + vectors.nonblank.nonblank.length} texts x3 fields`);
