# cc-obs wire checks

## Wire assumptions

- **Hello / Identify:** OBS websocket v5 uses text JSON `{op,d}` at
  `ws://127.0.0.1:<port>` (spike: `4455`). Hello is op `0`, with integer
  `rpcVersion >= 1`. Identify is op `1`, requests RPC `1` and
  `eventSubscriptions: 0`. Identified must be op `2` with
  `negotiatedRpcVersion: 1`. Unknown Hello fields are ignored. No-auth Hello
  omits authentication, and the client never reads the keychain in that case.
- **Authentication:** `base64(SHA256(base64(SHA256(password + salt)) + challenge))`,
  using UTF-8 bytes and standard padded base64. Only the existing OS keychain
  service `castlecontrol-obs`, account `local-obs`, supplies live passwords.
  The simulated independent vector lives in `tests/simulated/mod.rs`.
- **GetVersion / correlation:** requests are op `6` with `requestType`,
  `requestId` (`cc-1`, `cc-2`, ...), and `requestData`. Responses are op `7`;
  both ID and type must match. Unrelated IDs and op `5` events are skipped.
  Version data requires `obsVersion`, `obsWebSocketVersion`, `rpcVersion: 1`
  and `availableRequests`. Requests serialize through exclusive mutable access.
- **CreateInput:** `sceneName`, `inputName`, `inputKind: browser_source`,
  `sceneItemEnabled: true`; `inputSettings` has `url`, `width`, `height`,
  `is_local_file: false`, `shutdown: false`. The URL must be an HTTP
  `localhost:<nonzero-port>/` root without credentials/query; dimensions are
  1..8192 and names must be nonblank. The expected OBS response data contains
  `sceneItemId` and `inputUuid`. **The client currently ignores response data:**
  successful correlated status alone acknowledges creation. The live twin
  reads back the production-created input, then independently recreates it to
  inspect the actual response fields and matching scene item.
- **Scene:** the spike expects an existing scene named exactly `Scene`; cc-obs
  does not create scenes or hardcode that name and forwards caller-supplied names.
- **Status / errors:** success requires BOTH `result: true` AND `code: 100`.
  Every other status becomes fixed `Error::Rejected`; peer comments are never
  surfaced. Malformed/mismatched protocol becomes `Protocol`, socket closure or
  IO failure `Transport`, unavailable password `Keychain`, invalid config/source
  `Invalid`, elapsed five-second handshake/request budget `Timeout`. Specific
  OBS failure codes are not mapped to separate product errors. Fixtures use
  synthetic 500/600 rejection examples, not a claim about a live server's code.
- **Reconnect:** no automatic reconnect, retry, input replay, or background
  resubscribe exists. After socket failure the caller must construct a fresh
  client, repeat Hello/Identify and issue a new request. The fixture closes the
  peer; the live twin closes only its own connection and opens a fresh one,
  without restarting OBS or disrupting another client's socket.
- **Overlay:** the spike's separate page is `http://localhost:17891/`, bound to
  IPv4 loopback. Only the exact `localhost:<port>` Host is allowed (else 403).
  Root is GET/HEAD only (POST 405); `/rpc` and `/events` are absent (GET/POST
  404). The static page declares `html, body { background: transparent; margin: 0; }`
  in an inline style. CSP permits only `style-src 'unsafe-inline'`; `default-src`,
  `script-src`, `connect-src`, `img-src`, `frame-ancestors`, `base-uri` and
  `form-action` are all `'none'`, with `nosniff` and `no-store`. Drop stops the
  server. Fixtures choose an ephemeral port; live tests reserve 17891 and do not
  attach to another server.

### WP 0.7 OBS styling exception

OBS injects source-configurable CSS through a `<style>` without a nonce in
[`BrowserClient::OnLoadEnd`](https://github.com/obsproject/obs-browser/blob/master/browser-client.cpp#L609-L625)
(checked 2026-10-27). The page cannot attach a nonce to that injected element,
and a fixed hash would depend on the exact source's custom CSS. The scoped
exception is therefore `style-src 'unsafe-inline'`, without `'self'`, host or
scheme sources. Remote styles, CSS imports/images/fonts, scripts, connections
and frames remain blocked. Explicit page transparency also works outside OBS.

`simulated_overlay_csp_only_allows_inline_styles` checks the exact directive
and source sets; `simulated_overlay_declares_transparent_background` checks
the permitted style declaration. Both failed against the original overlay
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
Browser-source checks use a `cc-live-<pid>-<run-id>` input name, attempt
`RemoveInput` even after an assertion or uncertain creation, then verify absence
with `GetInputList`. Cleanup failure fails the test and requires owner inspection;
process termination or an unreachable OBS can prevent cleanup. No other inputs,
scene settings, RPC registrations or core services are changed.

The screenshot check cleanly skips before any access unless `CC_LIVE_OBS=1`.
When enabled, it uses the existing guarded connection and keychain label,
creates its own source, calls `GetSourceScreenshot` with BMP (required in
`GetVersion.supportedImageFormats`), and checks decoded pixels rather than
encoded bytes. It waits one second before each of up to ten captures, so an
all-white frame fails after the retry window. Images stay in memory. Its
synthetic decoder test rejects all-white, truncated and compressed frames.
BMP checks non-white RGB pixels, not alpha: an empty non-white frame can pass,
so the owner's visual confirmation of content and transparency in
`docs/spike-log.md` is still required. No live run is claimed by this delivery.

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
