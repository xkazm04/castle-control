# Security

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
