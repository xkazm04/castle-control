// Adapted from Shadowrunr OS packages/contract/scripts/codegen.mjs @ 7e4b6f8.
// Apache-2.0; see NOTICE. Uses a closed schema emitter instead of an extra dependency.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseJson } from '../src/door.mjs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { _ } from 'ajv/dist/compile/codegen/index.js';
import ts from 'typescript';

export const root = resolve(import.meta.dirname, '../../..');
export const output = join(root, 'packages/contract/src/generated');
const banner = '// GENERATED from cc-types by pnpm -C packages/contract generate. Do not edit.\n';

export function exportSchema() {
  const option = process.argv.indexOf('--schema');
  const schemaFile = option < 0 ? process.env.CC_CONTRACT_SCHEMA : process.argv[option + 1];
  if (option >= 0 && !schemaFile) throw new Error('--schema requires a file');
  if (schemaFile) {
    const schema = parseJson(readFileSync(resolve(schemaFile), 'utf8').replace(/^\uFEFF/, ''));
    // A committed snapshot is also a supported input; do not re-embed our banner.
    if (schema.$comment === banner.trim()) delete schema.$comment;
    return schema;
  }
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
  const brands = new Set(['MessageId', 'DecisionId', 'LeaseId', 'ArtCallId', 'WritId', 'DrawRunId', 'RuleId', 'DrawId', 'VisualId', 'DesignId', 'TwitchUserId']);
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

// Schemars exports self-contained documents. Giving every document its own Ajv
// root compiles the same local $defs repeatedly, even with inlineRefs:false.
// Intern identical shapes in one reference scope, retaining every constraint.
function sharedSchemas(schema) {
  const id = 'cc:shared';
  const definitions = new Map();
  const documents = [...Object.values(schema.types), ...schema.methods.flatMap((m) => [m.params, m.result])];
  const body = (shape) => typeof shape === 'boolean' ? shape : Object.fromEntries(Object.entries(shape)
    .filter(([key]) => !['$defs', '$schema', 'title'].includes(key)));
  for (const doc of documents) {
    for (const [name, shape] of Object.entries(doc.$defs ?? {})) {
      const value = body(shape);
      if (definitions.has(name) && JSON.stringify(definitions.get(name)) !== JSON.stringify(value)) {
        throw new Error(`Conflicting shared definition: ${name}`);
      }
      definitions.set(name, value);
    }
  }
  const names = new Map([...definitions].map(([name, shape]) => [JSON.stringify(shape), name]));
  function reference(shape) {
    const value = body(shape);
    const key = JSON.stringify(value);
    let name = names.get(key);
    if (!name) {
      name = `root${names.size}`;
      if (definitions.has(name)) throw new Error(`Shared schema name collision: ${name}`);
      names.set(key, name);
      definitions.set(name, value);
    }
    return `${id}#/$defs/${name}`;
  }
  // Local references now resolve against the shared document, not each method.
  function absolute(value) {
    if (Array.isArray(value)) return value.map(absolute);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === '$ref' && typeof item === 'string' && item.startsWith('#/$defs/') ? `${id}${item}` : absolute(item)]));
  }
  return { reference, document: () => ({ $id: id, $defs: absolute(Object.fromEntries(definitions)) }) };
}

