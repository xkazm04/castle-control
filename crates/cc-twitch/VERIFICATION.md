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
