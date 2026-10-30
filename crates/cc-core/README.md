# Local core service

## Native Steward and engine settings (WP 1.4)

The desktop's `--steward-live` opts its native composition into the Steward.
Startup succeeds with incomplete engine settings; `steward.ask` returns the
existing `unavailable` envelope naming only the missing `engine.*` keys.
`Engine::from_settings` requires only the selected CLI provider's executable
and model, plus the posture helper for Codex. No executable or model is inferred.
Without the flag, and in offline/fixture composition, the response remains
`no Steward engine is configured`.

Each ask constructs its engine lazily from the persisted settings in the same
native Store Arc used by SettingsModule and revocation/purge. A successful
`settings.set` therefore applies to the next ask without restart; failed writes
leave the persisted configuration untouched. The Store lock serializes complete
Steward operations on a blocking worker, including engine auditing, writ storage
and purge; the per-ask CLI admission cap remains one across engine rebuilds.
Executable/helper paths never come from an ask or an environment variable, and
errors never include configured values. Spawn control is a sibling directory
of the native Store, outside its data inventory.

For now the native vault is `NoKeychain`: subscription CLI lanes need no secret;
a lane requiring a secret fails with `Failure::Auth` and is unavailable to the
Steward. Wiring a native engine keychain is a separate decision for the owner.
No keychain dependency or credential-label convention is introduced here.

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
the native method inventory plus the fixture-only Lots and Gatehouse methods,
without starting adapters; its status is disconnected and native adapter calls
return unavailable. For an explicitly configured native app, create
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
owned spike URL from `services.overlay_url()`, or the exact accepted per-visual
URL from `beacons.source.url`, including its verified package-hash query;
another localhost service, stale hash or arbitrary path is refused.
The overlay has its own port and read-only router, never core's RPC origin.

## WP 3.2 accepted overlay state

`NativeServices` owns `RenderHost` and mounts its GET/HEAD-only render routes on
the `cc-obs` overlay listener: `/beacons/{visual_id}`, `/bundle.js`, verified
`/assets/{visual_id}/{hash}/{path}`, and read-only `/push/beacons?visual_id=...`.
No route, script, response or push payload receives a control capability.
`beacons.render.snapshot` carries the existing `BeaconsRenderSnapshot` contract.
Each event replaces the whole accepted state; watch slots coalesce slow clients
and return the latest accepted state on reconnect. A visual naming an unverified
design emits nothing until package verification. The transparent, empty scene
is the neutral placeholder for a visual with no design.

The Beacons module validates render capacity/metadata before saving, then hands
the committed visual to `NativeServices` under the same render-state lock.
An unchanged curve preserves the latest accepted intensity. Changed curves
recompute the empty contribution total in the current configuration-only
registration; this delivery adds no live contribution intake. Native engines
can hand over subsequent `BeaconsIntensity` values through
`accept_beacons_intensity`. `beacons.simulate` remains isolated.

`accept_beacons_package(package, root, consent)` is a trusted native import door,
not a new RPC. It parses the merged schema, verifies local assets/content hash,
checks initial or widened script privileges, then atomically updates affected
visuals. Consent is not inferred from package declarations. Assets are captured
in immutable memory; modifying the source file later has no effect until a new
hash-verified import. Restart drops imports/consent and requires reverification.
The host supports the fixed `embers` particle preset and rejects unknown presets.
Limits and script-origin custody are documented in `docs/SECURITY.md`.

### Package content identity v1

