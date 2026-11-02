# @castle-control/headless

Developer-only headless layer. It drives a rehearsal-only Castle Control core
without the UI. Everything here is SIMULATED: the core has no Twitch login, no
OBS connection and an isolated data root, and no armed method is reachable.

One reviewed tool table (`src/tools.ts`) backs three surfaces:

- the library (`startCore()` → `Session`),
- the `cc` CLI,
- the stdio MCP server (see below).

## Library

```ts
import { startCore } from '@castle-control/headless';

const session = await startCore();            // builds cc-headless with cargo unless exe / CC_HEADLESS_EXE
await session.call('rehearsal_start');
await session.call('rehearsal.crowd.set', { per_minute: 120 });
await session.call('rehearsal_scenario_run', { scenario: 'vote_round' });
const { events } = await session.eventsSince(0);
const bar = await session.overlaySnapshot('gatehouse');
await session.close();                        // closes core stdin; removes the temp data root
```

- `startCore({ exe?, dataRoot?, launcherArgs?, diagnostics? })`. Without `exe`
  it uses env `CC_HEADLESS_EXE`, otherwise
  `cargo build --locked -p cc-core --bin cc-headless` and the executable from
  cargo's compiler-artifact message. Without `dataRoot` a fresh `cc-headless-*`
  directory is made under the OS temp dir and removed on close. A given
  `dataRoot` is kept.
- `call(tool, args)` accepts the underscored name or the dotted method. It
  returns `{ ok: true, result }` or `{ ok: false, error }`, where `error` is a
  contract `ErrorEnvelope`. Params, results and errors are parsed by
  `@castle-control/contract`. An unknown or armed tool throws `UnknownToolError`.
- `eventsSince(seq = 0)` reads `GET /events` over a WebSocket. It sends the
  subprotocols `cc-events` and `cc-session.<token>` and no Origin header, and
  returns what arrives before the stream goes quiet.
- `overlaySnapshot(kind, visualId?)` returns the first SSE frame of
  `/push/{beacons|gatehouse|tiltyard}`, parsed by the contract overlay parser.
  Beacons needs a `visual_id`.

The session token never leaves the process. The core's stdout and stderr are
drained and never forwarded. `uiHandoff()` exists only so an in-process UI can
attach to the same core (for the one-time e2e). Never print its result.

## CLI

```sh
pnpm -C packages/headless cc tools
pnpm -C packages/headless cc call status_get
pnpm -C packages/headless cc call rehearsal_crowd_set '{"per_minute":120}'
pnpm -C packages/headless cc run steps.jsonl      # or `run -` for stdin
pnpm -C packages/headless cc repl
```

Global options: `--exe <path>` and `--data-root <dir>`. A `run` script has one
`{"tool": "...", "args": {...}}` per line. The whole script is checked before
the core starts. Output is one NDJSON line `{tool, ok, result|error}` per step.

Exit codes: `0` ok, `1` at least one error envelope, `2` usage (unknown tool,
bad JSON, bad script), `3` core launch failure.

The `cc` bin (`src/cc.mjs`) runs the TypeScript sources on plain Node 24. Its
resolve hook retries a relative `./x.js` import as `./x.ts`, and only when the
`.js` file is missing.

## Tools

| class | tools |
| --- | --- |
| read | status, settings, auth.twitch.status, bridge/obs status, gatehouse rules/consensus/chat/history/liveRun/source.url, lots draw.list/draw.check/roll.lookup/writ.get/source.url, beacons visual.list/contribution.list/source.url, maproom.stage.get, tiltyard.source.url |
| simulated | rehearsal.start/stop/scenario.run/crowd.set |
| local | events.since `{since_seq?}`, overlay.snapshot `{kind, visual_id?}` |

Each tool's `inputSchema` is its params schema from the generated
`contract.schema.json`. Each read row carries its own literal
`invoke(…, '<method>', …)` call, so contract parity proves that method is
registered in the core. The four `rehearsal.*` rows are registered only by the
rehearsal composition, so they go through the contract's exported method
contracts (`invokeMethod`), the same door the desktop rehearsal port uses.

### Allowlist review

A test pins the allowlist and `ARMED` as a partition of `RPC_METHODS`.
Any new contract method fails that test until someone classifies it.
Notes from reading each `read` handler in `crates/cc-core`:

- `lots.draw.check`: pure policy check (`lots/convert.rs` `check`).
- `settings.get`: a SELECT (`cc-store/src/settings.rs` `engine_settings`).
- `gatehouse.liveRun.get`, `chat.list`, `history.list`: ledger and cache
  reads. The retention cutoff uses `preview`, never the reaper.
- `gatehouse.consensus.get`: advances an in-memory chart window only.
- `maproom.stage.get`: Tiltyard `apply(None)` may persist a clock-derived
  tally catch-up and publish `maproom.turn`. The overlay push does the same.
  It is kept as a read and flagged here.
- `obs.status.get`: safe only because cc-headless configures OBS port 0 and a
  password door that refuses every read. The launcher also refuses the OBS
  mutations.
- `beacons.art.status` was **dropped and denied**. `BeaconsModule::with_native`
  attaches `LeonardoClient::from_keychain` (`cc-core/src/beacons/mod.rs:106-109`),
  and `available()` reads the OS keychain
  (`cc-beacons/src/art/client.rs:108-110`, `art/key.rs:63-66`).

## MCP server

TODO (WP3): stdio MCP server over the same `TOOLS` table, plus a client config snippet.
