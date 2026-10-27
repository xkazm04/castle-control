# Gatehouse offline moderation, governor, consensus and replay — WP 1.1, 1.3, 1.5, 1.6

## Offline RPC integration — WP 1.5/1.6, 2026-10-27

`cc-core::GatehouseModule` registers `gatehouse.recording.import`,
`gatehouse.drill.run`, `gatehouse.drill.diff` and `gatehouse.consensus.get`
using the existing typed contract. Its async mutex serializes the service's
sole store writer. Native fixture registration retains its arming refusal.
No live adapter, model, dependency or wire identifier is added.

The service owns the Drill and Herald. Offline drill configuration uses bank
`simulated-near-misses-v1` and judge label `rules-only`. This label selects the
existing deterministic `ExpectedJudge`: it compares observed actions with the
immutable generated bank, with model identity `none`, and calls no model.
Unknown judge labels (including model judges) and classifier rules return typed
`Unavailable`, on either diff side, before evaluation. Unknown banks retain
the existing `NotFound` error. No model verdict or evaluation is invented.
Runs remain `simulated`, retain source/gaps and hash the resolved instrument.
Diffs retain separate instruments, outcomes and summaries. Neither replay nor
import writes live decisions or populates the consensus chart.

`recording_import` borrows the existing Recorder/store; imports have no
authenticated channel owner, so they associate only the recorded viewers with
the erasure inventory. The live Recorder still includes its supplied owner.
Recording references remain opaque canonical `recording-<ULID>` handles:
resolution queries only this service root's store and enforces retention.
Absolute paths, traversal, absent handles and another root's handles return
typed `NotFound`. A source label is inert provenance, never a file to read.

`consensus_ingest` accepts only the existing post-verdict `PassedMessage`
token. A later adapter must obtain it through `ScreenedMessage::for_consensus`;
no live intake is wired here. The service Herald starts with no assumed seeds
or emote meanings, a 900-second maximum query window and 4,200 retained entries.
Only observed intake can populate its Other direction; a fresh root is empty.
`consensus_get` delegates to Herald at the service clock, retaining filter,
history and shedding semantics, including a nonzero shed count with no current
directions. History and shedding are ephemeral and reset on service reopen.

Acceptance evidence: `cc-core/tests/gatehouse_drill.rs` covers import, identical
repeat/reopened runs, preserved provenance/gaps, unchanged live ledger, separate
diff summaries, unavailable models/classifiers, root-scoped references, empty
consensus for every filter, and retained offline arming refusal. All five tests
failed first against base `e058bd2` with `method is not registered yet`.
`cc-gatehouse/tests/analysis.rs` covers service-owned post-verdict intake,
clock-ended windows, expiry and shedding after all directions expire.

Validation on base `e058bd2`: `cargo fmt --all -- --check`, workspace Clippy
with `-D warnings`, and the once-run `cargo test --locked --workspace` passed
(415 passed, 30 ignored). Final narrowed core and Gatehouse regression runs
passed (12 core tests, 26 Gatehouse tests). Boundaries, hygiene and file-cap
checks walked 514 code files; final secrets scanning walked 645 files; all
passed, as did `git diff --check`.
The full `pnpm --config.verify-deps-before-run=false gate` passed tooling and
workspace inventories, then failed at contract export with `spawnSync cargo
EPERM`. Recursive pnpm typecheck, lint and test each failed at lifecycle
`spawn EPERM`; the desktop JS build was not run. Those scripts, manifests and
contract sources match the base, and the earlier evidence below records the
same restriction. No install or permission workaround was attempted. Full gate
status remains failed until the Director reruns it where Node may spawn children.
Actual outputs are retained in the external build run's `gate.log`,
`typecheck.log`, `pnpm-lint.log`, `pnpm-test.log`, `clippy.log`,
`workspace-tests.log`, `core-focused.log` and `gatehouse-focused.log`.

This crate adapts Shadowrunr OS `moderator/{rules,mod,lane,store,tests}.rs`
at `7e4b6f8` (Apache-2.0; see the source headers and root NOTICE). Voice and
show logic are excluded. It uses the expanded `cc-types` contract from
`2862f6c` and the existing cc-store API, with no manifest or lockfile changes.

Nothing here registers RPC methods, connects to Twitch,
or executes a moderation action. `screen_batch` returns final verdicts and
optional **action intents**; simulated tests do not prove a real Twitch action
occurred. Live execution/acknowledgement is a later integration package,
after the live spike and the owner's M1 sign-off.

