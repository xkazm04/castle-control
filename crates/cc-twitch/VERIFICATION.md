# WP 0.6 verification

Verified on Windows, 2026-10-25, in the standalone `crates/cc-twitch` library.
No root workspace files were changed. Cargo used an external target directory
under the App Master run directory. The generated crate lockfile was removed
after verification, as required by the brief.

## Commands and final output

Run from `crates/cc-twitch`:

```text
cargo fmt --check
exit: 0

cargo check --all-targets --offline
Finished `dev` profile
exit: 0

cargo clippy --all-targets --offline -- -D warnings
Finished `dev` profile
exit: 0

cargo test --offline
test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
Doc-tests: 0 passed; 0 failed
exit: 0
```

The complete command output is preserved outside the worktree as
`wp-0.6-gates.txt` in run `8a05d331-c9eb-44d6-9286-5f1d07f4289d`.
The root pnpm/workspace gates are owned by the parallel foundation package;
these checks cover every target of this standalone Rust crate.

## Source tests ported

Adapted from Shadowrunr OS `7e4b6f8`,
`crates/shadowrunr-daemon/src/platform/twitch/tests.rs`. The source's show-specific
rank and command parser assertions are replaced with generic viewer metadata
and unchanged chat text. OAuth/Helix/WebSocket behavior remains covered.
All fixture data and credentials are simulated; all servers bind to loopback.

```text
test tests::auth::device_login_polls_through_pending_and_stores_the_token ... ok
test tests::eventsub::eventsub_subscribes_and_maps_chat_dropping_the_bots_own ... ok
test tests::eventsub::badges_map_to_mod_and_tier ... ok
test tests::eventsub::session_reconnect_moves_sockets_without_resubscribing ... ok
test tests::eventsub::a_dropped_socket_reconnects_and_resubscribes ... ok
test tests::helix::actions_hit_the_right_method_path_query_and_body ... ok
test tests::helix::a_401_refreshes_once_then_retries ... ok
test tests::helix::a_429_fails_fast_until_the_reset ... ok
test tests::safety::tokens_never_reach_debug_or_errors ... ok
test tests::auth::disconnect_deletes_the_credential_and_goes_disconnected ... ok
test tests::auth::status_names_a_missing_client_id ... ok
test tests::helix::truncation_keeps_char_boundaries ... ok
```

## Added acceptance coverage

```text
test tests::safety::log_grep_captured_output_contains_no_tokens ... ok
test tests::auth::concurrent_401s_refresh_as_a_single_flight ... ok
test tests::auth::proactive_refresh_runs_before_expiry_without_helix_calls ... ok
test tests::auth::refresh_ahead_jitter_is_bounded_and_not_constant ... ok
test tests::safety::revoked_authorization_completes_purge_before_stopping_workers ... ok
test tests::eventsub::independent_connections_pack_topics_and_reconnect_only_failed_group ... ok
test tests::eventsub::keepalive_timeout_reconnects_and_ping_does_not_extend_it ... ok
test tests::eventsub::subscription_registry_covers_modules_versions_and_capacity ... ok
test tests::eventsub::malformed_subscription_response_never_marks_connection_live ... ok
test tests::helix::dropped_and_malformed_chat_responses_fail_closed ... ok
test tests::auth::device_login_obeys_slow_down_denial_and_expiry ... ok
test tests::safety::reconnect_destinations_and_malformed_envelopes_are_rejected ... ok
```

The dropped-socket source test now restores **all eleven** core/Gatehouse topics,
compares every condition/version against the previous session and checks the
exact tagged `bridge.gap` payload and ordered RFC 3339 UTC timestamps.
The capacity test packs 601 subscriptions as 300/300/1 and refuses more than 900;
the socket integration test proves that only the failed connection resubscribes.

The log test installs an actual trace-level capture, exercises refresh, an
upstream credential-echo error and retirement, and scans the captured bytes for
all simulated access, refresh and device secrets. Nonempty expected log markers
make an empty capture fail the test. The refresh concurrency test runs 24 callers
against a rejected generation and asserts exactly one refresh request.

The revocation test makes the purge callback yield, then asserts it completed,
the credential was deleted, connection states stopped, later calls were refused,
and a second disconnect did not repeat an already-completed purge. An HTTP
refresh rejection also exercises the same purge path in the source error test.

## Red-to-green findings

The first complete test run had 20 passes and three failures. The yielding
revocation test exposed cancellation of the purge future by its own watch signal;
notification now follows cleanup. The near-expiry test exposed loss of fractional
seconds when restoring expiry; scheduling now uses precise remaining milliseconds.
The log scan initially had an empty scoped capture for spawned tasks; the test
now captures the actual global dispatcher at trace level. The final run passes
all 24 tests.

## Integration limits

Native keyring configuration resolves with Windows, macOS and Linux backends.
This run compiled and tested Windows; native macOS/Linux keyring access is not
claimed. Tests never touch any OS keyring. WP 0.3 supplies the mandatory durable
`RevocationHandler::purge_all` implementation, and cc-core adds its event envelope
and routes ingress through Gatehouse. WP 0.7's real-channel spike remains a
separate owner-attended package; no live Twitch action was attempted here.

