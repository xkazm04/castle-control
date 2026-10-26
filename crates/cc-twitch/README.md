# cc-twitch moderation transport (WP 1.2, offline half)

These adapters transport an already-authorized intent through the existing vault.
They do not register RPCs, arm rules, write a decision ledger, or call a live gate.
There is no cc-types dependency and no new crate dependency.

| Bridge method | Helix request | Body |
| --- | --- | --- |
| `warn` | POST `/moderation/warnings`, broadcaster/moderator query | `data: {user_id, reason}` |
| `resolve_held_message` | POST `/moderation/automod/message`, no query | `{user_id: moderator, msg_id, action: allow/deny}` |
| `set_shield_mode` | PUT `/moderation/shield_mode`, broadcaster/moderator query | `{is_active}` |
| `set_chat_delay` | PATCH `/chat/settings`, broadcaster/moderator query | `{non_moderator_chat_delay, non_moderator_chat_delay_duration?}` |

Delay uses a closed enum (disabled, 2, 4, 6 seconds). Disabled omits duration.
Warning reasons require nonblank text and use the existing 500-character limit.
Empty target/message IDs fail before transport. Authentication stays in the vault;
no call accepts or returns a credential. Errors contain static text/status only.
The existing scopes and subscriptions are unchanged.

The shared vault returns `BridgeError::RateLimited { retry_after_ms }` on 429,
using the current response's `Ratelimit-Reset` epoch seconds. If reset is absent,
`Retry-After` seconds (or a one-second fallback) supplies a bounded wait; a stale
previous bucket reset is not reused. An explicit reset is authoritative, even
within the current second. A successful exhausted bucket blocks the next call
before transport. There is no automatic 429 retry. A successful final bucket
request remains successful. The existing one-refresh-on-401 behavior is retained.

`wire::parse_frame` validates moderation payloads before notification delivery.
`Notification::moderation()` offers a typed view through that same schema door;
the existing raw `event` preserves provenance/forward fields. The public struct
shape stays compatible with cc-core's existing offline producers. Typed access
reparses the retained raw payload using the subscribed version from `scopes`;
wire ingress checks the actual metadata version. Required version is 2 for AutoMod hold,
AutoMod update and channel moderate; 1 for suspicious-user messages and Shield
begin/end. Missing/unknown versions and unknown decision enums are errors, never
coerced into an actionable value. An unrelated topic retains existing handling.
No chat, held or suspicious, is promoted into the downstream chat path here.

The typed subset includes broadcaster/user/moderator identities, message text and
fragment kinds, AutoMod hold reasons/details, update status, action-specific
moderation details, suspicious-user classifications and Shield timestamps.
Provider category strings are labels, not authority enums. Incoming Twitch nulls
on unused action objects are accepted; missing selected action details fail.
Additional wire fields (source-broadcaster/shared-chat provenance and emote or
cheermote decorations) remain in `event`; consumers must extend this schema before
using them as authority. This crate does not serialize these ingress schemas into
the app contract.

## To verify at the live spike

This delivery made no external calls and consulted no online documentation. All
fixtures are generated, labelled simulated, and are schema assumptions rather
than captured Twitch evidence. Verify against current Twitch documentation and
the owner's test channel before wiring these adapters into the live gate:

- AutoMod v2 `held_at`, `reason: automod/blocked_term`, `automod` category/level/
  boundaries, and blocked-term `terms_found` entries with singular `boundary` and
  owner-broadcaster identity. Update requires Approved/Denied/Expired status;
  `reason`, reason detail and `held_at` are validated when present, not fabricated
  when absent. Confirm expiration's moderator identity and optional detail fields.
- Suspicious-user v1 message ID is modeled **inside** `message`, alongside text
  and fragments. Confirm `none/active_monitoring/restricted`, suspicion types
  `manually_added/ban_evader/shared_channel_ban`, evaluation `unknown/possible/likely`,
  and whether any message fragment kind beyond text/emote/cheermote is possible.
- Channel-moderate v2 action vocabulary and selected object shape, especially
  `unraid`, nullable warning `reason`/`chat_rules_cited`, term operations using
  `automod_terms`, and approve/deny unban requests using `unban_request`. Shared
  chat source identities are preserved raw but have no typed authority here.
- Shield begin uses `started_at`, end uses `ended_at`, plus moderator identity.
  Confirm successful Helix response shapes and warning reason limits. These
  mutation adapters return unit and intentionally consume no response state;
  authoritative state will come from typed events/read integration later.
- The real rate-limit headers, unpublished ban/unban/warn caps, token scope
  sufficiency, hold-budget p95 decomposition and Twitch-UI-to-ledger latency.
  Offline results cannot establish the WP 1.2 two-second ledger requirement.

## Live flip

The `spike_*` unit-test modules pair generated **simulated** fixtures with ignored
live observations using the same assertions. No live test was run in this delivery.
Every live twin has `#[ignore = "live: CC_LIVE_TWITCH=1"]` and checks that flag is
exactly `1` **before** reading other configuration, opening the keychain, or making
a request. The fixture guard test supplies strings to a pure function; it never
sets an environment variable. Running the ignored suite without the flag must fail.

