# Gatehouse offline verdict pipeline — WP 1.1

This crate adapts Shadowrunr OS `moderator/{rules,mod,lane,store,tests}.rs`
at `7e4b6f8` (Apache-2.0; see the source headers and root NOTICE). Voice and
show logic are excluded. It uses the expanded `cc-types` contract from
`2862f6c` and the existing cc-store API, with no manifest or lockfile changes.

Nothing here registers RPC methods, calls cc-engine, connects to Twitch,
or executes a moderation action. `screen_batch` returns final verdicts and
optional **action intents**; simulated tests do not prove a real Twitch action
occurred. Live execution/acknowledgement is a later integration package,
after the live spike and the owner's M1 sign-off.

## Service and safety

The seven service functions use precisely the existing typed payload pairs:
`rules_list(Empty) -> RulesListResult`, `rules_upsert(RulesUpsertParams) -> Rule`,
`rules_set_mode(RulesSetModeParams) -> Decision`, `ban_confirm(DecisionParams)`,
`ban_dismiss(DecisionParams)`, `decision_undo(DecisionParams)`, and
`petition_resolve(PetitionResolveParams)` (the last four return `Decision`).
Errors use `ErrorEnvelope`. Other public structs are Rust-only ingestion and
evaluation seams, not additional wire identifiers.

Order: ingest every message; detect disclosures and existing care state;
match compiled patterns; classify remaining messages in fenced batches of
at most 50 with a two-second deadline; run the deterministic action gate;
return the final verdict. Disclosure detection reads the full original before
truncation, batching or any future dedupe/shedding. Output preserves input
order. The recall-biased English detector intentionally escalates ambiguous
danger language to the streamer; the finite simulated bank is not a claim of
complete language coverage.

Adapters must obtain `VerifiedMetadata` solely from verified Twitch badges or
event metadata. Missing metadata is the lowest rank; body text cannot grant
authority. The crate has no raw EventSub/RPC ingestion door. Boundary values
are validated with the existing contract; regex compilation is also required
on upsert. New/edited non-rail rules must be shadow rules. Arming is a separate
acknowledged mutation; editing invalidates consent. Existing rails permit only
delivery changes, and their detectors are code-owned.

Unknown/malformed classifier replies, timeouts and failures are held. A missing
action gate is held separately from a gate that found nothing. Shadow candidates
produce `would_act` with no action intent. Care state is outside the model,
survives restart and recording expiry, and remains conservative until the
associated viewer is forgotten or the store is purged. Any integrity/read/write
failure returns an error without a successful verdict or action intent. A caller
must treat errors as withheld; it must never infer pass from absence of output.

Only tagged rule hits increment strikes, scoped by viewer and rule with their
own decay windows. Strike counts reset at restart, matching the pinned source.
Classifier-only rules never auto-ban. Pattern auto-ban requires armed mode,
a committed acknowledgement receipt, its own unexpired grant, an untripped
breaker and an available hourly allowance. Hitting the ceiling persistently
trips the breaker back to human review. When erasure removes a ban's rule
association, its surviving ledger entry counts conservatively against all
grants. Human-confirmed bans also count against the relevant ceiling.

## Persistence and review

`Gatehouse::open(root)` owns one cc-store writer at `root/store` and an atomically
replaced `root/rules.json` for rules/acknowledgements (no viewer messages).
Never share that dedicated root with unrelated cache writers. A later core
integration must route forget/revocation through the same cc-store inventory.

All decisions pass through `record`, the sole `append_ledger` call. Only existing
`LedgerEvent::Decision { decision_id, user_id?, action }` enters the decision
ledger. Private audit metadata is in `Caches`, associated with the viewer's ID;
it includes gate path, parent decision, rule revision and care state, never
original chat text or handles. Coverage joins these records to committed ledger
IDs. Erased metadata/configuration records are explicitly unmeasured, never
counted as clean gates. Metadata written before a failed ledger append is not
considered committed.

