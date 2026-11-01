# cc-obs wire checks

## Wire assumptions

- **Hello / Identify:** OBS websocket v5 uses text JSON `{op,d}` at
  `ws://127.0.0.1:<port>` (spike: `4455`). Hello is op `0`, with integer
  `rpcVersion >= 1`. Identify is op `1`, requests RPC `1` and
  `eventSubscriptions: 0`. Identified must be op `2` with
  `negotiatedRpcVersion: 1`. Unknown Hello fields are ignored. No-auth Hello
  omits authentication, and the client never reads the keychain in that case.
- **Authentication:** `base64(SHA256(base64(SHA256(password + salt)) + challenge))`,
  using UTF-8 bytes and standard padded base64. The OS keychain service is
  `castlecontrol-obs`; the native configured label defaults to `streamer`, while
  the guarded live-test label remains `local-obs`. D3a also accepts an authenticated
  RPC password into zeroized in-memory reconnect state; `remember` additionally
  writes that configured keychain entry, only after a successful probe.
  The simulated independent vector lives in `tests/simulated/mod.rs`.
- **GetVersion / correlation:** requests are op `6` with `requestType`,
  `requestId` (`cc-1`, `cc-2`, ...), and `requestData`. Responses are op `7`;
  both ID and type must match. Unrelated IDs and op `5` events are skipped.
  Version data requires `obsVersion`, `obsWebSocketVersion`, `rpcVersion: 1`
  and `availableRequests`. Requests serialize through exclusive mutable access.
- **CreateInput:** `sceneName`, `inputName`, `inputKind: browser_source`,
  `sceneItemEnabled: true`; `inputSettings` has `url`, `width`, `height`,
  `is_local_file: false`, `shutdown: false`. The URL must be an HTTP
  `localhost:<nonzero-port>/` spike root, or a canonical
  `/beacons/<visual-slug>` with an optional exact `package_hash=<64 lowercase hex>`
  query, plus the optional display-only `scale` and `anchor` keys (and, on
  `/lots/<draw-slug>` pages only, `shape`), without
  credentials. Their values are forwarded unchanged and interpreted only by
  the overlay entry (including invalid-value fallback); unknown query keys and
  duplicate package hashes are refused. NativeServices additionally checks the owned
  origin and current accepted visual/hash; syntax alone grants no source. Dimensions are
  1..8192 and names must be nonblank. The expected OBS response data contains
  `sceneItemId` and `inputUuid`, both parsed into `CreatedInput`. Native creation
  records them together with scene/source names in the ownership ledger. The live twin
  reads back the production-created input, then independently recreates it to
  inspect the actual response fields and matching scene item.
- **Scene:** the spike defaults to an existing scene named exactly `Scene`.
  The cc-obs live twins accept `CC_LIVE_OBS_SCENE` to select another existing
  scene. The original source API still forwards caller-supplied scene names.
  D3a's explicit ensure operation lists scenes, creates only an absent scene and
  records only scenes it created. It never changes the program scene.
- **Status / errors:** success requires BOTH `result: true` AND `code: 100`.
  Every other status becomes fixed `Error::Rejected`; peer comments are never
  surfaced. Malformed/mismatched protocol becomes `Protocol`, socket closure or
  IO failure `Transport`, unavailable password `Keychain`, invalid config/source
  `Invalid`, elapsed five-second handshake/request budget `Timeout`. Specific
  OBS failure codes introduce no separate product errors. Cleanup alone maps
  ItemNotFound (600) to adapter `Missing`; all other rejections are unchanged. Fixtures use
  synthetic 500/600 rejection examples, not a claim about a live server's code.
- **Reconnect:** no automatic reconnect, retry, input replay, or background
  resubscribe exists. After socket failure the caller must construct a fresh
  client, repeat Hello/Identify and issue a new request. The fixture closes the
  peer; the live twin closes only its own connection and opens a fresh one,
  without restarting OBS or disrupting another client's socket. D3a's native
  `Connection` wrapper retains the successful RPC endpoint and zeroized credential
  for subsequent probes and source calls; it reconnects after a failed operation
  without replaying mutations.
