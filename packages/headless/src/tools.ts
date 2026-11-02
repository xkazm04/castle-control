import { invoke, invokeMethod, parseParams, rehearsalCrowdSet, rehearsalScenarioRun, rehearsalStart, rehearsalStop,
  type RpcMethods } from '@castle-control/contract';
import { paramsSchema, type JsonObject } from './schema.ts';

type RpcMethod = keyof RpcMethods;

/** read: no state change. simulated: rehearsal-only, generated traffic. local: answered by this package. */
export type ToolClass = 'read' | 'simulated' | 'local';
export type LocalMethod = 'events.since' | 'overlay.snapshot';
export type OverlayKind = 'beacons' | 'gatehouse' | 'tiltyard';

type Row<C extends ToolClass, M extends string> = {
  readonly name: string; readonly method: M; readonly class: C;
  readonly description: string; readonly inputSchema: JsonObject;
};
/** A prepared request: arguments already parsed by the contract, ready to send to one core. */
export type Send = (endpoint: string, token: string) => Promise<unknown>;
export type RpcTool = Row<'read' | 'simulated', RpcMethod> & {
  /** Parses args with the contract params validator (throws if they fail), then binds the literal RPC call. */
  readonly prepare: (args: unknown) => Send;
};
export type LocalTool = Row<'local', LocalMethod>;
export type Tool = RpcTool | LocalTool;

/** MCP clients require ^[a-zA-Z0-9_-]{1,64}$, so dots become underscores. */
export function toolName(method: string): string {
  return method.replaceAll('.', '_');
}

type Call<M extends RpcMethod> =
  (endpoint: string, token: string, params: RpcMethods[M]['params']) => Promise<RpcMethods[M]['result']>;

/**
 * Each row carries its own literal `invoke(…, '<method>', …)` so contract
 * parity proves every allowlisted method is registered in the core.
 */
function rpc<M extends RpcMethod>(method: M, kind: 'read' | 'simulated', description: string, call: Call<M>): RpcTool {
  return {
    name: toolName(method), method, class: kind, description, inputSchema: paramsSchema(method),
    prepare: args => {
      const params = parseParams(method, args);
      return (endpoint, token) => call(endpoint, token, params);
    },
  };
}

const local = (method: LocalMethod, description: string, inputSchema: JsonObject): LocalTool =>
  ({ name: toolName(method), method, class: 'local', description, inputSchema });

/**
 * Methods the headless layer must never reach: they act on Twitch, real
 * viewers, the owner's OBS, the store, paid providers or configuration.
 * Together with the allowlist below they partition RPC_METHODS (pinned by test).
 */
export const ARMED: readonly RpcMethod[] = [
  'auth.twitch.start', 'auth.twitch.revoke', 'settings.set', 'store.forgetUser', 'store.purgeAll',
  'gatehouse.rules.upsert', 'gatehouse.rules.setMode', 'gatehouse.ban.confirm', 'gatehouse.ban.dismiss',
  'gatehouse.decision.undo', 'gatehouse.petition.resolve', 'gatehouse.held.resolve', 'gatehouse.delay.set',
  'gatehouse.shield.set', 'gatehouse.lease.end', 'gatehouse.recording.import', 'gatehouse.drill.run',
  'gatehouse.drill.diff', 'lots.draw.upsert', 'lots.image.upload', 'lots.roll.seal', 'lots.cast',
  'beacons.visual.upsert', 'beacons.curve.set', 'beacons.simulate', 'beacons.art.generate',
  // Not a pure read: BeaconsModule::with_native attaches LeonardoClient::from_keychain
  // (cc-core/src/beacons/mod.rs:106-109), so art.status -> provider.available()
  // (cc-core/src/beacons/art.rs:37-40, cc-beacons/src/art/client.rs:108-110) reads the
  // OS keychain (cc-beacons/src/art/key.rs:63-66). The headless layer never touches it.
  'beacons.art.status',
  'maproom.design.get', 'maproom.design.upsert', 'maproom.turn.run',
  'steward.ask', 'steward.writ.seal', 'steward.writ.tear',
  'obs.connect', 'obs.source.create', 'obs.scene.ensure', 'obs.rehearsal.clear',
  // Custom design (D2): paid OpenAI calls (art.direct, art.layers) and store or overlay writes.
  'beacons.art.direct', 'beacons.art.layers', 'beacons.design.create', 'beacons.library.import',
  'gatehouse.votebar.design.set',
];

/**
 * The reviewed allowlist. Every `read` row was checked against its cc-core
 * handler for side effects (see README "Allowlist review").
 */
