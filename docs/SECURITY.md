# Security

## OBS overlay host (WP 3.2)

The OBS overlay has a separate IPv4 loopback listener, exact `localhost:<port>`
Host check, router and origin. Every response, including failures, carries
nosniff and no-store. Its CSP is the exact policy in
[ADR 0002](adr/0002-overlay-host-csp.md), with the actual overlay port in the
single `/push/beacons` connection source. The root spike plate remains static;
Beacons pages load only the bundled local renderer. There is no RPC, control
events, proxy, redirect or core session capability in overlay resources or SSE.
The control service grants this origin no CORS or Origin permission, even when
a request supplies an otherwise valid simulated capability.

`NativeServices` is the trusted in-process handoff. Packages are parsed with the
existing contract, confined to their canonical package root including symlinks
and junctions, read into immutable bounded memory and hash-verified before
acceptance. Raster images have fixed sniffed MIME types (PNG/JPEG/GIF/WebP);
SVG/HTML and undeclared files are not served. Scripts require explicit native
consent for initial or widened entry-point privileges and are served only as
declared local external `.js` files. Declaration alone grants nothing. Consent
is in memory; restarting requires reimport/reverification/reconsent. Script
grants concern entry points; updates to already-granted entry-point bytes still
require hash verification. Consented code shares the overlay origin and is not
trusted desktop code; it receives no control capability. Removing a script tag
does not revoke effects of code already executed: reload the source to end an
existing script execution context after removing its privileges.

Push uses `BeaconsRenderSnapshot` full replacements on the exact event
`beacons.render.snapshot`. Visual/design/intensity IDs must agree. Only committed
visuals, verified accepted packages and computed intensities publish. A named
but unverified design publishes nothing. Pending updates coalesce in one watch
slot per visual; reconnects receive the latest accepted snapshot. Limits are
128 visuals, 16 packages, 128 assets/layers and 8 MiB of assets per package,
128 simultaneous SSE clients, 64 KiB visual metadata and 128 KiB package metadata.
No preview mutation enters this channel. Package files are never reopened by
HTTP routes, so later filesystem edits cannot replace verified bytes.

HTTP/schema/consent/confinement tests pass. A separate real-browser test is
provided for CSP enforcement and native-handoff render timing; Chrome launch
was denied by Windows IPC permissions in the builder sandbox. No browser or OBS
latency result is claimed. See ADR 0002 and the core README for the remaining
Director-run checks.

The loopback `/rpc` service allows CORS only for the exact origins
`tauri://localhost` and `http://tauri.localhost`, echoing the allowed origin and
varying responses by Origin, including error responses. OPTIONS preflights carry
no session token and are origin-checked; only POST and the `content-type` and
`authorization` request headers are allowed, with a 600-second preflight cache.
No wildcard or browser credential permission is granted. POST still requires
the per-launch session token and its existing origin check; `/events` keeps its
authentication and origin checks and receives no CORS headers.
The desktop capability stays in native memory and a guarded main-frame initialization script, is consumed/deleted by the trusted built frontend, and must never enter URLs, storage, arguments, logs or diagnostics; code running in that webview shares its custody.

## Twitch bridge

`cc-twitch` is adapted from Shadowrunr OS, commit `7e4b6f8`,
`crates/shadowrunr-daemon/src/platform/twitch/`. Its source files retain provenance.

### Keyring custody class

The entry label is service `castlecontrol-twitch`, account `streamer`.
The value contains the access token, refresh token and absolute expiry. No token
file is written. Target-specific keyring backends are Windows Credential Manager
(`windows-native`), macOS Keychain (`apple-native`) and Linux Secret Service
(`sync-secret-service`, with Rust cryptography). An unavailable or locked keyring
is an error; there is no plaintext fallback.

This is **OS-user custody**, not isolation from the signed-in user. Anything
running as the same user can read the credential, subject to the platform's
keyring policy. This protects against accidental file disclosure and separates
OS accounts; it does not protect against malware or an administrator with access
to the user's session. Linux needs an unlocked Secret Service implementation.
Native stores need validation on each release platform; the unit tests substitute
a private in-memory store and never access the developer's keychain.

### Brokered calls

Callers submit actions to `TwitchBridge`; they never receive the access token or
refresh token. Credential types, serialization, store operations, OAuth and Helix
request construction are private. The production constructor pins Twitch's
HTTPS/WSS destinations; endpoint overrides and memory stores are private test
infrastructure. HTTP redirects are disabled. EventSub reconnect URLs must match
the configured endpoint's scheme, host and port and carry no URL credentials.