// Keep each function's evaluated-property metadata local to a pure initializer.
// Bare `validateN.evaluated = ...` statements otherwise retain unused validators
// as observable writes. Functions close over the later schema/helper constants;
// exports come last so aliases never read a const in its temporal dead zone.
function treeShakeable(source) {
  const ast = ts.createSourceFile('validators.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = [], constants = [], exports = [], metadata = new Map();
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node)) functions.push(node);
    else if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.expression.left) && node.expression.left.name.text === 'evaluated') {
      metadata.set(node.expression.left.expression.getText(ast), node.getText(ast));
    } else if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.push(node.getText(ast));
    else constants.push(node.getText(ast));
  }
  return functions.map((node) => {
    const name = node.name.text;
    return `const ${name} = /*#__PURE__*/ (() => { ${node.getText(ast)} ${metadata.get(name) ?? ''} return ${name}; })();`;
  }).concat(constants, exports).join('');
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
  const exports = {}, lotsExports = {}, gatehouseExports = {}, beaconsExports = {};
  const beaconsNames = new Set(['visual.list', 'visual.upsert', 'curve.set', 'simulate', 'source.url', 'art.status', 'art.generate'].map(name => `beacons.${name}`));
  const gatehouseNames = new Set(['rules.list', 'rules.upsert', 'ban.confirm', 'ban.dismiss', 'decision.undo',
    'petition.resolve', 'recording.import', 'drill.run', 'drill.diff', 'consensus.get'].map(name => `gatehouse.${name}`));
  const shared = sharedSchemas(schema);
  const declarations = [banner, "import type { ValidateFunction } from 'ajv';",
    "import type { RpcMethods, StreamEvent, LotsEventPayload, ConsensusEventPayload, BeaconsEventPayload, DesignPackage, ErrorEnvelope, AskParams, AskResult, Writ, WritSealParams, WritSealResult, WritTearParams, WritTearResult, StewardEventPayload } from './types.js';"];
  const lotsDeclarations = [banner, "import type { ValidateFunction } from 'ajv';",
    "import type { RpcMethods, LotsEventPayload } from './types.js';"];
  const gatehouseDeclarations = [banner, "import type { ValidateFunction } from 'ajv';",
    "import type { RpcMethods } from './types.js';"];
  const beaconsDeclarations = [...gatehouseDeclarations];
  function entry(name, shape, type, lots = false) {
    exports[name] = shared.reference(shape);
    const declaration = `export const ${name}: ValidateFunction<${type}>;`;
    declarations.push(declaration);
    if (lots) { lotsExports[name] = exports[name]; lotsDeclarations.push(declaration); }
  }
  schema.methods.forEach((m, i) => {
    entry(`p${i}`, m.params, `RpcMethods[${JSON.stringify(m.name)}]['params']`, m.name.startsWith('lots.'));
    entry(`r${i}`, m.result, `RpcMethods[${JSON.stringify(m.name)}]['result']`, m.name.startsWith('lots.'));
    if (gatehouseNames.has(m.name)) {
      for (const [prefix, type] of [['p', 'params'], ['r', 'result']]) {
        gatehouseExports[`${prefix}${i}`] = exports[`${prefix}${i}`];
        gatehouseDeclarations.push(`export const ${prefix}${i}: ValidateFunction<RpcMethods[${JSON.stringify(m.name)}]['${type}']>;`);
      }
    }
    if (beaconsNames.has(m.name)) {
      for (const [prefix, type] of [['p', 'params'], ['r', 'result']]) {
        beaconsExports[`${prefix}${i}`] = exports[`${prefix}${i}`];
        beaconsDeclarations.push(`export const ${prefix}${i}: ValidateFunction<RpcMethods[${JSON.stringify(m.name)}]['${type}']>;`);
      }
    }
  });
  entry('event', schema.types.StreamEvent, 'StreamEvent');
  entry('lotsEvent', schema.types.LotsEventPayload, 'LotsEventPayload', true);
  entry('consensusEvent', schema.types.ConsensusEventPayload, 'ConsensusEventPayload');
  entry('beaconsEvent', schema.types.BeaconsEventPayload, 'BeaconsEventPayload');
  entry('designPackage', schema.types.DesignPackage, 'DesignPackage');
  for (const name of ['AskParams', 'AskResult', 'Writ', 'WritSealParams', 'WritSealResult',
    'WritTearParams', 'WritTearResult', 'StewardEventPayload']) {
    entry(name[0].toLowerCase() + name.slice(1), schema.types[name], name);
  }
  entry('error', schema.types.ErrorEnvelope, 'ErrorEnvelope');
  // Independent roots: render validation never enters the eager RPC registry.
  const renderEvent = Object.entries(schema.overlay_push_events ?? {})
    .find(([, type]) => type === 'BeaconsRenderSnapshot')?.[0];
  if (!renderEvent) throw new Error('Missing overlay render snapshot identifier');
  const renderExports = { shape: shared.reference(schema.types.BeaconsRenderSnapshot) };
  ajv.addSchema(shared.document());
  const map = (prefix) => schema.methods.map((m, i) => `[${JSON.stringify(m.name)}, compiled.${prefix}${i}]`).join(',');
  const methods = [], lotsMethods = [], gatehouseMethods = [], beaconsMethods = [];
  schema.methods.forEach((m, i) => {
    const name = m.name.replace(/\.([a-z])/g, (_, letter) => letter.toUpperCase());
    const declaration = `export const ${name} = { method: ${JSON.stringify(m.name)} as const, params: compiled.p${i}, result: compiled.r${i} };`;
    methods.push(declaration);
    if (m.name.startsWith('lots.')) lotsMethods.push({ name, declaration });
    if (gatehouseNames.has(m.name)) gatehouseMethods.push(declaration);
    if (beaconsNames.has(m.name)) beaconsMethods.push(declaration);
  });
  return {
    'beacons-render-validators.mjs': compileValidators(ajv, renderExports, formatSource),
    'beacons-render-validators.d.mts': `${banner}import type { ValidateFunction } from 'ajv';\n`
      + `import type { BeaconsRenderSnapshot } from './types.js';\n`
      + `export const shape: ValidateFunction<BeaconsRenderSnapshot>;\n`,
    'beacons-render-validation.ts': `${banner}import { parseJson } from '../door.mjs';\n`
      + `import { shape } from './beacons-render-validators.mjs';\n`
      + `import type { BeaconsRenderSnapshot } from './types.js';\n`
      + `export type { BeaconsRenderSnapshot } from './types.js';\n`
      + `export const BEACONS_RENDER_SNAPSHOT_EVENT = ${JSON.stringify(renderEvent)} as const;\n`
      + `/** Schema plus cross-field ID checks, matching cc-types' validated TryFrom. */\n`
      + `export function validateBeaconsRenderSnapshot(value: unknown): value is BeaconsRenderSnapshot {\n`
      + `  return shape(value) && value.intensity.visual_id === value.visual.visual_id\n`
      + `    && (value.package !== undefined) === (value.visual.design_id !== undefined)\n`
      + `    && value.package?.design_id === value.visual.design_id;\n}\n`
      + `/** Accepted full replacement only; hosts verify package bytes before publishing. */\n`
      + `export function parseBeaconsRenderSnapshot(text: string): BeaconsRenderSnapshot {\n`
      + `  const value = parseJson(text);\n`
      + `  if (!validateBeaconsRenderSnapshot(value)) throw new Error('Invalid render snapshot');\n`
      + `  return value;\n}\n`,
    'validators.mjs': compileValidators(ajv, exports, formatSource),
    'validators.d.mts': `${declarations.join('\n')}\n`,
    'lots-validators.mjs': compileValidators(ajv, lotsExports, formatSource),
    'lots-validators.d.mts': `${lotsDeclarations.join('\n')}\n`,
    'lots-validation.ts': `${banner}import * as compiled from './lots-validators.mjs';\n`
      + `${lotsMethods.map(method => method.declaration).join('\n')}\n`,
    'validation.ts': `${banner}import type { ValidateFunction } from 'ajv';\nimport * as compiled from './validators.mjs';\n`
      + `export const params = /*#__PURE__*/ new Map<string, ValidateFunction>([${map('p')}]);\n`
      + `export const results = /*#__PURE__*/ new Map<string, ValidateFunction>([${map('r')}]);\n`
      + `${methods.join('\n')}\n`
      + 'export const event = compiled.event;\nexport const error = compiled.error;\n',
    'gatehouse-validators.mjs': compileValidators(ajv, gatehouseExports, formatSource),
    'gatehouse-validators.d.mts': `${gatehouseDeclarations.join('\n')}\n`,
    'gatehouse-validation.ts': `${banner}import * as compiled from './gatehouse-validators.mjs';\n`
      + `${gatehouseMethods.join('\n')}\n`,
    'beacons-validators.mjs': compileValidators(ajv, beaconsExports, formatSource),
    'beacons-validators.d.mts': `${beaconsDeclarations.join('\n')}\n`,
    'beacons-validation.ts': `${banner}import * as compiled from './beacons-validators.mjs';\n`
      + `${beaconsMethods.join('\n')}\n`,
  };
}