## WP 0.6 follow-up: non-revoking forced socket drop (2026-10-25)

Reconciled against local `main` at `cd62f5c`. The only cc-twitch delivery was
`3e325fb`; it already recovered from network drops but exposed no fault-injection
primitive. This follow-up changes only `crates/cc-twitch/`, with no dependencies
added and no lockfile edits.

Enable the empty `fault-injection` Cargo feature to call
`TwitchBridge::force_socket_drop()`. Unit tests also enable the implementation
through `cfg(test)`. The method signals all active EventSub connection attempts;
each socket-owning future is dropped and the existing error/backoff loop handles
reconnection and every subscription. It does not abort the session or credential
maintenance task, or call the vault, store or revocation handler. An idle request
is not queued for a future session. Explicit `disconnect()` is unchanged.

`status().last_gap` is an optional cc-twitch `ConnectionGap { from, to }`, retained
for ordinary network recovery as well as injected faults. Recording and channel
delivery are serialized after reserving event capacity, so a read after delivery
sees the gap and simultaneous workers preserve the last emitted window. Absent
values are omitted in serialized status. This is a crate-local payload; WP 0.7
maps it to cc-types and enables the feature in cc-core in its own delivery.

Acceptance evidence uses the existing simulated HTTP/WebSocket harness:

- `forced_drop_restores_every_subscription_without_retiring_credentials` drops
  twice through the public handle, checks socket closure before keepalive expiry,
  compares every one of eleven subscription bodies after each reconnect, checks
  ordered RFC 3339 gap timestamps and the exact retained window, and proves chat
  and authorized Helix calls still work. The in-memory credential remains, vault
  loading succeeds, its revocation signal stays false, upstream revoke calls are
  zero, and both purge counters stay zero. A subsequent explicit disconnect
  revokes once, deletes the credential, purges once and resets status.
- `forced_drop_cancels_all_packed_connections` exercises three simultaneous
  sockets, restores the complete subscription multiset, checks one gap per socket
  and compares status with the last emitted gap.
- `forced_drop_while_idle_does_not_retire_or_poison_the_next_session` verifies
  no credential loss or deferred fault when no socket worker is active.
- `a_dropped_socket_reconnects_and_resubscribes` now also compares retained and
  emitted gaps for a real simulated transport loss.
- Existing `disconnect_deletes_the_credential_and_goes_disconnected` and
  `log_grep_captured_output_contains_no_tokens` remain unchanged and pass.
- The default API doctest must fail with E0599 when calling the method on
  `TwitchBridge`. With the feature enabled, its companion doctest compiles the
  same call successfully. These exercise the external public API without
  `cfg(test)`; unit tests separately prove its test-only availability.

Red first: `cargo test --locked -p cc-twitch tests::fault` failed with E0599
(missing method) and E0609 (missing last_gap). After implementation all three
fault tests pass. `cargo build --locked -p cc-twitch --no-default-features` and
`cargo clippy --locked -p cc-twitch --all-targets --features fault-injection --
-D warnings` exit 0. `cargo test --locked -p cc-twitch --features fault-injection`
passes all 27 unit tests and the feature-enabled external API doctest.

No live Twitch access, credentials, owner step or cc-core change is claimed.

Final workspace checks (CARGO_BUILD_JOBS=6):

```text
pnpm install --frozen-lockfile: exit 0; lockfile up to date
node scripts/rust-gate.mjs fmt: [cargo fmt] walked 51 files; exit 0
node scripts/rust-gate.mjs clippy: [cargo clippy] walked 51 files; exit 0
node scripts/rust-gate.mjs test: [cargo test] walked 51 files; exit 0
58 workspace tests passed, plus the default API compile-fail doctest
```

The full gate is **not green in this sandbox**. `pnpm gate` exited 1 after
`[workspace manifests] walked 3 files` and `[workspace TypeScript] walked 25 files`:
the existing contract generator's `spawnSync cargo` was denied with EPERM.
Independent `pnpm -r typecheck`, `pnpm lint` and `pnpm -r test` also exited 1
when pnpm's recursive lifecycle process spawn was denied with EPERM, before
package checks ran. These failures were not bypassed or treated as passes.
The failing gate/codegen sources are unchanged against both this worktree's
base `cd62f5c` and the later local main `713a854`; the schema exporter does not
depend on cc-twitch. No TypeScript, gate script or contract source was edited.

Before recursive lint stopped, its tooling checks passed with these inventories:

```text
[tooling eslint] walked 11 files
[workspace manifests] walked 3 files
[workspace TypeScript] walked 25 files
[boundaries] walked 103 files
[hygiene] walked 103 files
[file-cap] walked 103 files
[secrets] walked 167 files
```

Full output is preserved in `pnpm-gate.txt`, `rust-fmt.txt`, `rust-clippy.txt`,
`rust-tests.txt`, `typecheck.txt`, `lint.txt`, `tests.txt`, `default-build.txt`,
`feature-clippy.txt` and `feature-tests.txt` outside the worktree in App Master
run `eb1abff4-817c-42a8-b71d-571eadb0a5e5`. App Master must rerun the full pnpm
gate in its normal execution environment; this delivery reports partial until
those checks can complete.
