import { parseJson } from '@castle-control/contract/door';

export const CONFIG_SEGMENT_MAX_BYTES = 5120;
export type ConfigSegmentResult<T> = Readonly<{ ok: true; data: T } | { ok: false }>;

/**
 * Renderer-local boundary, not a new wire schema. The host supplies the existing
 * template/schema parser; decoding alone never authorizes design data. The
 * contract door measures UTF-8 bytes before decoding. No errors escape this door.
 */
export function readConfigSegment<T>(segment: unknown, parse: (value: unknown) => T): ConfigSegmentResult<T> {
  try {
    if (typeof segment !== 'string') return Object.freeze({ ok: false });
    const value = parseJson(segment, { max_bytes: CONFIG_SEGMENT_MAX_BYTES });
    return Object.freeze({ ok: true, data: parse(value) });
  } catch {
    return Object.freeze({ ok: false });
  }
}
