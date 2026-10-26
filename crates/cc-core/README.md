# Local core service

Construct `AppState::new(Registry::with_status(), capacity)` in the native shell,
hand its per-launch `session_token()` only to that shell, then call `bind` with
`127.0.0.1:<port>` (zero chooses a free port). Every other address is refused.
The returned server future runs until `AppState::shutdown()`; event sessions
also close. Tokens are generated from 32 random bytes, never served or logged.

POST `/rpc` carries `Authorization: Bearer <session>` and a JSON body such as
`{"method":"status.get","params":{}}`. Success is the method's typed result;
failure is `{code,message,retry_after_ms?,detail?}` with omitted optional keys.
Module handlers receive generated request variants; results are validated at
the same contract door before serialization. `Registry::with_status()` registers
the native method inventory without starting adapters; its status is disconnected
and adapter calls return unavailable. For a configured app, create
`NativeServices::new(NativeConfig, Store, LoginPresenter).await`, retain it, then
call `services.app(capacity)` and `bind`. It wires the Twitch bridge and OBS into
that registry and the same event hub used by `/events`. Call `shutdown` when
closing the app. The bridge owns its credential broker and revocation calls
`Store::purge_all`; no bearer credential crosses the module boundary.

WP 0.7 registers `bridge.status.get`, `auth.twitch.start/status/revoke`,
`obs.status.get` and `obs.source.create`, besides `status.get`. Device challenges
go to the supplied native `LoginPresenter`, never the RPC result or logs. The
provided Windows presenter opens Twitch and displays the code in a native dialog
through a fixed helper script with JSON on stdin. Other platforms must inject
their native presenter. Optional auth user_id is absent because the current
bridge API does not expose that identity; confirmed requested scopes are shown
only after the bridge connects. Stream and Gatehouse summaries stay absent until
their authoritative sources are available.

Bridge changes are sampled every 100 ms; `bridge.status.get` returns the current
state and the latest recorded gap. Gaps publish `bridge.gap`; chat notifications
publish `chat.message` without message bodies. M0 uses a labelled shadow/pass
stub; M1 owns the real verdict pipeline. OBS is probed with GetVersion every two
seconds and publishes `obs.status` changes. Source creation accepts only the
owned overlay URL from `services.overlay_url()`; hand that URL to the native
shell rather than accepting another localhost service or an arbitrary website.
The overlay has its own port and read-only router, never core's RPC origin.

The operator-only command is `cargo run -p cc-core --features spike --bin spike
-- ...`; its target login is mandatory. Default builds expose no fault hook.
See [the live-run template](../../../docs/spike-log.md) for the exact command,
owner preparation, sanitized evidence format and pending live acceptance items.

GET `/events?since_seq=<last applied seq>` upgrades to a WebSocket with the same
authorization. A native client uses the header. A browser supplies protocols
`cc-events` and `cc-session.<session>`; only `cc-events` is echoed. Session tokens
never go in a URL. Only exact Tauri origins are accepted; localhost browser
sources and arbitrary websites are refused even when they supply a capability.
The native shell owns HTTP transport; no overlay route is exposed by this router.

Every event has `seq`, UTC `at` and a closed `kind`. Without a cursor a client
starts at the current head. A valid retained cursor gets every later event in
order before live events; an expired cursor or a cursor ahead of this launch
gets one `resync` at the current head, then live events. Clients refetch reads
on invalidation and refetch all reads after resync. The bounded buffer is not a
durable log across process launches. Slow writers have a five-second ceiling.

Register modules through `Module`/`Registry::register`; empty, duplicate and
undeclared registrations fail atomically. `export-registry` instantiates that
registry for the method parity gate. Tests use generated simulated values and
real local HTTP/WebSocket connections, with no Twitch/OBS calls.

## Offline lots module (WP 2.1/2.2)

`cc_core::lots::LotsModule` implements exactly the seven declared `lots.*`
methods. It is exported but **not registered** by any native constructor,
router, desktop integration or live adapter. Tests alone construct it and call
`Registry::default().register(module)`. Production wiring waits for the live
spike and a separate delivery.