// Compile the lazy subpath independently of the legacy synchronous registry.
// Shared function objects would hoist the lazy view's validators into first load.
// Both use the same schema scope, which checks conflicts before compilation.
function compileValidators(ajv, exports, formatSource) {
  // Ajv's length keyword emits a CommonJS runtime reference even with esm:true.
  // Count Unicode code points inline so the generated browser module stays ESM.
  // Ajv's standalone emitter does not mark an exported root completed. Emit
  // each distinct root once, then alias public names that share that root.
  const roots = new Map();
  const unique = {};
  const aliases = [];
  for (const [name, ref] of Object.entries(exports)) {
    const first = roots.get(ref);
    if (first) aliases.push(`export const ${name} = ${first};`);
    else { roots.set(ref, name); unique[name] = ref; }
  }
  const source = treeShakeable(standaloneCode(ajv, unique) + aliases.join(''))
    .replaceAll('require("ajv/dist/runtime/ucs2length").default', 'unicodeLength');
  if (/\brequire\s*\(/.test(source)) throw new Error('Unsupported CommonJS helper in ESM validators');
  const unicodeLength = source.includes('unicodeLength')
    ? 'function unicodeLength(value) { return Array.from(value).length; }\n' : '';
  return `${banner}/* eslint-disable */\n// Ajv standalone output; all authored code and generated types remain linted.\nconst formats = {${formatSource}};\n${unicodeLength}${source}\n`;
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