`overlay::package::package_hash` is the native importer/verifier's shared hash
implementation. Start with ASCII `castle-control-design-v1` plus one NUL byte.
Append one framed canonical metadata value: serialize the parsed package to a
serde_json Value, remove `content_hash`, sort object keys recursively (the
workspace's default serde_json maps are ordered), and serialize compact UTF-8.
Preserve array order and serde_json's numeric representation. Then append, in
ascending ASCII path order, a framed path and framed raw bytes for every
distinct declared image/script asset. A frame is an unsigned 64-bit big-endian
byte length followed by exactly those bytes. The content identity is the
lowercase hexadecimal SHA-256 of the result. This is a versioned local package
format, not a claim of RFC 8785 interoperability. Undeclared files are excluded
and never served. Every resolved asset must remain inside the canonical package
root, including symlink/junction resolution. PNG/JPEG/GIF/WebP image MIME and
UTF-8 `.js` script MIME are fixed by the verifier; HTML/SVG are not served.

### Reproduction and measurement

Run the root `pnpm gate` for release verification. Focused tests:

```powershell
cargo test -p cc-core --test overlay_host --test overlay_invariants --test obs_native --locked
cargo test -p cc-obs --locked
pnpm --config.verify-deps-before-run=false --filter @castle-control/renderer test
cargo test -p cc-core --test overlay_browser --locked -- --ignored --nocapture
```

The explicit browser probe launches a disposable headless Chrome profile, never
the owner's browser. `CC_OVERLAY_CHROME` can select an installed Chrome binary.
It checks actual CSP blocking against a simulated second loopback server, local
script execution after consent, widening, latest state after reload, retained
scene nodes, and 20 accepted package plus 20 accepted curve changes. It reports
n/p50/p95/max from native handoff (curve sample includes its disk commit) through
client DOM application, computed opacity and two browser frame boundaries; it asserts max <1 s.
The Director ran `cargo test -p cc-core --test overlay_browser -- --ignored`
on 2026-10-28 on main `c3dea03`: PASS. Package changes n=20, p50 33 ms,
p95 49 ms, max 49 ms. Curve changes n=20, p50 49 ms, p95 50 ms, max 51 ms.
Budget 1000 ms. The browser was disposable headless Chrome, not OBS.
Real-browser CSP enforcement, script execution after consent, widening, reload
latest state and retained scene nodes were all checked by that passing probe.
These Director-supplied results supersede the earlier builder launch failure.
The live OBS 1 s acceptance is still pending as an owner-attended step using
the procedure below. No OBS timing figure is claimed.

For an owner-attended OBS check, set `$env:CC_OVERLAY_OBS_DEMO_SECONDS='120'` and
run that explicit browser probe. It prints the owned simulated source URL and
holds it after automated checks while importing timestamped package changes and
curve changes every second. Add that URL as an OBS Browser Source at 1280x720
on the owner's test scene (use a light background or OBS custom CSS for readable
text). The curve alternates text opacity as well as its diagnostic value.
Confirm changes appear without source refresh; record
the handoff output and OBS preview on the same recording/time base, count frames
to first displayed change, and report n/p50/p95/max and frame-rate uncertainty.
Record OBS and obs-browser versions and whether every sample met 1 s. Recreate
the source during the demo to check reconnect/latest state. Remove only that
test source afterwards and clear the environment variable. No OBS latency or
visual sign-off is claimed by the builder; the existing ignored live twins and
cleanup tests remain separate owner-run checks.

The operator-only command is `cargo run -p cc-core --features spike --bin spike
-- ...`; its target login is mandatory. Default builds expose no fault hook.
See [the live-run template](../../docs/spike-log.md) for the exact command,
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
methods. AI-7 registers it in both native constructors behind a fixture-only
wrapper. Live chat intake and live beacon wiring remain absent. Standalone
domain tests can still explicitly register a module in `Registry::default()`.

Construct it with a caller-owned root, `Arc<EventHub>`, an injected
`BeaconSource`, a `LotsClock`, and an explicit simulated-data flag. The source
supplies trusted chain metadata and a round; `cc-lots`/`cc-verify` enforce the selected round,
signature, seal and winner derivation. Streamer fallback seeds are generated
inside the module, committed at seal, and revealed only in the verified writ.
Clients cannot supply entries, winners, seeds or replacement proof inputs.

`lots::live_beacon::LiveBeacon::new(trusted_chain)` is now available for a future
WP 2.3 opt-in. It uses cc-verify's HTTPS quicknet transport (redirects off),
selected schedule and BLS verification; it is **not registered**. AI-7 still uses
`simulated: true` and `RecordedBeacon`. Its synchronous round call blocks, so
future live dispatch must use a blocking worker. Transport failure returns a
typed error without a cast or fabricated round; explicitly selecting
`streamer_commit` still works locally and is labelled `streamer-controlled`.
`tests/live_beacon.rs` uses fixture transports; its sole HTTPS test is ignored
and labelled owner-run.

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
methods through a standalone registry. The old native-unavailable guard was
replaced by AI-7's registration and no-network acceptance below.

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

## Offline gatehouse module (WP 1.1)

`cc_core::gatehouse::GatehouseModule` exports exactly the seven declared WP 1.1
methods: `gatehouse.rules.list`, `gatehouse.rules.upsert`,
`gatehouse.rules.setMode`, `gatehouse.ban.confirm`, `gatehouse.ban.dismiss`,
`gatehouse.decision.undo`, and `gatehouse.petition.resolve`. Construct it with
`GatehouseModule::open(root, Arc<dyn cc_store::Clock>)` and explicitly register
it in a standalone `Registry::default()`. The caller owns the persistence root;
the existing Gatehouse service owns `rules.json` and `store/` beneath it.