For the owner-operated Tuesday spike only: supply `CC_LIVE_TWITCH_CHANNEL` and
`CC_LIVE_TWITCH_TARGET` as the owner's test-channel and test-account **logins**,
and `CC_LIVE_TWITCH_CLIENT_ID` as the registered public application ID. Sign in
through the app beforehand. The only credential source is the existing vault's
`castlecontrol-twitch` / `streamer` keychain entry; no test accepts a token through
arguments, environment, or files. The authenticated user ID must equal the
resolved broadcaster ID and the target must be a different account. The owner
is responsible for choosing their test accounts; ownership is not inferred from
an arbitrary viewer's login.

Commands below assume the owner has explicitly opted in with
`CC_LIVE_TWITCH=1`. This README, code, scripts and CI do not set the flag. Run one
named test at a time, with `--nocapture` to see its instruction and
`--test-threads=1` to avoid conflicting sessions and the three-connection limit.
Connection setup is bounded at 45 seconds (individual broker requests at 15 s);
each requested event/restore waits at most 90 seconds. A missing event fails as
unverified, rather than passing. The three AutoMod update observations therefore
need separate preparation: an Expired event must already be near expiry.

| Assumption | Normal fixture test | Live twin / exact command (owner opt-in required) |
| --- | --- | --- |
| AutoMod v2 `held_at`, `automod` category/level/boundaries; blocked-term singular `boundary` and owner identity | `fixture_automod_hold_v2` | `cargo test -p cc-twitch -- --ignored live_automod_hold_v2 --nocapture --test-threads=1` |
| AutoMod Approved/Denied/Expired; expiration moderator strings; optional reason/details/time stay optional | `fixture_automod_update_v2` | `cargo test -p cc-twitch -- --ignored live_automod_update_v2 --nocapture --test-threads=1` |
| Suspicious v1 nested message ID; status/type/evaluation enums; text/emote/cheermote fragments | `fixture_suspicious_v1`; unknown-enum coverage in `nested_unknown_enums_and_bad_timestamps_are_refused` | `cargo test -p cc-twitch -- --ignored live_suspicious_v1 --nocapture --test-threads=1` |
| Channel-moderate v2 vocabulary, `unraid`, `automod_terms`, `unban_request` | `ui_actions_require_the_selected_detail_not_a_different_action_body`; `nested_term_enum_drift_and_timeout_timestamp_are_not_coerced` | `cargo test -p cc-twitch -- --ignored live_channel_moderate_v2 --nocapture --test-threads=1` |
| Warning nullable `reason` / `chat_rules_cited`; shared-chat source identities retained raw without typed authority | `fixture_warning_nullable_and_source_provenance` | `cargo test -p cc-twitch -- --ignored live_channel_moderate_v2 --nocapture --test-threads=1` (select `warn`; source fields checked only if emitted) |
| Shield begin `started_at`, end `ended_at`, moderator identity; owner toggle and verified restore | `fixture_shield_timestamps` | `cargo test -p cc-twitch -- --ignored live_shield_timestamps --nocapture --test-threads=1` |
| Chat-delay 0/2/4/6 shape, owner toggle and verified restore | `fixture_chat_delay_restore_shape` | `cargo test -p cc-twitch -- --ignored live_chat_delay_restore --nocapture --test-threads=1` |
| Helix success data envelopes, warning IDs, Shield state/time, chat settings, held-resolution 204 | `fixture_helix_success_shapes` | `cargo test -p cc-twitch -- --ignored live_helix_success_shapes --nocapture --test-threads=1` (GET Shield/settings only; mutation-response evidence deferred) |
| Warning reason nonblank, 500 **characters**, truncation of 501 including Unicode | `fixture_warning_reason_limit` | `cargo test -p cc-twitch -- --ignored live_warning_reason_limit --nocapture --test-threads=1` (one owner-issued 500-character warning; observes event shape/echo, not server rejection limit) |
| `Ratelimit-Reset` epoch seconds takes precedence over `Retry-After` seconds; no retry | `fixture_rate_headers`; `rate_limit_reset_is_authoritative_and_missing_reset_does_not_reuse_old_bucket` | `cargo test -p cc-twitch -- --ignored live_rate_headers_and_caps --nocapture --test-threads=1` |
| Real bucket headers and unpublished ban/unban/warn caps | Live-only observation; no invented fixture cap | `cargo test -p cc-twitch -- --ignored live_rate_headers_and_caps --nocapture --test-threads=1` |
| Token scope sufficiency and enabled subscriptions | Live-only observation; existing fake OAuth tests cover transport, not real grants | `cargo test -p cc-twitch -- --ignored live_scope_sufficiency --nocapture --test-threads=1` |
| UI-to-ledger latency and hold-budget stage p95 | No test here | **Measured in the integration package after the spike** (cc-core/Gatehouse); not approximated by transport latency |

