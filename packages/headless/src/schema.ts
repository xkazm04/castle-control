import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseJson } from '@castle-control/contract/door';

export type JsonObject = { readonly [key: string]: unknown };

const EMPTY: JsonObject = { type: 'object', properties: {}, additionalProperties: false };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The generated contract document is the only source of tool input schemas.
 * It sits beside the contract's public entry; it is read as data (never
 * imported), and parsed here, once, by the contract's own JSON door.
 */
function loadParams(): ReadonlyMap<string, JsonObject> {
  const entry = createRequire(import.meta.url).resolve('@castle-control/contract');
  const document = parseJson(readFileSync(join(dirname(entry), 'generated', 'contract.schema.json'), 'utf8'));
  if (!isObject(document) || !Array.isArray(document.methods)) throw new Error('Invalid contract schema document');
  const params = new Map<string, JsonObject>();
  for (const method of document.methods) {
    if (!isObject(method) || typeof method.name !== 'string' || !isObject(method.params)) {
      throw new Error('Invalid contract schema method');
    }
    params.set(method.name, method.params);
  }
  return params;
}

let cache: ReadonlyMap<string, JsonObject> | undefined;

/** The params schema of one RPC method; Empty becomes an explicit empty object schema. */
export function paramsSchema(method: string): JsonObject {
  cache ??= loadParams();
  const schema = cache.get(method);
  if (!schema) throw new Error(`No contract params schema for ${method}`);
  // Tool arguments are always one JSON object (MCP inputSchema requires it).
  if (schema.type !== 'object') throw new Error(`Contract params of ${method} are not an object`);
  if (schema.title === 'Empty' && schema.properties === undefined) return EMPTY;
  // `$schema` describes the document, not the tool argument; drop it from the copy.
  return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema'));
}