- **Overlay:** the spike's separate page is `http://localhost:17891/`, bound to
  IPv4 loopback. Only the exact `localhost:<port>` Host is allowed (else 403).
  Root is GET/HEAD only (POST 405); `/rpc` and `/events` are absent (GET/POST
  404). The static page declares `html, body { background: transparent; margin: 0; }`
  in an inline style. A small rounded, padded plate uses white system-font text
  with a dark shadow over a semi-transparent dark background; outside it remains
  transparent. WP 3.2 CSP permits external same-origin scripts, images from
  self/data, nonce-less inline styles, and only the exact HTTP push endpoint
  on this bound port; all other classes default to none. It retains nosniff,
  no-store and the exact Host check across every route and error. Drop stops the
  server. Fixtures choose an ephemeral port; live tests reserve 17891 and do not
  attach to another server.

### WP 0.7 OBS styling exception

OBS injects source-configurable CSS through a `<style>` without a nonce in
[`BrowserClient::OnLoadEnd`](https://github.com/obsproject/obs-browser/blob/master/browser-client.cpp#L609-L625)
(checked 2026-10-27). The page cannot attach a nonce to that injected element,
and a fixed hash would depend on the exact source's custom CSS. The scoped
exception is therefore `style-src 'unsafe-inline'`, without `'self'`, host or
scheme sources. Remote styles, CSS imports/images/fonts, scripts, connections
and frames remained blocked at that stage. WP 3.2 now permits the local renderer,
verified local raster images and the single SSE endpoint under ADR 0002;
inline/eval scripts and remote resources remain blocked. Explicit page
transparency also works outside OBS.

`simulated_overlay_csp_matches_adr_exactly` checks the byte-identical bound-port CSP
header and exact directive/source sets;
`simulated_overlay_declares_transparent_background` checks transparency, the
visible plate and absence of scripts, imports, URLs and remote hosts. The
original CSP/transparency assertions failed against the original overlay
before the fix; the existing Host/method/isolated-origin checks remain intact.

## Live flip

All normal tests are **FIXTURE / simulated** evidence. Every LIVE twin is marked
`#[ignore = "live: CC_LIVE_OBS=1"]` and guards before any keychain, socket or
overlay access. Nothing here authorizes or records a live run today.

Owner prerequisites: enable OBS websocket v5 on **127.0.0.1:4455**, create
`Scene`, and provision `castlecontrol-obs` / `local-obs` through a trusted
credential UI if authentication is enabled. Never pass a password in an
environment variable, argument, fixture or log. With authentication disabled,
other live twins work without a keychain read; `live_auth_vector` deliberately
fails as **untested** until auth is enabled, rather than claiming vector proof.

Switch OBS to scene `Scene` (or set `CC_LIVE_OBS_SCENE` for the cc-obs live twins)
before the visual check. The live roundtrip asks `GetCurrentProgramScene` and
prints the source and program scenes with a switch reminder if they differ.
A mismatch does not fail the test; the test never switches the operator's scene.

Run one named test at a time. The table uses POSIX environment-prefix notation;
in PowerShell set `$env:CC_LIVE_OBS='1'` **only for an owner-authorized run**,
run the `cargo test` portion, then `Remove-Item Env:CC_LIVE_OBS` in `finally`.
These are instructions, not commands executed by the builder.

| Assumption | Fixture test (simulated) | Live test | Exact command |
| --- | --- | --- | --- |
| Hello / Identify, RPC 1, no-auth | `simulated_handshake_rpc_versions` | `live_handshake_rpc_versions` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_handshake_rpc_versions` |
| SHA256/base64 auth | `simulated_auth_vector` | `live_auth_vector` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_auth_vector` |
| GetVersion correlation | `recorded_simulated_hello_authenticates_then_correlates_get_version`, `simulated_get_version_requires_rpc_one` | `live_get_version_correlation` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_get_version_correlation` |
| CreateInput request/response | `create_input_has_browser_source_shape_and_rejects_unsafe_origins` | `live_create_input_shape` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_create_input_shape` |
| Existing `Scene` | `simulated_scene_is_caller_supplied` | `live_scene_exists` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_scene_exists` |
| Status/error mapping | `simulated_status_codes`, `wrong_response_type_is_rejected_even_when_request_id_matches`, `log_grep_excludes_password_and_token_even_from_hostile_error_comments` | `live_status_codes` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_status_codes` |
| Explicit reconnect | `simulated_reconnect_is_explicit` | `live_reconnect_is_explicit` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_reconnect_is_explicit` |
| Overlay origin / 17891 | `simulated_overlay_origin` | `live_overlay_17891` | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_overlay_17891` |
| Overlay pixels / CSP regression | `simulated_overlay_csp_only_allows_inline_styles`, `simulated_overlay_declares_transparent_background`, `simulated_screenshot_checks_pixels_and_rejects_invalid_frames` | `live_overlay_screenshot_not_white` | `CC_LIVE_OBS=1 cargo test -p cc-obs --test live live_overlay_screenshot_not_white -- --ignored --nocapture` |

Live OBS websocket targets are hardcoded to `127.0.0.1:4455`; overlay HTTP probes
use `127.0.0.1:17891` with the required localhost Host and proxies disabled.
Browser-source checks use a `cc-live-<pid>-<run-id>` input name. Shared cleanup
enumerates scenes and removes matching scene items before `RemoveInput` (OBS 33
can retain an input while it is placed). If scene enumeration is unavailable,
cleanup uses `CC_LIVE_OBS_SCENE`, defaulting to `Scene`. It runs even after an
assertion or uncertain creation, then polls `GetInputList` every 100 ms for up
to 3 seconds; an already absent input is clean. Cleanup failure names the run's
input, fails the test and requires owner inspection;
process termination or an unreachable OBS can prevent cleanup. No other inputs,
scene settings, RPC registrations or core services are changed.

The screenshot check cleanly skips before any access unless `CC_LIVE_OBS=1`.
When enabled, it uses the existing guarded connection and keychain label,
creates its own source, calls `GetSourceScreenshot` with BMP (required in
`GetVersion.supportedImageFormats`), and checks decoded pixels rather than
encoded bytes. It waits one second before each of up to ten captures, so an
all-white frame fails after the retry window. Images stay in memory. Its
synthetic decoder test rejects all-white, truncated and compressed frames.
Fully transparent BGRA frames cannot pass regardless of their hidden RGB.
`GetSourceScreenshot` returns fully transparent frames on the owner's OBS, so
those captures are inconclusive and the screenshot test stays ignored. The
human visual check is the authority for content and transparency; screenshots
cannot close that check on this OBS. No live run is claimed by this delivery.

## Build evidence

Windows builder verification, 2026-10-26; simulated peers only:

- Baseline `cargo test --offline -p cc-obs`: five fixture tests passed.
- Final `cargo test --offline -p cc-obs`: **11 passed, eight live twins ignored**.
- Required red evidence, with `CC_LIVE_OBS` confirmed absent:
  `cargo test --offline -p cc-obs --test live -- --ignored` failed all eight
  twins at the first guard, each with the exact message below. No connection,
  overlay bind or keychain read was attempted:

  ```text
  live OBS disabled: CC_LIVE_OBS must be exactly 1; no network or keychain access attempted
  test result: FAILED. 0 passed; 8 failed; 0 ignored
  ```

- `cargo fmt --all -- --check`: passed.
- `cargo clippy --offline --workspace --all-targets -- -D warnings`: passed.
- `node scripts/check.mjs`: passed (381 code files; boundary, hygiene, file-cap
  and secret inventories reported). `git diff --check`: passed.
- `pnpm --config.verify-deps-before-run=false -r typecheck` and the corresponding
  `-r lint`: **failed before package checks** with Node `spawn EPERM` in pnpm's
  lifecycle launcher. No TypeScript, manifest, dependency or gate files changed.
  These gates need App Master verification outside this builder sandbox; they
  are not claimed green. The shared `node_modules` junction was not modified.

Live tests have not been enabled or run. This is not owner live-spike evidence.

### WP 0.7 CSP fix verification, 2026-10-27

- Red: `cargo test --locked -p cc-obs --test overlay` failed the two new
  CSP/transparency assertions against the original code; origin checks passed.
- Green: the same command passed all three tests after the fix.
- `cargo test --locked -p cc-obs`: 14 passed, nine live tests ignored.
- `cargo fmt --all -- --check` and
  `cargo --config net.offline=false clippy --workspace --all-targets -- -D warnings`:
  passed. The final narrowed `cc-obs` test run also passed all 14 tests.
- With `CC_LIVE_OBS` absent,
  `cargo test --locked -p cc-obs --test live live_overlay_screenshot_not_white -- --ignored --nocapture`
  printed `SKIPPED: CC_LIVE_OBS=1 required; no socket or keychain access attempted`
  and exited 0. This verifies the opt-in guard, not live rendering.
- `node scripts/check.mjs`: passed boundaries, hygiene and file cap (518 code
  files), and secrets (645 files). `git diff --check`: passed.
- `pnpm --config.verify-deps-before-run=false gate`: failed in unchanged
  `packages/contract/scripts/codegen.mjs` with `spawnSync cargo EPERM` after the
  tooling tests (14 passed), workspace inventory and Cargo fetch. It did not
  reach the Rust or package checks. Separate recursive `typecheck` and `lint`
  commands both failed at pnpm's lifecycle launcher with `spawn EPERM`.
  These match the earlier builder restriction above; gate scripts, contract
  files, manifests and lockfiles have no diff from the base commit. App Master
  must rerun the full gate in its verifier. No install was attempted over the
  shared `node_modules` junction.

### WP 0.7 visible plate follow-up, 2026-10-27

- Red: `cargo test --locked -p cc-obs --test overlay` failed the plate assertion
  against the unstyled page (two tests passed). The synthetic decoder test in
  `cargo test --locked -p cc-obs --test overlay --test live` separately failed
  because a fully transparent BGRA frame incorrectly returned `Some(true)`.
- Green: `cargo test --locked -p cc-obs` passed all 14 simulated tests with nine
  live tests ignored. Transparent frames with hidden non-white RGB and entirely
  zeroed pixels now both return `Some(false)`; opaque non-white pixels still pass.
- `cargo fmt --all -- --check` and
  `cargo clippy -p cc-obs --all-targets -- -D warnings`: passed.
- `cargo --config net.offline=false clippy --workspace --all-targets -- -D warnings`:
  passed.
- `node scripts/check.mjs`: passed boundaries, hygiene and file cap (524 code
  files), and secrets (653 files). `git diff --check`: passed.
- Recursive `pnpm --config.verify-deps-before-run=false -r typecheck` and `-r lint`
  both failed before package checks with lifecycle-launcher `spawn EPERM`.
  `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests,
  workspace inventory and Cargo fetch, then failed with `spawnSync cargo EPERM`
  in the unchanged contract exporter. These match the earlier sandbox failures;
  gate scripts, contract files, manifests and lockfiles have no diff from HEAD.
  App Master must rerun these gates in its verifier. No install was attempted
  over the shared `node_modules` junction.
- Scene mismatch reporting is compiled, not claimed live-verified. No live
  checks ran, no OBS scene was switched, and no visual sign-off is claimed.

## D3a rehearsal ownership

`Ownership` keeps an atomic `ownership.json` snapshot (write, sync, rename) under
`<core-data-root>/obs`, beside the native/settings and module stores. Its private
schema contains endpoint keys, created scene names and created inputs' scene name,
source name, input UUID and scene item ID. It rejects malformed snapshots and
unknown fields. No password, keychain label, RPC session token or overlay URL is
stored. The legacy native `app()`/registry constructor without a data root uses an
in-memory ledger; the production `app_with_data_dir` path persists it.

`obs.rehearsal.clear` addresses inputs by recorded UUID, never by source name.
It first reads the global input inventory and detaches placements in the recorded
scene whose `sourceUuid` matches that owned UUID, using `RemoveSceneItem`. Then
it requests `RemoveInput` by `inputUuid` and verifies absence from both global
inputs and that scene's items, polling for up to three seconds. Only verified
absence drops the record; only a previously observed input/placement contributes
to `removed`. If the last placement releases the input before `RemoveInput`, its
600 reply is accepted and verified; a previously missing input contributes zero.
Timeouts and other failures preserve cleanup authority for retry. It then inspects
only owned scenes and removes only those with no items. A nonempty owned scene
remains recorded for a later clear; an empty removed scene is dropped only after
the scene inventory confirms absence. Preexisting scenes are never claimed. Records
for another endpoint are untouched. The empty check and removal are separate OBS
requests; OBS does not provide a conditional RemoveScene transaction, so an owner
must avoid adding items during clear.

Added simulated evidence (written here; Director execution pending):

| Acceptance | Evidence |
| --- | --- |
| Ensure creates once; existing scene stays unowned | `tests/ownership.rs::ensure_creates_once_and_never_claims_an_existing_scene` |
| CreateInput UUID/item ID capture, restart, UUID-only cleanup, foreign input/nonempty scene retained | `capture_survives_restart_and_clear_preserves_foreign_items_and_nonempty_scene` |
| Missing inputs/scenes dropped; other rejection retained | `missing_inputs_and_scenes_are_dropped_but_other_rejections_retain_ownership`, `scene_deleted_between_empty_check_and_removal_is_skipped` |
| Local endpoint validation | `src/connection.rs::tests::endpoint_accepts_local_addresses_and_plain_hostnames_only` |

D3a builder validation: direct `rustfmt`, static inventory/secret checks and
`git diff --check` only. No Cargo command or browser was run, per the delivery
brief. The Director owns `cargo test -p cc-obs -p cc-core` and `pnpm gate`; these
new tests are not claimed green or live evidence.

D3a review follow-up: the Director reported the Cargo tests green except for
parallel ownership-test temp-directory collisions on Windows. `Root` now includes
a process-wide atomic counter alongside PID/time and ignores removal errors in
Drop. A regression check creates roots in parallel and removes one before Drop.
The other new D3a helpers use `tempfile::tempdir()` or no filesystem paths; none
share this pattern. The builder has not rerun Cargo after this correction.

The later isolated OBS 33.0.1 / obs-websocket 5.7.6 review exposed a second defect:
the old clear treated status 100 as actual removal, discarded the input UUID and
then left its still-nonempty off-air scene behind. The fake peer had synchronously
deleted inputs and placements, masking this. The real
[`RemoveInput` handler](https://github.com/obsproject/obs-websocket/blob/5.7.6/src/requesthandler/RequestHandler_Inputs.cpp#L196-L208)
calls `obs_source_remove`, which marks removal; associated scene items are pruned
by [`scene_video_render`](https://github.com/obsproject/obs-studio/blob/33.0.1/libobs/obs-scene.c#L940-L1000).
An off-air scene need not render. Explicit placement detachment removes that
dependency. No program-scene switch is used.

`tests/ownership_removal.rs` and its stateful retained-item peer reproduce a
successful RemoveInput acknowledgement with indefinitely retained placements,
last-placement input release, false-success timeout with ledger preservation,
restart/retry, and a foreign replacement reusing the source name and item ID.
The night core's fake now retains off-air placements too; its unit test requires
explicit detachment. Existing inputs rejected by CreateInput (601) are never
adopted. Already-lost ledger entries from the old bug are not reclaimed by name.

This correction adds no RPC identifiers, contract edits or ledger format change.
Rust tests and real OBS reruns remain Director work. Node harness tests (21),
e2e TypeScript checking, changed-file ESLint, direct Rust formatting and repository
static checks pass in the builder; no Cargo command or browser was run.
