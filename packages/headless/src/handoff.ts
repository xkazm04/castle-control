import { parseJson } from '@castle-control/contract/door';

/** The launcher's one stdout line. The token is a capability: never print, log or store it. */
export type Handoff = { readonly endpoint: string; readonly token: string; readonly overlay_origin: string };

export class HandoffError extends Error {}

/**
 * The one parse door for the cc-headless handoff line, mirroring the e2e-lots
 * rules (e2e/core-launch.ts): exact keys, a 64-hex token, a 127.0.0.1 RPC
 * endpoint and a separate localhost overlay origin. Error messages never echo
 * the input, so a rejected line cannot leak its token.
 */
export function parseHandoff(line: string): Handoff {
  let value: unknown;
  try {
    value = parseJson(line, { max_bytes: 1024 });
  } catch {
    throw new HandoffError('Invalid headless core handoff');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'endpoint,overlay_origin,token'
    || !('endpoint' in value) || typeof value.endpoint !== 'string'
    || !('token' in value) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || !('overlay_origin' in value) || typeof value.overlay_origin !== 'string') {
    throw new HandoffError('Invalid headless core handoff');
  }
  let endpoint: URL;
  let overlay: URL;
  try {
    endpoint = new URL(value.endpoint);
    overlay = new URL(value.overlay_origin);
  } catch {
    throw new HandoffError('Invalid headless core handoff');
  }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port
    || endpoint.href !== `${endpoint.origin}/` || value.endpoint !== endpoint.href
    || overlay.protocol !== 'http:' || overlay.hostname !== 'localhost' || !overlay.port
    || value.overlay_origin !== overlay.origin || overlay.port === endpoint.port) {
    throw new HandoffError('Headless core must use separate ephemeral loopback origins');
  }
  return { endpoint: value.endpoint, token: value.token, overlay_origin: value.overlay_origin };
}
