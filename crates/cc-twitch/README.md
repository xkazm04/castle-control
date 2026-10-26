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
