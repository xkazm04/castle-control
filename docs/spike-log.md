# WP 0.7 owner live-spike record

**Status: pending owner live run.** This delivery supplies the build half only.
No Twitch login, live chat, armed action or real OBS test was run by the builder.
M1 remains gated until the owner completes and records every live item below.

## Owner spike checklist (Tuesday)

**Status: pending owner live run.** Owner-operated instructions only; this
checklist enables nothing. Run serially from the repository root on the owner's
machine. Use only the owner's test channel and owned test accounts. No armed
action may reach a real viewer before the M1 exit and written owner sign-off.

**Never paste:** tokens, passwords, client secrets and message bodies stay out
of this file. Record only sanitized result lines, timestamps and evidence references.

### Owner-only preparation, in order

- [ ] Prepare the owner's Twitch test channel; confirm the broadcaster identity.
- [ ] Prepare two owned test viewer accounts. Choose a distinct **non-moderator**
  account as the timeout target; keep the second owned account available for
  observer scenarios. Never substitute a real viewer.
- [ ] Register the public Twitch application for device-code flow. Keep its
  public client ID available; complete sign-in in the native/browser flow below.
  Twitch credentials stay in `castlecontrol-twitch` / `streamer` in the OS keychain.
- [ ] Enable obs-websocket v5 on `127.0.0.1:4455`, create the scene `Scene`,
  and provision the OBS password through a trusted credential UI under service
  `castlecontrol-obs`, account `local-obs`. Enable authentication for the auth
  vector twin: that check fails as untested without it. Reserve overlay port 17891.
- [ ] Start the intended local model runtime and load the exact model. Keep its
  literal-loopback `/v1` endpoint and loaded model ID available for
  `CC_LIVE_FLOOR_URL` and `CC_LIVE_FLOOR_MODEL`; no DNS/cloud endpoint, model
  discovery or automatic download is part of these floor checks.

### Run order