Pending ban originals live in `Recordings` with the same decision ID, so normal
retention, forget and purge apply. `pending_bans` and `ban_confirm` fetch that
original, never caller/model summary text. A missing/expired/erased original
cannot authorize a ban. Reviews are single-use; after 120 seconds, or a rule
revision/care/readiness change, confirmation holds instead of proceeding.
Dismissals and supported human reversals/petition outcomes append linked
decisions without editing history. Only timeout/ban actions support reversal;
removed messages cannot be restored. A later live adapter must execute and
acknowledge reversals; this crate performs no network operation.

## Acceptance evidence

Run `cargo test --offline --locked -p cc-gatehouse`. All fixtures are generated
and labelled `simulated`; no recorded viewer chat is used.

| Requirement | Named tests |
| --- | --- |
| (1) Disclosures reach streamer without automatic delete/timeout/ban | `simulated_disclosure_bank_n96_reaches_streamer_without_punishment` — **n=96**, across all three punitive actions; `disclosure_runs_before_classifier_batching_and_truncation`; `obfuscated_or_ambiguous_crisis_language_fails_toward_care` adds six adversarial/ambiguous cases |
| (2) Rails remain fixed; upsert is not consent | `rails_cannot_be_disabled_reclassified_granted_or_replaced`; `upsert_is_not_arming_consent_and_edits_revoke_consent`; `invalid_regex_is_refused_at_upsert_and_does_not_replace_rule` |
| (3) Unknown verdict is withheld | `unrecognised_verdict_and_malformed_classifier_output_are_withheld`; `classifier_failure_is_withheld_instead_of_a_clean_result`; `classifier_timeout_is_withheld_and_not_a_clean_gate` |
| (4) Unavailable gate cannot act; per-path coverage | `gate_skipped_is_not_gate_found_nothing_and_coverage_survives_restart`; `human_and_classifier_paths_are_reported_separately_in_ledger_summary`; `audit_failure_returns_no_successful_verdict_or_action_intent` |
| (5) D7 grant scope, consent, expiry, ceiling, breaker, classifier exclusion | `auto_ban_requires_scoped_logged_unexpired_pattern_grant_and_hourly_ceiling`; `pattern_grant_is_scoped_and_cannot_authorize_another_rule`; `expired_or_tripped_grant_and_classifier_bans_require_human_click`; `erasing_a_viewer_cannot_reset_the_hourly_auto_ban_ceiling` |
| (6) Text does not grant moderator authority | `claiming_mod_in_text_grants_nothing_verified_metadata_does` |
| (7) Durable pending ban preserves original text, ledger IDs only | `pending_ban_survives_restart_with_original_text_and_ids_only_ledger`; `review_timeout_and_unavailable_gate_hold_never_approve`; `expired_original_and_forgotten_viewer_never_produce_a_confirmation` |

Additional tests cover strikes restricted to tagged attempts, independent decay
windows, fenced/capped prompts, stale approvals, consent revocation after purge,
sticky care, dismiss/undo and both petition outcomes. The strike-window and
erasure-ceiling regressions were observed failing before their fixes; the
obfuscated-disclosure case also failed before the recall expansion.

Verification on 2026-10-25, harness base `9c34d41` (contains `2862f6c`):
all **30** gatehouse tests passed. The three `scripts/rust-gate.mjs` modes
passed over 108 Rust source files, including the full workspace test suite.
A process-local child-process launcher replaced the wrapper's online Cargo
override with `--offline --locked`; no checked-in gate script was changed.
Tooling ESLint and boundary, hygiene, file-cap and secret scans passed.
`pnpm typecheck` and `pnpm lint` failed when pnpm's recursive lifecycle runner
received `spawn EPERM`, before package checks could run. These remain failed
validation attempts, not passes; the Director must rerun those merge checks
outside this subprocess restriction. No install or junction modification was
attempted, and no JS/TS source, dependency list or lockfile was changed.