The adapter serializes calls through a `Mutex<cc_gatehouse::Gatehouse>` and
delegates the existing request types unchanged. Request parsing and response
validation use the existing contract door; service errors retain their contract
envelope. Lock poisoning and serialization failure return a sanitized internal
error. The module starts no executor, feeds no chat and publishes no events.
AI-7 additionally registers a guarded instance in both native constructors;
no live adapter or desktop invocation is added. No held/delay/shield/lease/
consensus/drill/recording methods are served here.

Offline acceptance uses `tests/gatehouse.rs` and `tests/gatehouse_support/`.
All seven methods dispatch only through a test-local registry, validate their
responses, and reject unknown fields, null/string parameters and missing
required fields with the contract error envelope. Generated simulated messages
seed pending bans through the domain service while the RPC module is dropped;
there is no added ingestion seam. Tests prove human confirm/dismiss, undo, both
petition outcomes, repeated-resolution refusal, persistence through reopening,
and an injected clock expiring review toward hold. The named
native-unavailable guard was replaced by AI-7's registration, shadow-only and
no-network acceptance below.

Validation for this delivery (2026-10-26):

- Red first: `cargo test -p cc-core --test gatehouse` failed on the missing
  module and dependency before implementation.
- `cargo test -p cc-core --test gatehouse --test lots`: five Gatehouse and six
  Lots acceptance tests passed. Initial fixture expectations were corrected to
  compare cc-store's nanosecond UTC serialization and to expect `invalid` when
  the contract rejects armed mode without an acknowledgement before dispatch.
- `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets --
  -D warnings`: passed.
- `cargo test --workspace`: passed, including documentation tests and the
  1,000-draw independent verification property. Owner-only live tests and
  explicit fixture generators remained ignored.
- `node scripts/check.mjs`: boundaries, hygiene and file-cap walked 397 files;
  secrets scanned 512 files; all passed.