## Offline governor — WP 1.3

`governor::Governor` is a pure, clock-injected state machine. Construct it with
an explicit `GovernorConfig` and the existing `cc_store::Clock`. Thresholds,
the count margin, the nonzero hysteresis interval, the nonzero lease duration
and the four tier plans are supplied in process; no live policy is assumed.
These Rust-only types have no serialization or wire schema. The existing
`cc_types::Tier` and `RoomMode` are reused, and `gatehouse.lease.end` remains
`Pending` in the method table. No contract identifier or dependency is added.

Call `observe_chat` with final screened messages, then `tick` periodically,
including during silence. Only matching, passed moderation results count.
The census deduplicates Twitch IDs over `(now - 600 s, now]`, uses event time,
ignores stale arrivals and never lets delayed duplicates shorten presence.
Future messages and clock rollback are refused. Census IDs stay private and
ephemeral; no chat content or handle is retained by the governor.

The S/M, M/L and L/XL borders have an absolute chatter margin in both directions.
A candidate must continuously clear the margin for the whole hysteresis
interval, so successive transitions are at least that interval apart. A gap
that invalidates the population resets the pending window. A large sustained
change may skip intermediate tiers. The governor does not act on a person.

Each tier activation can propose each configured setting once. Proposals cover
slow, followers-only, emote-only and unique-chat settings, always with an expiry.
They are **intents**, never executed. Ticks expire leases without chat; they do
not renew leases automatically. Existing leases keep their original deadline
across a tier change; a new tier's setting waits until that deadline. End intents
precede new Apply intents. A later integration must retain the room's baseline
and acknowledge application before interpreting End as a restoration.

`observe_human_change(mode)` yields that setting without extending its lease.
The observer must distinguish human changes from echoes of its own proposals.
Yielded leases issue no End that could undo a human's replacement. After expiry,
a waiting new tier plan may propose the setting again; the same tier activation
does not. A human change without an active lease suppresses the current tier's
pending proposal. `leases()` is a snapshot; expiry is processed by `tick`, with
no background task, Twitch executor, network request, persistence or RPC.

Acceptance evidence is in `tests/governor.rs` (14 simulated tests): the seeded
4,001-second oscillation crosses both margin edges repeatedly and asserts at
least 30 seconds between changes; all four lease kinds expire under an advanced
fake clock; human overrides survive tier changes and late ticks; census tests
cover distinct users, held/barred input, mismatched decisions and delayed events.
The exhaustive intent/setting match and a compile-fail doctest prove the output
cannot carry a user ID or punitive action. Subsecond lease deadlines are retained.
All fixtures are generated and simulated.

Behavioral red proof: temporarily setting the dwell requirement to zero made
`tiers_cross_margins_only_after_a_continuous_window` fail at its first assertion
(`M` instead of `S`, exit 101). The original condition was restored before the
green run. No seeded defect remains.

Validation on 2026-10-26, base `befdf88` (local main had no governor):

- `cargo fmt --all -- --check` and
  `cargo clippy --offline --locked --workspace --all-targets -- -D warnings`
  passed. Boundaries, hygiene and file-cap checks walked 314 files and passed;
  final secrets scanning walked 418 files and passed.
- Final narrowed `cargo test --offline --locked -p cc-gatehouse` passed **79
  tests**, including the 14 governor tests and its compile-fail doctest. Actual
  output is in the build run's external `gatehouse-tests.log`.
- The one full `cargo test --offline --locked --workspace` run failed at the
  unchanged `cc-engine/tests/lifecycle.rs:75`,
  `silence_timeout_reaps_child_and_releases_the_process_permit` (`refused`
  instead of `model`). Its isolated rerun passed. cc-engine does not depend on
  cc-gatehouse; no engine fix was made. The workspace run remains failed and
  its output is in the external `rust-workspace-tests.log`.
- Recursive pnpm typecheck and lint each failed before checks with lifecycle
  `spawn EPERM`. `pnpm --config.verify-deps-before-run=false gate` passed its
  14 tooling fixture tests and workspace inventories, then failed at the
  unchanged contract exporter's `spawnSync cargo EPERM`. The gate/exporter,
  engine, manifest and contract sources match the base. Package tests and the
  desktop build were not reached. No install or subprocess-policy workaround
  was attempted; the node_modules junction was left intact.

