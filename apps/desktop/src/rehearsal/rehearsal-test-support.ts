// Generated SIMULATED data only; never an OBS credential or a real viewer.
import { vi } from 'vitest';
import { parseMethodResult, lotsDrawList } from '@castle-control/contract';
import type { EventKind, RehearsalStatus } from '@castle-control/contract';
import { fixtureVisuals } from '../beacons-fixture.js';
import type { RehearsalConnection, RehearsalNetwork } from './rehearsal-core.js';
import { createRehearsalModel } from './rehearsal-model.js';

export const simulatedDraw = parseMethodResult(lotsDrawList, JSON.stringify({ draws: [{
  draw_id: 'simulated-rehearsal-test', name: 'SIMULATED rehearsal questions',
  policy: { content: 'question', paid_entry: false, paid_weight: false, subscriber_only: false,
    channel_points: false, free_entry_equal_odds: true, regions: [], prize_value_usd_cents: 0,
    registration_confirmed: false, official_rules: true, twitch_disclaimer: true },
  rules: { pool: { kind: 'keyword', keyword: '!join' }, winner_count: 1, cooldown_s: 0,
    cohort_caps: [], weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
}] })).draws[0]!;
export const simulatedVisual = { ...fixtureVisuals[0]!, visual_id: 'simulated-beacon', name: 'SIMULATED beacon' };

export function simulatedRehearsal() {
  const listeners = new Set<(kind: EventKind) => void>();
  const emit = (kind: EventKind) => { for (const listener of listeners) listener(kind); };
  const status: RehearsalStatus = { active: true, crowd_per_minute: 0, obs: { connected: true }, at: '2026-11-01T12:00:00Z' };
  let filled = false;
  let duel = false;
  const rpc = vi.fn<RehearsalNetwork['rpc']>(async (_endpoint, _session, method, params) => {
    switch (method) {
      case 'rehearsal.start': emit('rehearsal.status'); return structuredClone(status);
      case 'obs.connect': status.obs = { connected: true }; emit('obs.status'); return status.obs;
      case 'obs.scene.ensure': status.scene_name = 'Castle Control · Rehearsal'; return { created: true };
      case 'obs.rehearsal.clear': delete status.scene_name; return { removed: 3 };
      case 'beacons.visual.list': return { visuals: [simulatedVisual] };
      case 'lots.draw.list': return { draws: filled ? [simulatedDraw] : [] };
      case 'tiltyard.source.url':
        if (!duel) throw { code: 'unavailable', message: 'SIMULATED unavailable' };
        return { url: 'http://localhost:4821/tiltyard/current' };
      case 'gatehouse.source.url': return { url: 'http://localhost:4821/gatehouse/current' };
      case 'beacons.source.url': return { url: 'http://localhost:4821/beacons/simulated-beacon' };
      case 'lots.source.url': return { url: `http://localhost:4821/lots/${simulatedDraw.draw_id}` };
      case 'obs.source.create': return { source_name: 'Castle Control · SIMULATED output' };
      case 'rehearsal.scenario.run': filled = true; return { accepted: true };
      case 'rehearsal.crowd.set':
        if ('per_minute' in params && typeof params.per_minute === 'number') status.crowd_per_minute = params.per_minute;
        emit('rehearsal.status'); return structuredClone(status);
      default: throw new Error('Unexpected SIMULATED method');
    }
  });
  const connection: RehearsalConnection = { launch: { mode: 'core', endpoint: 'http://127.0.0.1:4820', session_token: 'e'.repeat(64) },
    transport: { rpc }, subscribeEvents(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const model = createRehearsalModel({ mode: 'core', connection });
  return { model, rpc, connection, emit, status, fill: () => { filled = true; }, duel: () => { duel = true; } };
}