Secrets travel in OAuth form bodies and sensitive authorization headers, never
URLs. Secret debug output is redacted and owned secret strings are zeroized when
dropped. HTTP libraries and the OS may retain their own transient copies, so this
is not a claim that every memory copy can be erased. Upstream response bodies and
transport error strings are never logged or included in public errors. Typed
responses are parsed inside the broker. An upstream response containing the
current credential is rejected. The captured-log test scans trace-level output,
including an upstream error that deliberately echoes a simulated credential.

Device authorization displays only the user code, verification URI and lifetime.
The device challenge stays private. Pending authorization is polled at Twitch's
interval; `slow_down` increases that interval, and denial/expiry stops polling.
No client secret is embedded in this public desktop client.

`scopes::MODULE_SCOPES` has one row per module. Core is always enabled; other
modules explicitly add their scopes. Shared scopes/topics are deduplicated before
authorization/subscription. Extension Bits transactions belong to the hosted
service's webhook and are never subscribed on a desktop WebSocket. Custom
Power-ups arrive through `channel.bits.use`; Beacons owns cross-topic contribution
deduplication, because a cheer may also arrive as `channel.cheer`.

### Single-flight refresh

Absolute expiry survives restart. Refresh is scheduled at a jittered 80–90% of
the remaining lifetime, using millisecond precision. Validation runs at startup
and hourly; a rejected access token also causes one refresh and one retry.
One async credential lock and a generation check serialize proactive refresh,
validation and concurrent Helix 401s. Stale callers reuse the rotated generation
instead of spending a one-time refresh token again. The new pair is retained in
memory even if keyring persistence fails; that failure is returned to the caller.

Helix records `Ratelimit-Limit`, `Ratelimit-Remaining` and `Ratelimit-Reset`.
A depleted bucket fails subsequent calls immediately with `RateLimited` and
`retry_after_ms`. HTTP 429 also observes `Retry-After`, with a conservative
one-second fallback when headers are absent. Live moderation must surface this
failure rather than wait indefinitely or retry an action without a gate verdict.

### Revocation and purge_all

Construction requires a `RevocationHandler`; there is no production no-op default.
WP 0.3 must implement its `purge_all` method using cc-store's full data purge.
The bridge calls it when refresh proves authorization invalid, when a refreshed
token is rejected, when validation finds an incompatible identity/scope grant,
on EventSub `authorization_revoked`, and on explicit disconnect.

Retirement blocks further credential use, deletes the keyring entry, and awaits
the purge callback. Only then does it notify the connection workers to stop, so
that notification cannot cancel the purge which issued it. A completed purge is
idempotent within that bridge instance. Callback and keyring deletion failures
are errors, not success; explicit `disconnect` can retry failed cleanup.
The storage integration must make `purge_all` durable and idempotent. This crate
does not itself implement the recording store or claim that a callback alone
deletes viewer data. An unavailable Twitch revoke endpoint is logged as
unconfirmed upstream revocation while local deletion and purge still proceed.

Each EventSub connection owns its state machine, keepalive deadline and reconnect
backoff. Topics fill a connection before another opens, with at most 300 per
connection and three connections. A planned Twitch handover continues reading
the old socket during the new handshake and transfers subscriptions without
resubscribing. A dropped socket opens a new session, restores every topic in its
group and emits `{"kind":"bridge.gap","from":"…Z","to":"…Z"}`. These UTC
timestamps mark missing coverage, not a claim of replay. cc-core adds its
sequence/time envelope and fans the gap out to ledgers. Ingress notifications are
unmoderated; downstream draw, consensus and chant consumers must receive them
only after the Gatehouse verdict.

### Testing and live operation

All fixtures are explicitly simulated. The tests bind OAuth, Helix and EventSub
servers to `127.0.0.1:0`, use a memory store, and perform no live Twitch requests.
The acceptance evidence is in `crates/cc-twitch/VERIFICATION.md`.
WP 0.7 remains the separate owner-attended live spike. Armed actions may target
only the owner's test accounts; real viewers require the M1 exit and the owner's
written sign-off. The adapter transports actions; Gatehouse owns their safety
authorization.

Protocol references: [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/),
[token refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/).
