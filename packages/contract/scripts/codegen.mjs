// Adapted from Shadowrunr OS packages/contract/scripts/codegen.mjs @ 7e4b6f8.
// Apache-2.0; see NOTICE. Uses a closed schema emitter instead of an extra dependency.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseJson } from '../src/door.mjs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { _ } from 'ajv/dist/compile/codegen/index.js';

export const root = resolve(import.meta.dirname, '../../..');
export const output = join(root, 'packages/contract/src/generated');
const banner = '// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.\n';

export function exportSchema() {
  const option = process.argv.indexOf('--schema');
  const schemaFile = option < 0 ? process.env.CC_CONTRACT_SCHEMA : process.argv[option + 1];
  if (option >= 0 && !schemaFile) throw new Error('--schema requires a file');
  if (schemaFile) return parseJson(readFileSync(resolve(schemaFile), 'utf8').replace(/^\uFEFF/, ''));
  const result = spawnSync('cargo', ['--config', 'net.offline=false', 'run', '--quiet', '-p', 'cc-types', '--bin', 'export-contract'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Schema export failed: ${result.stderr}`);
  return parseJson(result.stdout);
}

function tsType(schema) {
  if (schema === false || schema.not && Object.keys(schema.not).length === 0) return 'never';
  if (schema === true) return 'unknown';
  if (schema.$ref) return schema.$ref.replace('#/$defs/', '');
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  for (const union of ['oneOf', 'anyOf']) {
    if (schema[union]) return schema[union].map((s) => `(${tsType(s)})`).join(' | ');
  }
  if (schema.type === 'string') return 'string';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') return `Array<${tsType(schema.items)}>`;
  if (schema.type === 'object') {
    const props = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      `${JSON.stringify(key)}${schema.required?.includes(key) ? '' : '?'}: ${tsType(value)};`);
    if (schema.additionalProperties && schema.additionalProperties !== false) {
      props.push(`[key: string]: ${tsType(schema.additionalProperties)};`);
    }
    return props.length ? `{ ${props.join(' ')} }` : 'Record<string, never>';
  }
  throw new Error(`Unsupported schema: ${JSON.stringify(schema)}`);
}

export function artifacts(schema) {
  if (!schema.methods?.length || !schema.event_kinds?.length || schema.error_codes?.length !== 10) {
    throw new Error('Refused empty contract or error taxonomy other than ten codes');
  }
  for (const names of [schema.methods.map((m) => m.name), schema.event_kinds, schema.error_codes]) {
    if (names.length !== new Set(names).size) throw new Error('Duplicate contract identifier');
  }
  const definitions = new Map();
  function add(doc) {
    for (const [name, shape] of Object.entries(doc.$defs ?? {})) definitions.set(name, shape);
    if (doc.title) definitions.set(doc.title, doc);
  }
  for (const shape of Object.values(schema.types)) add(shape);
  for (const method of schema.methods) { add(method.params); add(method.result); }
  const brands = new Set(['MessageId', 'DecisionId', 'WritId', 'DrawRunId', 'RuleId', 'DrawId', 'VisualId', 'DesignId', 'TwitchUserId']);
  const types = [...definitions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, shape]) =>
    `export type ${name} = ${tsType(shape)}${brands.has(name) ? ` & { readonly __brand: ${JSON.stringify(name)} }` : ''};`);
  const nameOf = (shape) => shape.title ?? tsType(shape);
  const methods = schema.methods.map((m) => `  ${JSON.stringify(m.name)}: { params: ${nameOf(m.params)}; result: ${nameOf(m.result)} };`);
  return {
    'contract.schema.json': `${JSON.stringify({ $comment: banner.trim(), ...schema }, undefined, 2)}\n`,
    'schemas.ts': `${banner}export const schemas = ${JSON.stringify(schema)};\n`,
    'types.ts': `${banner}${types.join('\n')}\nexport interface RpcMethods {\n${methods.join('\n')}\n}\n`,
    'meta.ts': `${banner}export const RPC_METHODS = ${JSON.stringify(schema.methods.map((m) => m.name))} as const;\n`
      + `export const EVENT_KINDS = ${JSON.stringify(schema.event_kinds)} as const;\n`
      + `export const ERROR_CODES = ${JSON.stringify(schema.error_codes)} as const;\n`,
    ...validators(schema),
  };
}

function validators(schema) {
  const ajv = new Ajv2020({ strict: true,
    code: { source: true, esm: true, lines: false, formats: _`formats` }, inlineRefs: false });
  const formats = {
    double: { type: 'number', validate: function double(value) { return Number.isFinite(value); } },
    'date-time': function utc(value) {
      const time = Date.parse(value);
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
    },
    uint64: { type: 'number', validate: function uint64(value) { return Number.isSafeInteger(value) && value >= 0; } },
    uint32: { type: 'number', validate: function uint32(value) { return Number.isInteger(value) && value >= 0 && value <= 4294967295; } },
    uint8: { type: 'number', validate: function uint8(value) { return Number.isInteger(value) && value >= 0 && value <= 255; } },
  };
  for (const [name, format] of Object.entries(formats)) ajv.addFormat(name, format);
  const formatSource = Object.entries(formats).map(([name, format]) =>
    `${JSON.stringify(name)}: ${typeof format === 'function' ? format.toString()
      : `{ type: 'number', validate: ${format.validate.toString()} }`}`).join(',');
  const exports = {};
  const declarations = [banner, "import type { ValidateFunction } from 'ajv';",
    "import type { RpcMethods, StreamEvent, LotsEventPayload, ConsensusEventPayload, BeaconsEventPayload, ErrorEnvelope } from './types.js';"];
  function entry(name, shape, type) {
    const ref = `cc:${name}`;
    ajv.addSchema(shape, ref);
    exports[name] = ref;
    declarations.push(`export const ${name}: ValidateFunction<${type}>;`);
  }
  schema.methods.forEach((m, i) => {
    entry(`p${i}`, m.params, `RpcMethods[${JSON.stringify(m.name)}]['params']`);
    entry(`r${i}`, m.result, `RpcMethods[${JSON.stringify(m.name)}]['result']`);
  });
  entry('event', schema.types.StreamEvent, 'StreamEvent');
  entry('lotsEvent', schema.types.LotsEventPayload, 'LotsEventPayload');
  entry('consensusEvent', schema.types.ConsensusEventPayload, 'ConsensusEventPayload');
  entry('beaconsEvent', schema.types.BeaconsEventPayload, 'BeaconsEventPayload');
  entry('error', schema.types.ErrorEnvelope, 'ErrorEnvelope');
  const map = (prefix) => schema.methods.map((m, i) => `[${JSON.stringify(m.name)}, compiled.${prefix}${i}]`).join(',');
  // Ajv's length keyword emits a CommonJS runtime reference even with esm:true.
  // Count Unicode code points inline so the generated browser module stays ESM.
  const source = standaloneCode(ajv, exports)
    .replaceAll('require("ajv/dist/runtime/ucs2length").default', 'unicodeLength');
  if (/\brequire\s*\(/.test(source)) throw new Error('Unsupported CommonJS helper in ESM validators');
  const unicodeLength = source.includes('unicodeLength')
    ? 'function unicodeLength(value) { return Array.from(value).length; }\n' : '';
  return {
    'validators.mjs': `${banner}/* eslint-disable */\n// Ajv standalone output; all authored code and generated types remain linted.\nconst formats = {${formatSource}};\n${unicodeLength}${source}\n`,
    'validators.d.mts': `${declarations.join('\n')}\n`,
    'validation.ts': `${banner}import type { ValidateFunction } from 'ajv';\nimport * as compiled from './validators.mjs';\n`
      + `export const params = new Map<string, ValidateFunction>([${map('p')}]);\n`
      + `export const results = new Map<string, ValidateFunction>([${map('r')}]);\n`
      + 'export const event = compiled.event;\nexport const error = compiled.error;\n',
  };
}

export function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => resolve(e.parentPath, e.name).slice(directory.length + 1).replaceAll('\\', '/')).sort();
}

export function differences(expected, directory = output) {
  const names = Object.keys(expected);
  console.log(`[contract generated] walked ${names.length} files`);
  if (!names.length) throw new Error('Refused empty generated inventory');
  const actual = filesIn(directory);
  console.log(`[contract committed] walked ${actual.length} files`);
  return [...actual.filter((name) => !Object.hasOwn(expected, name)).map((name) => `orphan ${name}`),
    ...names.flatMap((name) => !actual.includes(name) ? [`missing ${name}`]
      : readFileSync(join(directory, name), 'utf8').replaceAll('\r\n', '\n') !== expected[name] ? [`stale ${name}`] : [])];
}