Delivery is partial until the Director obtains the green full gate outside
the Node subprocess restriction and rechecks the existing lifecycle timeout.
No outside-scope path, wire identifier, live integration or owner action is
needed for this offline module.

## In-process engine classifier

`EngineClassifier::new(engine, store, vault, key_label)` implements `Classifier`
using cc-engine's completion path. Supply an already configured engine, a dedicated
cc-store audit writer, the host's `Box<dyn Keychain>` broker and an optional key
label. Never open another writer at that store root. No additional settings,
wire identifiers or dependencies are introduced.

The adapter always requests the `live` role class: the two-second moderation
deadline determines the class, rather than the presence of a message batch.
Both engine routing and the spawn door refuse CLI calls on this class. Measured
endpoint/model admission, cloud opt-in, the fallback ladder and engine auditing
are unchanged. The system instructions and fenced prompt are passed together;
neither the prompt nor credentials are logged. Local endpoints receive no key.

An async mutex owns the engine and audit writer. Engine's Windows completion
future includes non-Send CLI custody types even for endpoint calls, so the adapter
polls it locally on a Tokio blocking worker without changing those types. Lock
waiting remains within the lane deadline. A started live attempt can finish and
audit after caller cancellation, but its dropped result cannot authorize an
action; the writer remains locked through that audit.

Hit arrays use the existing classifier parser via `AnswerShape::Custom` instead
of the engine's default single-verdict object check. The lane then checks batch
membership, rule IDs and duplicate hits at the same parser door. Invalid output
is held. `RulesOnly` and `Refused` return sanitized classifier errors, never model
text. Decisions record `classifier_unavailable` and `rules-only` or `refused`;
an engine audit error records `engine_audit_failed` and produces no classifier
action. Pending classifier candidates have no deterministic verdict, so this
adapter requests no invented fallback verdict and engine failures normally refuse.
Coverage retains `withheld`, `gate_skipped` and `gate_found_nothing` separately.
Care detection still precedes classification, and disclosures never enter its
prompt.

Offline integration evidence (`cargo test --offline --locked -p cc-gatehouse
--test engine_classifier`): model hits become typed actions only through the
gate; endpoint failure is labelled refused; malformed and unknown output is
held; disclosures reach a human across model/failure outcomes; audit failure
suppresses a valid hit; unmeasured models refuse without a request; both fallback
labels are recorded; concurrent callers serialize the audit writer. Fake endpoints
use ephemeral loopback ports and simulated data, never an external model or real
CLI. The rules-only mapping also has a direct adapter unit test.

Integration validation, 2026-10-26: all ten new tests passed (eight Gatehouse
integration tests, its adapter unit test and the engine shape test). Temporarily
restoring `AnswerShape::Verdict` made
`model_batch_becomes_typed_hits_through_existing_parser_and_gate` fail with
`Withheld` instead of `ClassifierAction`; the custom shape was restored before
the green full run. `cargo fmt --all -- --check`,
`cargo clippy --offline --locked --workspace --all-targets -- -D warnings` and
`cargo test --offline --locked --workspace` all passed. File-cap and secrets
checks also passed. Recursive pnpm typecheck and lint each failed at lifecycle
spawn with `EPERM`; package tests were not run. The Director must rerun the full
pnpm gate outside this restriction. No package install was attempted.

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

## Herald's chart — WP 1.5

`ScreenedMessage::for_consensus()` is the only public constructor of
`herald::PassedMessage`. It returns nothing for held/barred messages or mismatched
message IDs. The token carries only timestamp/text: no decision, intent or action
capability. `Herald::ingest` consumes it, and `Herald::get` returns the existing
`ConsensusGetResult`. Neither chart module imports the live service, lane,
executor, store or engine. `chart_module_has_no_action_or_live_service_surface`
checks those module boundaries; `real_gate_verdict_prevents_barred_chart_intake`
uses an actual simulated Gatehouse verdict.

A host supplies direction keys/labels/keyword seeds, emote-to-meaning entries,
a local deterministic `LocalEmbedding`, maximum query window, retained-message
capacity and start time. `HashedWords` is the offline default: 256-bin hashed
word counts and cosine similarity to seeds. This is lexical grouping, not a
claim of model-quality semantic understanding. Ties follow sorted direction
keys; zero similarity goes to `other`. No downloads, model or network are used.
Unicode emotes and ordinary emote names are supported. Text and emote meanings
are separated before grouping: `all` combines them; `text` uses ordinary words;
`emotes` uses meanings; `emote` uses the chosen emote's meaning. Each eligible
message contributes once per filter, including repeated emotes in one line.