1. **WP 0.7 first.** Run the existing command under
   [Owner preparation and exact command](#owner-preparation-and-exact-command)
   below; it is the single source of the command. **ARMED:** it applies a
   30-second timeout to the explicit owned non-moderator target and immediately
   undoes it. It also checks login, chat, the labelled shadow stub, OBS source
   creation and socket-drop recovery. Confirm the page visually in OBS, finish
   the runner with Enter/Ctrl+C, and remove its source manually before the twins
   need port 17891. An unconfirmed undo requires checking the target in Twitch.
2. **Twitch twins (T1–T10).** Use the commands below one at a time, following
   their printed owner instructions. Sign-in from step 1 supplies the existing
   vault entry. Supply these environment variables by name only here:
   `CC_LIVE_TWITCH_CHANNEL`, `CC_LIVE_TWITCH_TARGET`, `CC_LIVE_TWITCH_CLIENT_ID`,
   and, for T4, `CC_LIVE_TWITCH_ACTION`. The opt-in is `CC_LIVE_TWITCH`.
   Tests observe and read; they issue no moderation mutations. **ARMED owner UI
   actions:** any timeout/ban selected for T4, and warnings in T4/T8, must target
   only the named owned test account. Restore reversible changes in Twitch UI.
3. **OBS twins (O1–O8).** Use the commands below one at a time. The only required
   environment variable is `CC_LIVE_OBS`; endpoint, scene and keychain labels
   are fixed as prepared above. Source checks create/remove only their own
   temporary inputs. Inspect OBS if cleanup fails; retain the separate WP 0.7
   visual confirmation, since a protocol PASS cannot prove pixels were painted.
4. **Local floor (F0, then F1–F9).** Supply `CC_LIVE_FLOOR_URL` and
   `CC_LIVE_FLOOR_MODEL` outside this file. Run the measurement command, then
   the serial twin suite below with opt-in `CC_LIVE_FLOOR`. These use simulated
   prompts and local temporary audit stores; they arm no rule and persist no
   admission. Keep the measurement directory for inspection. Record n,
   correct/failed, p95 and longest silence; repeat representative cold/warm
   readings before admitting a model. Exit zero alone is insufficient.

For each owner-authorized Twitch command, use this PowerShell opt-in/cleanup
pattern. Insert one T command at the comment; do not run all observers together.
Configuration variables above contain public configuration, never credentials.

```powershell
$env:CC_LIVE_TWITCH='1'
try {
    # Run one exact T command from the table below.
} finally {
    Remove-Item Env:CC_LIVE_TWITCH
}
```

The OBS README uses POSIX prefix notation. Its exact commands are retained in
the table; in PowerShell run only the `cargo test` portion inside this pattern:

```powershell
$env:CC_LIVE_OBS='1'
try {
    # Run the cargo test portion of one exact O command below.
} finally {
    Remove-Item Env:CC_LIVE_OBS
}
```

Exact commands copied from the [Twitch Live flip](../crates/cc-twitch/README.md#live-flip)
and [OBS Live flip](../crates/cc-obs/README.md#live-flip). Repeated README rows
share one command here: there are **10 Twitch** and **8 OBS** distinct live twins.

| ID | Exact README command |
| --- | --- |
| T1 | `cargo test -p cc-twitch -- --ignored live_automod_hold_v2 --nocapture --test-threads=1` |
| T2 | `cargo test -p cc-twitch -- --ignored live_automod_update_v2 --nocapture --test-threads=1` |
| T3 | `cargo test -p cc-twitch -- --ignored live_suspicious_v1 --nocapture --test-threads=1` |
| T4 | `cargo test -p cc-twitch -- --ignored live_channel_moderate_v2 --nocapture --test-threads=1` |
| T5 | `cargo test -p cc-twitch -- --ignored live_shield_timestamps --nocapture --test-threads=1` |
| T6 | `cargo test -p cc-twitch -- --ignored live_chat_delay_restore --nocapture --test-threads=1` |
| T7 | `cargo test -p cc-twitch -- --ignored live_helix_success_shapes --nocapture --test-threads=1` |
| T8 | `cargo test -p cc-twitch -- --ignored live_warning_reason_limit --nocapture --test-threads=1` |
| T9 | `cargo test -p cc-twitch -- --ignored live_rate_headers_and_caps --nocapture --test-threads=1` |
| T10 | `cargo test -p cc-twitch -- --ignored live_scope_sufficiency --nocapture --test-threads=1` |
| O1 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_handshake_rpc_versions` |
| O2 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_auth_vector` |
| O3 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_get_version_correlation` |
| O4 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_create_input_shape` |
| O5 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_scene_exists` |
| O6 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_status_codes` |
| O7 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_reconnect_is_explicit` |
| O8 | `CC_LIVE_OBS=1 cargo test -p cc-obs -- --ignored live_overlay_17891` |

T1 needs both AutoMod and blocked-term holds. T2 needs Approved, Denied and
Expired observations; prepare a hold near expiry before starting (90-second
waits). T3 depends on Twitch's actual suspicious-user classification. Repeat T4
for each applicable `spike_session::ACTIONS` selection, including `warn` for
nullable-warning/provenance checks; one action does not prove the vocabulary.
Restore Shield and chat delay after T5/T6, including after failure. T8 observes
one owner-issued 500-character warning, not Helix's rejected-length boundary.
T9 is one read plus a bounded observation window: never generate load or repeat
actions to seek a cap/429. Unobserved variants, shared-chat fields, unpublished
action caps, mutation-response evidence and integration timing stay unverified;
see [To verify at the live spike](../crates/cc-twitch/README.md#to-verify-at-the-live-spike).
Do not promote observer success into those deferred claims.

**F0 measurement**, copied verbatim from
[Spike: floor reading](../crates/cc-engine/README.md#spike-floor-reading):

```powershell
cargo run --offline --locked -p cc-engine --bin measure-floor -- $env:CC_LIVE_FLOOR_URL $env:CC_LIVE_FLOOR_MODEL (Join-Path $env:TEMP ("castlecontrol-floor-" + [guid]::NewGuid()))
```

The measurement binary has no opt-in guard: owner-run only. **F-suite** is the
README's exact command for all **9 engine-floor** live twins, wrapped in the
same PowerShell set-then-remove pattern:

```powershell
$env:CC_LIVE_FLOOR='1'
try {
    cargo test --offline --locked -p cc-engine --test floor_live -- --ignored --test-threads=1 --nocapture
} finally {
    Remove-Item Env:CC_LIVE_FLOOR
}
```

### Live evidence (owner fills after running)

Every row's status is **pending owner live run**. Command IDs refer to the exact
commands above; WP means the existing WP 0.7 command below. Expected lines are
patterns, not recorded results: `<UTC>` is an RFC 3339 UTC timestamp, and `...`
in floor output stands for measured fields. Rust test success uses `... ok`,
not a literal `PASS` label. Record owner timestamps separately for these tests.
F-suite must pass all nine; the two negative probes must each record one failed
measurement case while their tests pass. Positive floor readings require six
correct cases and zero failures; live admission also needs p95 <= 2,000 ms and
longest silence <= 1,500 ms (near-live: 5,000 / 3,000 ms).

| check | command | expected PASS line | timestamp | owner evidence |
| --- | --- | --- | --- | --- |
| WP device login | WP (below) | `<UTC> PASS device_login` | 2026-10-27T16:44:45.849Z | run 10: stored keychain login reused (1684515); device flow passed earlier in runs 3-7 (e.g. 14:36:43.834Z) |
| WP chat | WP (below) | `<UTC> PASS live_chat` | 2026-10-27T16:44:56.806Z | run 10: `!castle-spike` sent from castlecontroltarget |
| WP shadow stub | WP (below) | `<UTC> PASS shadow_verdict_stub` | 2026-10-27T16:44:56.814Z | run 10: would_act recorded to decisions.jsonl |
| WP timeout / undo — ARMED, owned target only | WP (below) | `<UTC> PASS timeout_and_undo` | 2026-10-27T16:44:57.252Z | run 10: 30 s timeout on castlecontroltarget, undone |
| WP OBS source + owner visual confirmation | WP (below) | `<UTC> PASS obs_source` + owner screenshot reference | 2026-10-27T16:44:57.259Z | run 10 with plate 77c8320; visual check in scene `Scene`: `docs/spike-evidence/2026-10-27-obs-plate-run10.png` (Athena, owner-delegated) |
| WP socket recovery / gap | WP (below) | `<UTC> PASS socket_drop_gap` | 2026-10-27T16:45:01.830Z | run 10: socket drop recovered with gap |
| T1 AutoMod hold | T1 | `test tests::spike_live::live_automod_hold_v2 ... ok` | pending owner live run | pending owner live run |
| T2 AutoMod update | T2 | `test tests::spike_live::live_automod_update_v2 ... ok` | pending owner live run | pending owner live run |
| T3 suspicious-user message | T3 | `test tests::spike_live::live_suspicious_v1 ... ok` | pending owner live run | pending owner live run |
| T4 selected moderation action (repeat per action) | T4 | `test tests::spike_live::live_channel_moderate_v2 ... ok` | pending owner live run | pending owner live run |
| T5 Shield toggle / restore | T5 | `test tests::spike_live::live_shield_timestamps ... ok` | pending owner live run | pending owner live run |
| T6 delay toggle / restore | T6 | `test tests::spike_live::live_chat_delay_restore ... ok` | pending owner live run | pending owner live run |
| T7 read-only Helix envelopes | T7 | `test tests::spike_live::live_helix_success_shapes ... ok` | pending owner live run | pending owner live run |
| T8 warning reason echo (owned target only) | T8 | `test tests::spike_live::live_warning_reason_limit ... ok` | pending owner live run | pending owner live run |
| T9 headers / bounded cap observation | T9 | `test tests::spike_live::live_rate_headers_and_caps ... ok` | pending owner live run | pending owner live run |
| T10 identity / scopes / subscriptions | T10 | `test tests::spike_live::live_scope_sufficiency ... ok` | pending owner live run | pending owner live run |
| O1 handshake / RPC | O1 | `test live_handshake_rpc_versions ... ok` | pending owner live run | pending owner live run |
| O2 authenticated vector | O2 | `test live_auth_vector ... ok` | pending owner live run | pending owner live run |
| O3 version correlation | O3 | `test live_get_version_correlation ... ok` | pending owner live run | pending owner live run |
| O4 browser-source shape | O4 | `test live_create_input_shape ... ok` | pending owner live run | pending owner live run |
| O5 existing Scene | O5 | `test live_scene_exists ... ok` | pending owner live run | pending owner live run |
| O6 status / error mapping | O6 | `test live_status_codes ... ok` | pending owner live run | pending owner live run |
| O7 explicit reconnect | O7 | `test live_reconnect_is_explicit ... ok` | pending owner live run | pending owner live run |
| O8 isolated overlay / 17891 | O8 | `test live_overlay_17891 ... ok` | pending owner live run | pending owner live run |
| F0 floor reading | F0 | `instrument=simulated-floor-v1 n=6 correct=6 failed=0 ... live_admitted=true` | pending owner live run | pending owner live run |
| F1 local-only path | F-suite | `test live_local_only ... ok` | pending owner live run | pending owner live run |
| F2 request shape | F-suite | `test live_request_shape ... ok` | pending owner live run | pending owner live run |
| F3 response shape | F-suite | `test live_response_shape ... ok` | pending owner live run | pending owner live run |
| F4 usage shape | F-suite | `test live_usage_shape ... ok` | pending owner live run | pending owner live run |
| F5 latency budgets | F-suite | `test live_latency_budgets ... ok` | pending owner live run | pending owner live run |
| F6 measurement timeout | F-suite | `test live_measurement_timeout ... ok` | pending owner live run | pending owner live run |
| F7 stable model identity | F-suite | `test live_model_identity ... ok` | pending owner live run | pending owner live run |
| F8 unknown-model negative probe | F-suite | `test live_http_errors ... ok` | pending owner live run | pending owner live run |
| F9 refusal-shaped negative probe | F-suite | `test live_refusal_shapes ... ok` | pending owner live run | pending owner live run |

| WP 0.7 acceptance item | Status | Timestamp / owner evidence |
| --- | --- | --- |
| Device login completes | PASS | 2026-10-27T16:44:45Z (run 10) |
| Chat typed on the test channel appears in the app | PASS | 2026-10-27T16:44:56Z (run 10) |
| One shadow verdict is logged | PASS | 2026-10-27T16:44:56Z (run 10) |
| One armed timeout lands on an owned test account and is undone | PASS | 2026-10-27T16:44:57Z (run 10) |
| OBS shows a browser source the app created | PASS | 2026-10-27T16:44:57Z (run 10) + docs/spike-evidence/2026-10-27-obs-plate-run10.png |
| A forced socket drop recovers with a gap event | PASS | 2026-10-27T16:45:01Z (run 10) |

## Owner preparation and exact command

Use only your own test channel and a different **owned, non-moderator test
account**. Passing `--target-login` is your assertion that you own that account.
The runner requires the authenticated broadcaster to match `--test-channel`.
Register the public Twitch device-flow client; enable OBS websocket v5 on port
4455; create the existing OBS scene `Scene`. Put its password in the OS keychain
under service **castlecontrol-obs**, account label **local-obs**, using a trusted
credential UI. Do not put the password or Twitch tokens in this command, a file,
chat, a transcript or the spike log. Password-less OBS also works when OBS is
configured without authentication; no keychain read occurs in that case.

Run from the project repo on the owner's machine (PowerShell). Replace only the
three uppercase public client/channel/login placeholders and the scene if needed:

```powershell
cargo run -p cc-core --features spike --bin spike -- --client-id YOUR_PUBLIC_TWITCH_CLIENT_ID --test-channel YOUR_OWN_TEST_CHANNEL --target-login YOUR_OWN_NON_MOD_TEST_ACCOUNT --scene "Scene" --obs-password-label local-obs --overlay-port 17891 --data-dir "$env:LOCALAPPDATA\CastleControl\spike" --wait-seconds 300
```

`spike` enables `cc-twitch/fault-injection`; default core builds do not enable it.
There is no RPC for the socket-drop hook. Both target and channel flags are
mandatory; omission fails before storage, keychain, login or network access.
The local data directory is dedicated to this spike, not the production store.
The broker uses the existing `castlecontrol-twitch` / `streamer` keychain entry;
run with the intended test identity. Revocation purges the attached store.

The Twitch code appears only in a native dialog, and the browser opens Twitch's
verification page. Complete the device flow there. After the login PASS line,
send **!castle-spike** from the explicit test target in the test channel. The
console echoes only that fixed marker: other messages and message bodies are not
logged. The target's numeric ID comes from Twitch's verified chat metadata, not
an untrusted name-to-ID input. A moderator or broadcaster target is refused.

The shadow step is a **stub**, labelled `shadow_verdict_stub`, and writes a
`would_act` decision with an ID reference to `decisions.jsonl`; the M1 classifier
is not built here. The timeout is 30 seconds and is immediately undone through
unban. An uncertain timeout response still triggers an undo attempt. Any undo
failure prints FAIL and requires the owner to check the account in Twitch.
Successful timeout/undo calls are recorded as separate audit decisions.

The source name includes a fresh run ID. CreateInput PASS means OBS acknowledged
the request; confirm the static page **visually in OBS** before marking its row
complete. The read-only page is served at `http://localhost:17891/` on a separate
origin with no `/rpc` or `/events` route and no remote resources. Core binds a
separate ephemeral loopback port; its session capability stays native. The
overlay remains available until Enter or Ctrl+C after reconnect, so the owner
can inspect it. Remove the spike source manually after the run.

The last step drops the live EventSub socket through the ordinary reconnect
path, then requires both a `bridge.gap` core event and a connected bridge with
recorded gap timestamps. It does not revoke credentials. `bridge.status.get`
is the authoritative read for those timestamps. Each attempted step prints an
RFC 3339 UTC timestamp, PASS or FAIL and a fixed step name. Later steps are not
attempted after a failure. Paste only these sanitized lines into the table's
evidence; retain screenshots of OBS and the test account outcome as appropriate.

Stream live state/viewers and Gatehouse summaries remain **absent when unknown**.
The current bridge exposes neither stream online/offline topics nor a public
Helix streams read. This spike makes no ON AIR, viewer-count or M1 claim.

## Build evidence (simulated only)

Tests in `crates/cc-obs/tests/protocol.rs` cover the recorded simulated Hello,
independent SHA256/base64 auth vector, GetVersion correlation, CreateInput shape,
untrusted URLs, mismatched response type and a captured-log grep for sentinel
credentials even in a hostile OBS error comment. `tests/overlay.rs` proves
`/rpc` and `/events` are absent on the overlay origin.

`crates/cc-core/tests/native.rs` covers bridge-gap delivery over authenticated
`/events`, authoritative gap mapping, status omission, real store purge on
revocation, and chat invalidations containing no chat payload. `tests/spike.rs`
checks explicit-target refusal and the feature-gated binary's failure before
side effects. These tests use generated simulated data only and do not satisfy
the live acceptance rows above.

Build verification on Windows, 2026-10-25 (simulated peers only):

- `cargo fmt --all -- --check`: exit 0.
- `cargo --config net.offline=false clippy -p cc-core -p cc-obs --all-targets --features cc-core/spike -- -D warnings`: exit 0.
- `cargo --config net.offline=false test -p cc-core -p cc-obs -p cc-twitch`: exit 0; 50 tests and one compile-fail doctest passed.
- The same test command with `--features cc-core/spike`: exit 0; 51 tests and one doctest passed.
- `cargo tree -p cc-core -e features -i cc-twitch`: default build enables only the default Twitch feature, not fault injection.
- `export-registry`: seven methods, all already declared in `cc-types`.
- Direct execution of the repository's five secret patterns and file-cap rule:
  exit 0, inventories 186 text files and 120 code files, with junctions excluded.
- `git diff --check`: exit 0. No git writes were run.
- `node scripts/check.mjs` cannot start: TypeScript is unavailable to module
  resolution in this worktree. The official Node checks and pnpm-recursive gates
  are **ran outside: merge gate**, per the build sandbox brief. No install or
  mutation of the shared `node_modules` junction was attempted.