export const TOOLS: readonly Tool[] = [
  rpc('status.get', 'read', 'Core status: version, uptime, Twitch/OBS connection and simulated flag.',
    (e, t, p) => invoke(e, t, 'status.get', p)),
  rpc('settings.get', 'read', 'Engine settings overrides currently stored in the core.',
    (e, t, p) => invoke(e, t, 'settings.get', p)),
  rpc('auth.twitch.status', 'read', 'Twitch login state. The headless core has no Twitch login.',
    (e, t, p) => invoke(e, t, 'auth.twitch.status', p)),
  rpc('bridge.status.get', 'read', 'Twitch bridge connection status (inert in the headless core).',
    (e, t, p) => invoke(e, t, 'bridge.status.get', p)),
  rpc('obs.status.get', 'read', 'OBS connection status (always disconnected in the headless core).',
    (e, t, p) => invoke(e, t, 'obs.status.get', p)),
  rpc('gatehouse.rules.list', 'read', 'All Gatehouse moderation rules and their modes.',
    (e, t, p) => invoke(e, t, 'gatehouse.rules.list', p)),
  rpc('gatehouse.consensus.get', 'read', 'Chat consensus shares over a trailing window, with an optional filter.',
    (e, t, p) => invoke(e, t, 'gatehouse.consensus.get', p)),
  rpc('gatehouse.chat.list', 'read', 'Page of moderated chat items (post-verdict ledger), newest first.',
    (e, t, p) => invoke(e, t, 'gatehouse.chat.list', p)),
  rpc('gatehouse.history.list', 'read', 'Page of Gatehouse decisions with provenance.',
    (e, t, p) => invoke(e, t, 'gatehouse.history.list', p)),
  rpc('gatehouse.liveRun.get', 'read', 'Page of live-run decisions and whether their recordings are retained.',
    (e, t, p) => invoke(e, t, 'gatehouse.liveRun.get', p)),
  rpc('gatehouse.source.url', 'read', 'Overlay URL of the Gatehouse vote bar.',
    (e, t, p) => invoke(e, t, 'gatehouse.source.url', p)),
  rpc('lots.draw.list', 'read', 'All configured Lots draws.',
    (e, t, p) => invoke(e, t, 'lots.draw.list', p)),
  rpc('lots.draw.check', 'read', 'Pure policy check of a draw policy; reports reasons it is not allowed.',
    (e, t, p) => invoke(e, t, 'lots.draw.check', p)),
  rpc('lots.roll.lookup', 'read', 'One user\'s entry in a draw\'s current roll.',
    (e, t, p) => invoke(e, t, 'lots.roll.lookup', p)),
  rpc('lots.writ.get', 'read', 'A saved Lots cast writ by id.',
    (e, t, p) => invoke(e, t, 'lots.writ.get', p)),
  rpc('lots.source.url', 'read', 'Overlay URL of one Lots draw.',
    (e, t, p) => invoke(e, t, 'lots.source.url', p)),
  rpc('beacons.visual.list', 'read', 'All Beacons visuals.',
    (e, t, p) => invoke(e, t, 'beacons.visual.list', p)),
  rpc('beacons.contribution.list', 'read', 'Most recent Beacons contributions, newest first.',
    (e, t, p) => invoke(e, t, 'beacons.contribution.list', p)),
  rpc('beacons.source.url', 'read', 'Overlay URL of one Beacons visual.',
    (e, t, p) => invoke(e, t, 'beacons.source.url', p)),
  rpc('maproom.stage.get', 'read', 'Current Tiltyard stage session (catches up its clock-derived tally).',
    (e, t, p) => invoke(e, t, 'maproom.stage.get', p)),
  rpc('tiltyard.source.url', 'read', 'Overlay URL of the current Tiltyard card.',
    (e, t, p) => invoke(e, t, 'tiltyard.source.url', p)),
  // rehearsal.* is registered only by the rehearsal composition (Registry::with_rehearsal),
  // not by the Registry::with_status() inventory that contract parity exports
  // (crates/cc-core/src/bin/export-registry.rs). Like the desktop rehearsal port
  // (apps/desktop/src/rehearsal/rehearsal-core.ts), these rows use the contract's
  // exported per-method contracts; the core's own tests pin their registration.
  rpc('rehearsal.start', 'simulated', 'Start a dress rehearsal: SIMULATED chat only, no Twitch, no OBS.',
    (e, t, p) => invokeMethod(e, t, rehearsalStart, p)),
  rpc('rehearsal.stop', 'simulated', 'Stop the dress rehearsal and its simulated crowd.',
    (e, t, p) => invokeMethod(e, t, rehearsalStop, p)),
  rpc('rehearsal.scenario.run', 'simulated',
    'Run one generated scenario: lots_fill, vote_round, beacon_fire (visual_id) or duel_round.',
    (e, t, p) => invokeMethod(e, t, rehearsalScenarioRun, p)),
  rpc('rehearsal.crowd.set', 'simulated', 'Set the simulated crowd rate in messages per minute (0..600).',
    (e, t, p) => invokeMethod(e, t, rehearsalCrowdSet, p)),
  local('events.since', 'Core stream events (seq, at, kind) after since_seq (default 0: whole retained window).', {
    type: 'object',
    properties: { since_seq: { type: 'integer', minimum: 0 } },
    additionalProperties: false,
  }),
  local('overlay.snapshot', 'First overlay push frame for beacons (needs visual_id), gatehouse or tiltyard.', {
    type: 'object',
    properties: {
      kind: { enum: ['beacons', 'gatehouse', 'tiltyard'] },
      visual_id: { type: 'string', minLength: 1 },
    },
    required: ['kind'],
    additionalProperties: false,
  }),
];

/** Accepts the underscored tool name or the dotted method name. */
export function findTool(name: string): Tool | undefined {
  return TOOLS.find(tool => tool.name === name || tool.method === name);
}

export class UnknownToolError extends Error {
  readonly tool: string;
  constructor(tool: string) {
    super(`Unknown tool: ${tool}`);
    this.tool = tool;
  }
}