Windows are `(at - window_s, at]`, including subsecond timestamps. Queries and
intake require monotonic time; oversized windows fail rather than returning
partial history. Series points are sorted change points (arrivals and exits),
plus the window start/end, each computed using the same trailing window as the
current share. History retains `max(2 * max_window_s, max_window_s + 180)` seconds
so early series points and the three-minute baseline keep their context.
`delta_3m` is a fraction difference and is omitted until a complete baseline
window exists. Shares describe retained eligible messages, not the shed ones.

When retained capacity is full, intake records timestamped shedding counters
for all/text/emotes/each emote, without keeping raw text. The query reports the
matching window/filter count even when there are no directions. Expiry releases
capacity; it does not rewrite old events. The chart is descriptive only.

## Recorder and drill — WP 1.6

`Gatehouse::recorder(owner_id, installed_at)` borrows its existing store writer.
`record_live(source, messages, gaps)` captures immutable batches supplied by the
authenticated channel adapter, rejects pre-installation input, and registers
actual login aliases for erasure. `import(RecordingImportParams)` accepts inert
logs, not a URL/path or authority claim. Both return `RecordingImportResult`;
`resolve` accepts only a service-minted `recording-<ULID>` found in cc-store's
`Recordings` inventory. No new persistent tables, files or store roots exist.
The host owns channel authentication and batch scheduling; RPC registration is
intentionally absent.

Each batch is associated with its channel owner and every included viewer.
Imports without usernames get collision-checked ID-derived aliases; existing
real-login aliases remain usable. Erasing any associated viewer conservatively
removes the entire batch. The oldest message/gap timestamp governs expiry, so a
batch can disappear early but cannot preserve older chat beyond retention.
Imports outside retention, future dates, duplicate message IDs, unordered
messages and reversed gaps are rejected. Resolution checks the store's own
retention preview even before its existing scheduled reaper runs. Forget,
retention and authorization-revocation purge therefore invalidate references.
Source labels and gaps remain in the recording and every replay/diff side;
every outcome also retains its source. Imports never assert the stored content
is simulated merely because they will be replayed; replay output always says
`simulated`.

`Drill::run` and `Drill::diff` consume the existing typed params and resolve
retained recordings. A private evaluator reuses disclosure detection, pattern
normalization/compilation, strikes and the fenced classifier/parser, with a
two-second classifier deadline. It has no live Gatehouse instance, executor or
ledger writer. Rule modes describe hypothetical behavior; bans remain held
because imported logs cannot manufacture human consent. Crisis care precedes
classification and persists within a replay. Recording gaps are preserved, and
messages inside them are not evaluable. Missing verified badges/consent are
never invented. This offline delivery does not claim the live M1 exit passed.

Banks and judges are service-registered immutable configuration labels. A
`BlindJudge` sees the message, case rubric and observed outcome, never host rules
or prompts. Its resolved identity includes model, tier, rubric, revision and
parameters, and registration refuses the subject's configured tier. The host
must supply that tier accurately. `ExpectedJudge` is an offline baseline;
production judging is an injected adapter. A valid judgment must quote text
actually present in the message. A nonmatching quote is not evaluable. Pending,
void, not evaluable and engine failure never produce an invented pass.
`acted` denotes a completed evaluation observation, never proof of a Twitch
execution; unknown ambient stimuli remain `not_provoked`.

Every run carries SHA-256 component hashes and their canonical combined hash.
Rules are validated and sorted by ID; canonical JSON sorts object keys while
preserving array order. Hashes cover the resolved bank's cases/calibration,
resolved judge settings, rule snapshots and actual host/system prompts. The
prompt instrument also includes normalized source digests of the evaluator,
classifier, rules and scoring logic, so implementation changes split the
instrument automatically. The dependency-free SHA-256 implementation has
standard empty, short, padding-boundary and million-byte known-answer tests.

`Drill::verify` recomputes these hashes against resolved inputs, checks source,
message alignment and gaps, and recomputes summary arithmetic. Passes are direct
observations. Over-moderation independently counts validly evaluated safe-bank
cases and the ones receiving an action or non-pass verdict. Only verified runs
can enter `merge_runs`; different sources/instruments or duplicate IDs refuse to
merge. A diff preserves both complete instruments/summaries and reports changed
observations even when their named state stays the same.

