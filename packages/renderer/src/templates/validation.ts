/** Renderer-local data validation; no wire schema or contract identifier is defined here. */
export function record(value: unknown, fields: readonly string[], name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${name} must be a plain record`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new Error(`${name}: unknown field`);
  }
  return value as Record<string, unknown>;
}

export function list(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  // Array.from also exposes holes as undefined, so sparse input cannot skip validation.
  return Array.from(value);
}

export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a nonempty string`);
  }
  return value;
}

export function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

export function integer(value: unknown, name: string, minimum = -Number.MAX_SAFE_INTEGER): number {
  const result = finite(value, name);
  if (!Number.isSafeInteger(result) || result < minimum) throw new Error(`${name} must be a safe integer`);
  return result;
}

/** No schemes, origins, drive paths, traversal, encoded paths, query strings or backslashes. */
export function localImage(fields: Record<string, unknown>): Readonly<{ image_path?: string }> {
  if (!Object.hasOwn(fields, 'image_path')) return {};
  const image_path = text(fields.image_path, 'image_path');
  const segments = image_path.replace(/^\.\//, '').split('/');
  if (!/^[A-Za-z0-9_./-]+$/.test(image_path)
      || segments.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('image_path must be a local relative asset path');
  }
  return { image_path };
}

export function optionalSide(fields: Record<string, unknown>): Readonly<{ side?: string }> {
  return Object.hasOwn(fields, 'side') ? { side: text(fields.side, 'side') } : {};
}