- `cargo run --quiet -p cc-types --bin export-contract` and `cargo run --quiet
  -p cc-core --bin export-registry` produced fresh JSON outside the worktree.
  `node packages/contract/scripts/check.mjs --schema <export>` passed (seven
  generated and committed files). `node packages/contract/scripts/parity.mjs
  --schema <export> --registry <export>` passed: 45 declared methods, seven
  registered native methods, 38 unregistered, and all 16 event kinds mirrored.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  build`: passed, including the first-load budget (389655/393216 bytes).
- `pnpm --config.verify-deps-before-run=false gate`: 14 tooling tests and
  workspace inventories passed, then the unchanged exporter failed with
  `spawnSync cargo EPERM`. Recursive `-r typecheck`, `-r lint` and `-r test`
  each failed with lifecycle `spawn EPERM`. These process restrictions are
  already recorded in base `docs/PLAN.md`; no full pnpm pass is claimed.
  App Master must rerun those gates in its verification environment. No install
  or node_modules junction modification was attempted.

Historical contract note:
The earlier `Empty` array-parameter issue was corrected in cc-types before
AI-7's base. No cc-types changes are included here.

## AI-7 fixture-first native registration (2026-10-27)

The operator's standup authorizes offline registration ahead of the live spike.
Both `Registry::with_status()` and `Registry::with_native(services)` now register
the seven existing Lots and seven WP 1.1 Gatehouse methods beside the seven
native status/auth/OBS methods: **21 registered methods**, all already declared
in cc-types. The other declared methods remain unavailable. `export-registry`
reports that actual inventory without opening a store, socket or credential.
No schema, migration, identifier or desktop invocation changes are included.
No spike item is marked done.

Registration uses lazy wrappers around `LotsModule` and `GatehouseModule`.
First offline dispatch creates an isolated temporary fixture root with separate
`lots/` and `gatehouse/` namespaces; it never reuses the native credential or
viewer-data store. `tempfile` was already locked as a test dependency; it is
now also a runtime dependency for these automatically cleaned fixture roots.
For caller-owned persistent simulated state, use
`Registry::with_fixture_root(root, events)` and pass the same `Arc<EventHub>`
to `AppState::with_events`. That constructor surfaces persistence errors.
Default initialization errors are cached and returned as contract errors.
`AppState` binds its authoritative invalidation hub before any offline dispatch;
attempting to rebind an already-used registry to another hub returns conflict.

Lots always uses `simulated: true`, public recorded quicknet round 2, and the
fixed fixture clock `2023-08-23T15:09:28Z`. The chain, signature and randomness
in `src/lots/recorded.rs` match `cc-verify/tests/fixtures/drand-quicknet/`.
Seal with `drand_quicknet` and `margin_s: 1` selects that round. Other schedules
are verified against the same recording and fail if it does not match; they
never trigger a fetch. The independent verifier still checks the real BLS
signature and recomputes winners. The `streamer_commit` fallback remains local.
`Registry::simulated_lots()` exposes the existing Rust-only, verdict-checked
intake for generated fixtures. No RPC admits entries, no sample pool is silently
seeded, and no bridge subscription feeds either module. Default state disappears
when its registry and outstanding intake handles drop. The fixed clock means
this is a fixture workflow, not a real-time draw service or live cooldown test.

Gatehouse starts no classifier, executor, chat adapter or background task.
Registered upsert/setMode calls reject armed mode even with acknowledgement;
reopening a fixture root containing an armed user rule is also refused.
The existing mandatory crisis-care rail remains fixed in the domain's armed
hold/human-handoff configuration; no executor consumes it. Ban review, undo and
petition methods operate only on local domain state, with not_found for absent
decisions. No ban, timeout or announcement can leave this registration. Existing
explicitly configured `NativeServices` behavior is unchanged and remains a
separate opt-in path; offline module registration never creates those services.
This delivery adds **no live source, CC_LIVE_* switch or credential access**.
Setting any live flag does not upgrade these fixture modules.

Acceptance is in `tests/offline_registration.rs` and `tests/offline_support/`:

- The actual exporter process lists all 21 registered methods and every name
  belongs to `RpcRequest::NAMES`. The existing native integration test checks
  the same inventory through `services.app`.
- Default native and caller-root registries run upsert/check/seal/cast/writ
  against recorded round 2; the writ independently verifies. Invalidations go
  to the app's hub and saved writs retain `simulated: true` across reopening.
- Gatehouse list/upsert/setMode persist under a temporary caller root, including
  the mode-change audit. Arming requests and previously armed user rules fail.
- With all CC_LIVE_* unset, workflows run on a Tokio runtime with no I/O driver.
  Windows TCP/UDP owner tables (IPv4 and IPv6) contain no endpoints owned by the
  dedicated test process before or after the workflows. Linux checks its file
  descriptors; other platforms use a read-only lsof check. Existing transport
  and mock-adapter tests separately use local sockets intentionally.

AI-7 validation (2026-10-27):

- `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets --
  -D warnings` passed. `cargo test --workspace` passed, including all 35 cc-core
  tests, desktop host tests, the 1,000-draw independent-verification property and
  every doc-test (including cc-core's raw-intake compile-fail example).
  Owner-only live tests and explicit fixture generators stayed ignored.
- The initial offline acceptance run exposed an incorrect empty-rules fixture
  expectation. The existing mandatory crisis-care rail was preserved and the
  expectation corrected. Final offline acceptance passes all three tests.
- Fresh Rust exports saved outside the worktree passed the existing contract
  check/parity scripts using their supported `--schema` and `--registry` inputs:
  seven generated/committed artifacts; 45 declared methods; 21 registered; 24
  unregistered; zero desktop invocations; all 16 event kinds matched.
- `node scripts/check.mjs` passed: boundaries, hygiene and file cap walked 476
  files; the final secrets scan walked 603 files. `git diff --check` passed.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  build` passed, including its 381433/393216-byte first-load budget.
- The exact `pnpm --config.verify-deps-before-run=false gate` command passed
  14 tooling tests and workspace inventories, then failed at `spawnSync cargo
  EPERM` in the unchanged exporter. Recursive `-r typecheck`, `-r lint` and
  `-r test` each failed at lifecycle child spawning with `spawn EPERM`.
  The exporter/runner files are unchanged from base `45e8e76`; the same process
  restriction is already recorded in base `docs/PLAN.md`. The full Node gate is
  **not green**. App Master must rerun those commands in its verification
  environment. No install, junction modification or sandbox bypass was attempted.

## Beacons source URL (WP 3.2 slice)

Historical record of the earlier URL-only slice. The WP 3.2 accepted overlay
state section above supersedes the placeholder, CSP and pending-work statements
in this record; its validation results are retained as delivery history.