`simulation::generate` adapts the pinned Shadowrunr SplitMix64 generator. Its
seeded IDs, text selection and one-second cadence are reproducible. The supplied
bank includes requested roasts, dark jokes, fictional quotations and a violation.
Its uniform mixture/cadence are explicitly labelled assumptions; these fixtures
are not evidence about a real audience. New feature tests use generated simulated data,
offline classifier fakes and local judges, with no new dependency or network.

### WP 1.5/1.6 acceptance evidence

- Intake/action boundary: `barred_and_held_messages_have_no_chart_intake_token`,
  `real_gate_verdict_prevents_barred_chart_intake`,
  `chart_module_has_no_action_or_live_service_surface`.
- Chart semantics: `filters_count_messages_once_and_separate_text_from_emote_meaning`,
  `window_is_left_open_right_closed_and_expiry_appears_in_series`,
  `delta_is_fraction_difference_with_complete_baseline_history`,
  `shedding_reports_matching_window_even_with_no_directions`,
  `subsecond_shedding_uses_exact_same_window_as_messages`,
  `historical_series_keeps_the_context_of_its_earliest_window`,
  `chart_series_is_stable_under_seeded_offline_replay`.
- Named states, direct passes and ledger isolation:
  `all_six_states_count_observations_directly_without_live_ledger_writes`.
- Instruments/arithmetic/merge:
  `instrument_hashes_cover_resolved_contents_and_verify_arithmetic`,
  `only_verified_disjoint_same_instrument_runs_can_merge`,
  `canonical_rule_order_and_default_care_are_stable_without_authority_from_text`.
- Separate over-moderation and diff sides:
  `diff_keeps_instruments_and_summaries_separate_and_reports_over_moderation`.
- Provenance, gaps, retention and erasure: `recorder.rs` integration tests and
  `gaps_stay_gaps_and_are_never_scored_as_clean`.

Regression proof: temporarily admitting barred messages at `for_consensus` made
`barred_and_held_messages_have_no_chart_intake_token` fail (exit 101). The original
check was restored in a `finally` block before the green focused run. No seeded
violation remains.

Validation on 2026-10-26, base `5073b63`:

- `cargo --offline fmt --all -- --check` and
  `cargo --offline clippy --workspace --all-targets -- -D warnings` passed.
- `cargo --offline test -p cc-gatehouse` passed **64 tests**, including the
  **24 new integration tests** and SHA-256 known-answer test. This is the final
  narrowed Rust run; its actual output is in the build run's `gatehouse-tests.log`.
- `cargo --offline test --workspace` exited 101 at the unchanged
  `cc-engine/tests/lifecycle.rs:75` test
  `silence_timeout_reaps_child_and_releases_the_process_permit`: expected `model`,
  received `refused`. That test's 300 ms silence ceiling is in the base source;
  cc-engine has no dependency on cc-gatehouse. Its isolated rerun passed. The
  workspace run is still recorded as failed, with no out-of-scope fix or second
  full run. Actual output is in the build run's `rust-tests.log`.
- `pnpm --config.verify-deps-before-run=false gate` passed all 14 tooling fixture
  tests and workspace inventories, then failed at the unchanged contract
  exporter's `spawnSync cargo EPERM`, before package checks. A process-local
  preload forced Cargo `--offline --locked` and removed the online override;
  no checked-in gate script changed. Actual output is in the build run's
  `gate.log`. Recursive pnpm typecheck, lint and test each independently exited
  1 at lifecycle `spawn EPERM`; these checks remain failed, not skipped/passed.
- Boundaries, hygiene, file cap and secrets checks passed (281 code files,
  378 scanned files). Manifests, lockfiles and other package paths are unchanged.

The Director must obtain a green full gate outside the Node subprocess
restriction and recheck the existing lifecycle timing failure before merging.
No install, git write, live executor, RPC wiring or external service was used.


## Offline gate domain ? WP 1.2 (2026-10-26)

Reconciled against `cffdd1a`: `48418f2` supplies payloads, `cffdd1a` supplies
transport/parsers, and `9a27a64` supplies the governor; no gate domain existed.
`src/gate/` adds no dependency, wire identifier, RPC, network call or executor.