For `live_channel_moderate_v2`, also supply `CC_LIVE_TWITCH_ACTION` from the
vocabulary in `spike_session::ACTIONS` (for example `unraid`, `warn`,
`add_blocked_term`, `approve_unban_request`). Repeat for each applicable action;
one observed action does not establish the whole vocabulary. Likewise the
suspicious-user observer validates the received status/types/evaluation, not a
claim that Twitch produced every fixture variant. Some variants need Twitch's
own classification or shared-chat setup and may remain unverified on Tuesday.
The schema rejects unknown fragment kinds/enums rather than silently accepting
them. Shared-chat forward fields remain on the raw notification only.

All moderation mutations are **owner-driven observations**, including warnings,
held-message resolution and the warning-length scenario. Tests issue no warning,
ban, timeout, held resolution, Shield PUT or settings PATCH. Instructions target
only the named test account for user actions. Shield and delay observers read the
initial state, ask the owner to toggle, then ask for restoration and verify both
the restore event and the read-back. If an assertion or wait fails mid-scenario,
the owner must restore the initial state in Twitch UI before continuing. Observers
stop their sockets on exit; they do not call `disconnect` and revoke the login.
They do not write a ledger, save chat, or persist payloads as evidence/fixtures.

Successful **mutation** Helix response evidence (warnings, held resolutions,
Shield PUT, settings PATCH), the server's rejected-warning length boundary, and
actual integration timing are deferred. A UI echo of 500 characters is not proof
that Helix rejects 501; the local adapter already truncates before transport.
The rate observer makes one read, then drains a bounded 90-second owner session.
It reports the broker's bucket limit/remaining/reset and a natural read 429's
computed retry wait if observed. It never drives traffic to find a limit.
Unpublished action caps are **unavailable** unless a natural action-endpoint 429
can actually be observed; UI requests do not pass through this broker, so this
observer cannot infer their caps or raw `Retry-After` header. A read bucket limit
is not an action cap. Raw-header precedence remains fixture evidence until a
natural applicable response is available in integration. No pass threshold is
invented for these measurements. All output is limited to setup instructions,
enum labels and numerical observations, never tokens or chat payloads.

## Acceptance evidence

- `tests::moderation`: exact method/path/query/body fixtures, all delay states,
  both held resolutions/Shield states; success, reset-based 429 and no retry for
  every new call plus ban/unban; successful exhaustion blocks ban/unban/warn.
- `tests::moderation_notifications`: all six topics, enum/version rejection,
  required/nested field failures, blocked-term hold, update statuses, timestamps,
  and wire-to-bridge delivery retaining both typed and raw data.
- `tests::moderation_actions`: selected action details for Twitch-UI actions,
  missing bodies, unknown action/term enums and invalid timeout timestamps.
- `tests::safety::log_grep_captured_output_contains_no_tokens`: actual captured
  TRACE output through all new calls, a credential refresh and echoed upstream
  errors; output is checked for all synthetic access/refresh/device secrets.
- Run `cargo test --offline -p cc-twitch` for the fake-transport suite. The first
  red run rejected the missing moderation schema module (E0583); subsequent runs
  exercise the completed implementation. Repo validation is reported in the
  external build result, including any unrelated baseline failure.

Validated in the delivery worktree: all 38 cc-twitch tests plus its doc test,
`cargo test --offline --workspace`, `cargo fmt --all -- --check`, and
`cargo clippy --offline --workspace --all-targets -- -D warnings` passed.
`node scripts/check.mjs` passed boundaries, hygiene, file-cap (342 files each)
and secrets (449 files). `pnpm --config.verify-deps-before-run=false gate`
failed in the unchanged contract codegen's Cargo spawn with `EPERM`; recursive
typecheck and package lint also failed on Node subprocess spawning. No attempt
was made to bypass the sandbox or change tooling. The Director must rerun the
repository gate (and desktop build gate) where those subprocesses are allowed.

Do not record real chat or tokens as fixtures to complete the live verification.

Live-flip follow-up validation (2026-10-26): the normal offline crate suite passes
48 tests with 10 live twins ignored, plus its doc test. Deliberately running
`cargo test -p cc-twitch -- --ignored` without the flag exits 101: all 10 tests
fail at `live guard: CC_LIVE_TWITCH must be exactly 1; no keychain or network
access attempted`. This expected red proof is kept in the external App Master run
as `ignored-guard-red.txt`, never as a chat/token fixture. Format, offline workspace
Clippy with warnings denied, and `node scripts/check.mjs` pass. Recursive pnpm
typecheck/lint still fail on `spawn EPERM`; `pnpm gate` passes all 14 tooling
fixtures and inventory checks before unchanged contract codegen fails on
`spawnSync cargo EPERM`. The Director must rerun those gates where spawning is
allowed. No dependency install, junction change, live API call, or live flag
assignment was performed.