All registry constructors register `beacons.source.url` alongside the four
Beacons configuration/preview methods. It uses the same visual map as
`beacons.visual.list/upsert`: an unknown `visual_id` returns `not_found`.
`Registry::with_status()` and `with_fixture_root()` stay socket-free; a known
visual returns `unavailable` because those constructors own no overlay server.
With native services, registry construction supplies only the server-owned
overlay origin to that same Beacons state. No bridge or OBS connection is needed.

For a known visual, the result is the existing `SourceUrlResult`, containing a
canonical `http://localhost:<overlay-port>/beacons/<visual-id>`. Both the origin
and path are built by the server from its bound port and the schema-checked ID.
No caller URL, credential, session token, query or fragment enters the result.
This is a different port from core. GET serves a deliberately blank transparent
placeholder titled "Castle Control Beacons (rendering unavailable)". The route
does not load visual data or reflect the path; unknown HTTP path IDs therefore
serve the same public placeholder, while the RPC enforces visual existence.
POST is refused; the existing exact-host check and CSP are unchanged: inline
styles only, no scripts, connections, images or remote resources. Neither
`/rpc` nor `/events` exists on this origin, including beneath a visual path.

This slice proves URL delivery and the no-remote-resource/origin-isolation
portion of WP 3.2 acceptance only. It does **not** display a design package.
Still pending: the package interpreter and shared OBS/Extension host bundle,
verified package/asset hashing and confined local asset loading, script privilege
consent, live intensity delivery, subsecond updates, and unchanged-intensity DOM
reuse. `obs.source.create` still accepts only the existing root connection-test
URL; accepting per-visual sources with verified-hash cache busting remains with
that rendering work. This delivery changes no contract identifier or export.

Evidence: `tests/beacons_offline.rs` checks registration and offline errors;
`tests/offline_registration.rs` exercises these errors with no I/O driver and
the OS socket inventory; `tests/obs_native.rs` dispatches authenticated HTTP RPC,
validates the typed URL, excludes the real per-launch session token, rejects
untrusted URL/path input and checks overlay GET/POST route isolation.
`cc-obs/tests/overlay.rs` checks the placeholder's exact inherited CSP, lack of
remote-resource references, read-only behavior and a captured-log sentinel grep.

Validation on the approved delivery scope:

- Red first: the native HTTP test failed because `beacons.source.url` was
  unregistered; the offline error test received `unavailable` rather than
  `not_found`. After implementation, all 15 cc-core tests across
  `beacons_offline`, `native`, `offline_registration` and `obs_native` passed,
  and all four cc-obs overlay tests passed.
- Rust format and workspace Clippy (`--all-targets -- -D warnings`) passed.
  Tooling ESLint, boundaries, hygiene, file-cap and secret scanning passed.
  The desktop production build passed at 382338/393216 first-load bytes.
- `cargo test --workspace` passed every cc-core test, then failed in unchanged
  `cc-engine/tests/lifecycle.rs:75` at
  `silence_timeout_reaps_child_and_releases_the_process_permit` (expected
  `model`, received `refused`). The same case passed when rerun alone with
  `cargo test -p cc-engine --test lifecycle
  silence_timeout_reaps_child_and_releases_the_process_permit -- --exact`.
  `git diff HEAD -- crates/cc-engine` is empty. This suggests a timing-sensitive
  failure, but the workspace run remains failed; no unrelated fix or full-suite
  rerun was attempted.
- The verifier's computed source fingerprint matches the committed HTML;
  contract exports are unchanged, so no regeneration is needed.
- The exact full `pnpm --config.verify-deps-before-run=false gate` command
  passed 14 tooling tests and inventories, then failed at `spawnSync cargo
  EPERM` in the unchanged contract exporter. Recursive pnpm typecheck, lint and
  tests each failed at lifecycle `spawn EPERM`. These restrictions are already
  documented in base `docs/PLAN.md`; no full-gate pass is claimed. App Master
  must rerun the full gate in its verification environment. No installation,
  junction modification, git write or sandbox bypass was attempted.

## WP 3.4 art

Credit-priced Leonardo calls use the existing ArtCredits ledger; the receipt-shape decision is parked for the owner: A, ImageProviderCost amount becomes a Credits-or-MicroUsd enum with a read-compatible migration; B, a second ledger variant for dollar-only receipts; C, keep remove-bg out of the product; remove-bg returns Unavailable until the owner rules.