Construct it with a caller-owned root, `Arc<EventHub>`, an injected
`BeaconSource`, a `LotsClock`, and an explicit simulated-data flag. No beacon
HTTP implementation is provided. The source supplies trusted chain metadata and
an already-recorded round; `cc-lots`/`cc-verify` enforce the selected round,
signature, seal and winner derivation. Streamer fallback seeds are generated
inside the module, committed at seal, and revealed only in the verified writ.
Clients cannot supply entries, winners, seeds or replacement proof inputs.

The future trusted post-verdict adapter must call `map_user` with verified
Twitch identity and `intake(draw_id, PassedMessage)`; nothing feeds it today.
`PassedMessage` has no constructor that skips the pass-verdict check. The
identity mapping is needed for cc-store's viewer-associated writ persistence
and forget operation. No fake login is inferred from a numeric ID or chat text.

The root contains an atomically replaced `draws.json` configuration snapshot
and a `store/` owned by cc-store. Writs associate **all** proof participants,
not just winners, with cc-store's existing Writs inventory. Draw seal/cast
audits are appended by the domain before results escape. Writs, successful
cast responses and configurations survive reopening. Cooldowns are rebuilt
from seal/cast audits, including after reconfiguration. Configuration changes
clear open entries; changes to a currently sealed draw are refused. Open pools
and unfinished sealed attempts are memory-only and cannot be resumed after a
restart; the old run ID never becomes castable again. Failed cast attempts are
consumed. A completed cast retry returns the same stored result without new
randomness or duplicate events. No risk-acknowledgement RPC exists, so a blocked
policy cannot be unlocked through this module.
The proof core requires whole-second seal times: the snapshot uses the most
recent whole UTC second; later subsecond entries are outside that snapshot.
Roll lookups use the full service time rather than truncating it.

`EventHub` continues to emit only the existing `EventKind` invalidations.
`module.subscribe()` is a separate internal broadcast sink carrying existing
`LotsEventPayload` values. It binds `lots.roll` to weight tables, `lots.sealed`
to `RollSealResult`, and `lots.cast` to `CastResult`. It is bounded at 256
notifications; subscribers must handle explicit lag errors. It is not a wire
contract or durable ledger. Sending these payloads over `/events` requires a
later contract-first delivery.

Offline acceptance evidence lives in `tests/lots.rs` and its simulated helper.
Run `cargo test -p cc-core --test lots`. Tests dispatch through test-local
registries, run `validate_result`, independently verify both writ sources, use
recorded public quicknet round 2, reject a corrupted signature, preserve
cooldowns across reopen, exercise cc-store erasure, and dispatch all seven
methods against both native constructors to prove they remain unavailable.

Validation for this delivery (2026-10-26):

- `cargo test -p cc-core --test lots`: all six acceptance tests passed. The
  initial run caught UTC timestamps emitted as `+00:00` instead of the
  contract's `Z`; the projection was fixed and the tests passed.
- `cargo fmt --all -- --check`, workspace Clippy with `--all-targets -- -D
  warnings`, and `cargo test --workspace` passed. The latter includes the new
  compile-fail raw-message intake example and the existing 1,000-draw proof test.
  Owner-only live tests stayed ignored.
- Contract drift and parity passed with fresh Rust exports supplied via the
  scripts' existing `--schema` and `--registry` input options. Native exports
  remain seven methods, with all lots methods unregistered; all 16 event kinds
  agree. Boundaries, hygiene, file-cap and secrets checks also passed.
- `pnpm --config.verify-deps-before-run=false gate` passed its 14 tooling tests
  and workspace inventories, then failed at `spawnSync cargo EPERM` in the
  unchanged exporter. Recursive pnpm typecheck and lint independently failed
  at lifecycle child spawning with `spawn EPERM`. The same failures are already
  recorded in the base `docs/PLAN.md`. The full pnpm gate is **not** claimed
  green; App Master must rerun it and the frontend build outside this process
  restriction. No installation or junction modification was attempted.
