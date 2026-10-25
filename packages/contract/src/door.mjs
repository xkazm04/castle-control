// The only JSON parsing door for the contract, including its generator.
export class JsonParseError extends SyntaxError {
  constructor(message = 'Invalid JSON input') {
    super(message);
    this.name = 'JsonParseError';
  }
}

/** Decode only; callers validate the resulting unknown value at their schema door. */
export function parseJson(text, { max_bytes } = {}) {
  if (typeof text !== 'string') throw new JsonParseError();
  if (max_bytes !== undefined) {
    if (!Number.isSafeInteger(max_bytes) || max_bytes < 0) throw new RangeError('Invalid JSON byte limit');
    if (text.length > max_bytes || new globalThis.TextEncoder().encode(text).byteLength > max_bytes) {
      throw new JsonParseError('JSON input exceeds byte limit');
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonParseError();
  }
}