`automod_hold` persists originals through cc-store and the existing single
ledger append. `held_queue` displays original text. `held_resolve` accepts
`HeldResolveParams` and an injected confirmation future receiving that original.
Confirmed allow/deny records released/removed; timeout records held and keeps
the queue open across restart. Failed confirmations preserve existing error
codes and retry_after_ms. Unavailable gates, erased/expired originals and
already-resolved roots cannot proceed. Each valid attempt writes one decision.
Duplicate holds are idempotent; identity/text mismatches fail.

Delay/Shield preparation uses cc-types payloads plus a verified local GateActor.
Only matching confirmations change applied state, after audit succeeds. Pending
changes are bound to this service/revision; external observations invalidate
stale echoes. Initial/restarted state is unknown until refreshed. Retained audit
metadata associates the real operator/viewer IDs for cc-store erasure; originals
stay under retention and audit caches contain no chat text. No inventory changes.

Moderation events synchronously enter gate_roll as external, human-authored,
with no rule/model attribution or action intent. Unknown kinds record a held
unrecognised entry and grant no authority. Observed external allow/deny is still
audited if intake was missed; known roots are linked without inventing text.
Erasure of a completion association cannot reopen local resolution authority:
it fails needs_human until reconciled. Room-mode observations require the
existing Governor and reuse observe_human_change, preserving expiry/yield.
Delay/Shield are not governor-owned modes. LeaseEndParams remains unregistered;
the service-side lease ownership completion is described below.
Suspicious messages always reach human review with original text, held verdict,
no automatic action and no consensus intake, even with armed punitive rules.

HoldBudget decomposes Twitch delay + scheduling wait + admission + rules + model
+ gate. screen_batch_measured accepts host-observed upstream spans and measures
local rules/disclosure/care lookup, classifier round trip including reply parsing,
and final gate/audit with Instant. Batch members share model latency. Existing
screen_batch keeps its return type. Summaries use stagewise nearest-rank p95,
include n, refuse empty samples, and are not a p95 of total latency.

Measured 2026-10-26 using
`cargo test --offline -p cc-gatehouse --test gate_budget seeded_simulated_stream_records_all_six_stage_p95s -- --nocapture`:
seed 1202, n=128 simulated messages, one message/batch, fake classifier, local
SQLite/JSONL. Recorded p95 in microseconds:

| Stage | p95 (us) | Evidence |
| --- | ---: | --- |
| Twitch delay | 2000000 | Configured simulated 2-second delay, not network timing |
| Scheduling wait | 0 | No host scheduler in this harness |
| Admission | 0 | Fake classifier has no admission queue |
| Rules | 23201 | Measured local work |
| Model | 23 | Measured fake classifier, not LLM latency |
| Gate | 24085 | Measured local gate and durable audit |

These are one run's numbers, not thresholds or live evidence. At the Tue 10-27
spike, check cc-twitch README's wire assumptions, distinguish own echoes from
human changes, measure real upstream/model spans and Twitch-UI-to-ledger latency,
and verify rate limits. Offline tests do not establish the live two-second exit.

Evidence: 22 new tests in tests/gate_{held,settings,events,erasure,budget}.rs.
The initial held test failed for missing methods before implementation. The
complete final Gatehouse suite and crate Clippy passed, including the unchanged
governor typed/no-registration assertion and doctest. Workspace Clippy and the
once-run Rust workspace suite passed; the final event refinement then passed
another full Gatehouse suite and crate Clippy. Format, source/secrets gates and
desktop build passed. pnpm gate passed 14 tooling tests/inventories then failed
in unchanged codegen (spawnSync cargo EPERM); recursive typecheck, lint and test
independently failed with lifecycle spawn EPERM. Base cffdd1a documents the same
restriction; git diff confirms tooling, packages, apps and lockfiles unchanged.
No install, preload or bypass was used. The external result is partial until
the Director reruns these pnpm checks where Node subprocesses are permitted.

## WP 1.2/1.3 service completion (2026-10-26)

Reconciled against `3afe0a4`: `held_resolve` is already delivered. Its existing
`gate_held.rs` tests cover allow -> released, deny -> removed, timeout retaining
the durable held root, and confirmation errors preserving both the root and
`retry_after_ms`. That implementation and its tests are unchanged.

