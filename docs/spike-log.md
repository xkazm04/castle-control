# WP 0.7 owner live-spike record

**Status: pending owner live run.** This delivery supplies the build half only.
No Twitch login, live chat, armed action or real OBS test was run by the builder.
M1 remains gated until the owner completes and records every live item below.

| WP 0.7 acceptance item | Status | Timestamp / owner evidence |
| --- | --- | --- |
| Device login completes | pending owner live run | |
| Chat typed on the test channel appears in the app | pending owner live run | |
| One shadow verdict is logged | pending owner live run | |
| One armed timeout lands on an owned test account and is undone | pending owner live run | |
| OBS shows a browser source the app created | pending owner live run | |
| A forced socket drop recovers with a gap event | pending owner live run | |

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
