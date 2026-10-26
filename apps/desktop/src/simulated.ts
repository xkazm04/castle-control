import { parseEvent, parseMethodParams, parseMethodResult, statusGet, bridgeStatusGet } from '@castle-control/contract';
import type { ReadResult, Source } from './model.js';

export const simulatedSourceLabel = 'SIMULATED SOURCE · generated fixture · no Twitch, OBS or core connection';
const at = '2026-10-25T12:00:00Z';

/** Generated fixtures only; this module has no network or endpoint capability. */
export function simulatedRead(step: number): ReadResult {
  parseMethodParams(statusGet, {});
  parseMethodParams(bridgeStatusGet, {});
  return {
    status: parseMethodResult(statusGet, JSON.stringify({
      at, version: '0.1.0', uptime_ms: 60000, simulated: true,
      twitch_connected: step > 0, obs_connected: step > 0,
      stream: { live: step > 0, started_at: '2026-10-25T11:00:00Z', viewer_count: 214 },
      gatehouse: { armed_rules: 0, shadow_rules: step > 0 ? 3 : 0, shield: false },
    })),
    bridge: parseMethodResult(bridgeStatusGet, JSON.stringify({ state: step > 0 ? 'connected' : 'connecting' })),
  };
}

export function createSimulatedSource(): Source {
  let step = 0;
  return {
    mode: 'fixture',
    read: async () => simulatedRead(step),
    listen(invalidate) {
      const timer = setTimeout(() => {
        step++;
        // Exercise the same validated invalidation door as the live transport.
        for (const kind of ['bridge.status', 'gatehouse.room', 'resync']) {
          parseEvent(JSON.stringify({ seq: step++, at, kind }));
          invalidate();
        }
      }, 1500);
      return () => { clearTimeout(timer); };
    },
  };
}