`delay_set(params, actor, response_budget, confirm)` and `shield_set(...)` add
one-call async service seams over the public prepare/confirm pairs. Their
confirmation closures receive the typed params and return the typed result.
An unavailable gate or zero budget returns `Unavailable` without dispatch.
Before dispatch, each method clears its applied state and rotates its epoch:
older preparations must not revive a potentially changed setting. Only the
existing matching, service-bound, audited confirmation publishes `Some` state.
Timeout returns `Unavailable`; confirmation errors retain their original code
and retry interval. Timeout, error, mismatched confirmation, cancellation or
failed audit leaves the dispatched setting unknown (`None`), never guessed.
The lower-level prepare/confirm pairs retain their previous semantics.

The governor mints a `LeaseId` on issue and exposes it on `RoomLease` and both
room intent variants. `register_governor_leases(&governor)` registers those
service-issued leases with Gatehouse; call it after each tick and before
dispatching room intents. The registrations share only lifecycle flags with
the governor, so a human change invalidates permission immediately, without
another registration. `lease_end(params, actor, response_budget, confirm)`
passes a room-only `RoomModeIntent::End { lease_id, mode }` to the async fake or
future adapter. Unknown/ended IDs fail `NotFound` or `Conflict`; yielded leases
fail `Conflict` before dispatch. Gate unavailability and zero budget fail
`Unavailable`. Timeout, confirmation failure or audit failure retains the
registration for retry and records no completed end. Only confirmed, audited
success writes `ModeChanged` for `configuration`, without a viewer subject,
then removes the registration and marks its shared lifecycle ended.

Confirmed ends disappear from governor snapshots and cannot fire again at the
original deadline or be re-registered. Expiry still emits one End intent and
clears the active snapshot; the governor retains at most one pending end per
mode so late human changes also block delayed confirmation. A replacement lease
invalidates the previous pending End, which must never disable the replacement.
Retired lifecycle handles are pruned when registering. A restart starts with no
known lease ownership; the host must re-establish it rather than guess.

Acceptance evidence:

- `gate_service_settings.rs`: all supported values, no-dispatch readiness and
  zero-budget checks, timeout/error unknown state, preserved rate limits,
  mismatches, invalidated old epochs and failed-audit non-publication.
- `gate_lease.rs`: room-only confirmed decision/ledger, unknown/unregistered and
  already-ended refusal, no resurrection, yielded refusal without snapshot
  refresh (including after expiry), timeout/error retry, readiness/zero-budget
  refusal, human changes during confirmation, expiry ID continuity, restart
  refusal, replacement protection and failed-audit retention.
- `governor.rs`: existing 13 state-machine tests, with unique IDs and matching
  Apply/snapshot/End IDs added. The existing exhaustive room-only and deferred
  registration test moved to `governor_boundaries.rs` to preserve the file cap.

The initial `cargo test --offline --locked -p cc-gatehouse --test
gate_service_settings` failed with E0599 for the missing one-call methods;
the implementation then passed all 15 new service tests and 14 governor tests.
This delivery adds no dependency, RPC registration, Twitch call or executor,
and does not establish a live spike or M1 exit.

Final validation on 2026-10-26:

- `cargo fmt --all -- --check` and `cargo clippy --offline --locked --workspace
  --all-targets -- -D warnings` passed.
- The once-run `cargo test --offline --locked --workspace` passed: 401 tests,
  29 ignored (including live probes). Final narrowed `cargo test --offline
  --locked -p cc-gatehouse` passed all 116 tests, including its doctest. Actual
  outputs are in this build run's external `workspace-tests.log`,
  `gatehouse-tests.log` and `clippy.log`.
- `node scripts/check.mjs` passed boundaries, hygiene, file cap and secrets;
  code inventory was 403 files. `git diff --check` passed.
- `pnpm --config.verify-deps-before-run=false gate` passed the 14 tooling tests
  and workspace inventories, then failed at unchanged contract codegen with
  `spawnSync cargo EPERM`. Recursive pnpm typecheck, lint and test each failed
  at Node lifecycle `spawn EPERM`. Logs are external `gate.log`,
  `typecheck.log`, `pnpm-lint.log` and `pnpm-test.log`. These are failures, not
  passes or skipped checks. Tooling, packages, manifests, lockfiles, apps,
  cc-core, cc-types and cc-twitch match base `3afe0a4`; the existing README
  evidence above records the same sandbox restriction. No install, preload,
  permission workaround or git write was attempted. The Director must rerun
  the pnpm checks in an environment permitting Node subprocesses before merge.
