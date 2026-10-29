# Gatehouse history read contract

## Capture-time live run evidence (M1b, 2026-10-29)

`gatehouse.liveRun.get` uses the same required 1–100 `limit` and optional opaque
`cursor` as the existing reads. Its cursor scope is `liveRun`; other endpoint
cursors are refused. It scans an append-ordered ledger window and returns
`GatehouseLiveRunResult { items, unavailable_count, next_cursor? }`. Follow the
cursor even on pages containing only unavailable entries. The existing Store
materializes collections, so pagination bounds the response/ledger window, not
total storage I/O or memory.

Each item is keyed to a committed `decision_id`:

- `coverage: retained` includes `provenance` and `capture` with an opaque
  `recording-<ULID>` reference, inclusive message-time interval (`from`, `to`),
  capture-time `instrument_hash`, its four component hashes, and the resolved
  `configuration` (rules including modes, bank/judge labels and prompts).
  `inputs` contains strictly typed bank cases/calibration, the resolved judge
  identity/parameters, and the exact system/configuration prompts and named
  source-revision hashes used to calculate the instrument. These are inert data.
- `coverage: unavailable` includes a reason (`capture_unavailable` or
  `recording_unavailable`) and increments `unavailable_count`. Legacy rows,
  configuration-only decisions, erased metadata and expired/missing recordings
  never acquire invented instruments, references or provenance.

The current host captures one shadow-screened notification per recording.
Original bridge-gap intervals stay in `capture.gaps`, keyed by the containing
decision item. `capture.replay_gap`, when present, explains why retained evidence
cannot prove replay parity: a bridge gap, classifier state unavailable to the
rules-only drill, or runtime context the existing recording schema cannot
reproduce (verified authority, prior care, strikes, a disabled gate, empty input,
or armed configuration overridden by the host's shadow constraint). Such rows
remain retained evidence; they are not successful replay coverage. Their
resolved configuration is preserved, never silently rewritten to make it match.

Capture snapshots are computed **before** screening, then inserted immutably
as an optional `live_capture` field in the existing viewer-associated decision
audit record in `Caches`, before the ledger commits that decision ID. Legacy
records omit the new field; the cache keeps its original audit-record shape.
Existing `Recordings` hold the original message and retain the simulation label.
The sole existing Store writer, retention, user erasure and purge APIs own both;
there is no new DataStore, SQLite change, old-row migration or second writer.
A cancelled screen clears its transient snapshot; a crash before ledger commit
does not publish orphan cache evidence. Reads verify
snapshot digests and cache/recording/audit associations without changing rows.

The existing `drill.run` compares its freshly resolved instrument with the
**stored** capture hash and resolved inputs. A different rule, mode, prompt or
instrument revision yields `conflict`; a replay coverage gap yields `unavailable`.
`drill.diff` requires its baseline to match the retained capture and lets the
candidate carry its own distinct hash. Neither method accepts a caller hash.
Ordinary imports retain their existing drill behavior. A legacy live-shadow
recording without a snapshot is unavailable for capture comparison; a source
label supplied by an importer cannot manufacture capture authority. No desktop
wiring or new drill identifier is included.

The only plan edit is appending `gatehouse.liveRun.get` to the existing
`gatehouse (read additions)` row. `cc-types` owns the method and shapes;
the existing generator emits all 22 contract artifacts, including the lazy
`@castle-control/contract/gatehouse` method object `gatehouseLiveRunGet`.

### M1b verification

- `crates/cc-core/tests/gatehouse_live_run.rs` covers retained simulated capture,
  restart, unchanged snapshot/cache/ledger after rule edits and reads, matching
  replay, changed rules/prompts, rejected caller hashes, authoritative diff
  baseline, keyed bridge/runtime gaps, legacy/expired/erased rows, and 104
  decisions paginated at 37 per page without skips or repeats.
- `crates/cc-gatehouse/tests/live_capture.rs` proves cancellation clears the
  transient snapshot and that a legacy/imported live-source label cannot supply
  capture authority. The existing eight-test core live-pipeline suite also passes
  with the additive audit field; no existing cache record shape is replaced.
- `crates/cc-types/tests/gatehouse_live_run.rs` and the shared simulated fixture
  test the same strict result in Rust and TS, including malformed inputs,
  explicit null, invalid IDs, unknown keys, oversized pages and caller hashes.
  The preserved method/plan equality assertion now checks all 50 methods.
- The requested `cargo test -p cc-types -p cc-gatehouse -p cc-core` passes
  (295 passed, two ignored); the final `cargo test --workspace` also passes.
  Workspace formatting and all-target Clippy with warnings denied pass.
  Contract typecheck/lint, 150 contract tests and generator assertions pass;
  all 17 unchanged verifier-web tests pass, so no fingerprint refresh is needed.
- Fresh Rust exports through the supported external schema/registry harness
  pass drift across all 22 generated artifacts and parity for 50 declared,
  36 registered methods and all 16 event kinds. Global boundaries, hygiene,
  file-cap and secrets checks pass. Recursive pnpm typecheck/lint stop before
  package checks with the documented sandbox `spawn EPERM`; the Director must
  run the complete merge gate. No dependency install was attempted.

`gatehouse.chat.list` and `gatehouse.history.list` are read-only additions;
existing identifiers and review/action methods are unchanged. Rust types and
the method table in `cc-types` own the shapes. Regenerate with
`pnpm --config.verify-deps-before-run=false -C packages/contract generate`.
The lazy `@castle-control/contract/gatehouse` entry exports both method objects.

Requests require `limit` from 1 through 100. Larger limits are **refused** with
`invalid`, not clamped. Omit `cursor` for the first page. Return the opaque
`next_cursor` unchanged for subsequent pages on the same endpoint. Nulls,
unknown fields, malformed cursors and other endpoint's cursors are refused.
The cursor tracks ledger append position, not timestamp or random ULID order.
Do not reuse a cursor after a full purge or against a different store.

A page scans at most `limit` committed ledger entries and returns at most that
many items. Follow `next_cursor` until absent, even if `items` is empty. Reads
hold the existing service mutex and borrow the existing Store; there is no
second connection, writer, writer-lock change, data migration or new dependency.
The existing Store API materializes the ledger/cache/recording collections, so
the page bound limits the response and scanned ledger window, **not total I/O
or memory**. A storage query/index change would need a separate delivery.

Each returned item has `provenance: live | simulated`, derived from committed
audit metadata and checked against its StoredItem flag. Chat items join the
original intake verdict to retained recordings by message and viewer IDs.
They omit review follow-ups and room-setting actions. Conflicting imports of
the same message cannot overwrite a retained original or supply ambiguous text.
Expired/erased recordings are not returned. History includes recorded-at time
and the retained decision metadata; it never carries chat text or action intent.

## Existing storage gap

The append-only decision ledger contains ID, user ID, action and timestamps,
but **no verdict or live/simulated flag**. Those live in erasure-managed cache
records. Legacy configuration/governor decisions have no cache record at all;
forgotten users lose their cache and recording metadata while audit IDs remain.
Such entries cannot be fully reconstructed through the current Store API.
`unavailable_count` reports those entries per scanned page rather than inventing
provenance or verdicts. Chat counts unavailable viewer decisions, excluding
ledger-only room/configuration actions. Some standalone domain tests also screen
without recording: their verdict remains available in history, but their chat
text is unavailable. The live shadow host records before screening.

Returning every ledger-only entry with trustworthy provenance requires an
approved storage/writer change to persist that metadata. This delivery makes
no such change. No desktop/UI wiring is included.

## Acceptance evidence

- `cargo test --locked -p cc-core --test gatehouse_reads`: bounded pages walk
  213 decisions in append order without gaps/repeats; limits above 100 refused;
  both provenance labels survive RPC validation; lazy registration and writer
  lock preservation; legacy/erased metadata counted and empty-page continuation.
- `cargo test --locked -p cc-types --test gatehouse_reads` and contract
  `gatehouse-reads.test.ts`: shared generated fixture proves Rust/TS/lazy
  validator parity, page bounds, omitted keys, and invalid boundary rejection.
- The four core read tests were red before handler registration (Unavailable
  and missing-method assertions), then green after implementation.
- Two additional core tests verify that imports supply no verdict authority,
  conflicting chat is counted unavailable, expired originals stay hidden, and
  reads change neither the ledger nor stored recordings. The core suite is 6/6.

The headless environment refuses Node's piped `spawnSync cargo` with EPERM.
Export the schema directly using `cargo run --locked --quiet -p cc-types --bin
export-contract`, then use the generator's supported `--schema <export.json>`
argument. Drift accepts the same argument. Parity accepts a registry exported
with `cargo run --locked --quiet -p cc-core --bin export-registry` through its
supported `--registry <export.json>` argument. Root gates can take those fresh
exports via `CC_CONTRACT_SCHEMA` and `CC_CORE_REGISTRY`. No generated file is
hand edited. The existing `packages/verifier-web` artifact passes its source
fingerprint test unchanged: the verifier fingerprints its proof inputs and
shared JSON door, which this delivery does not alter. No refresh is needed.

## Plan parity

The approved resume adds only the two read-method identifiers in a new
`gatehouse (read additions)` row after the Steward row of the plan's method
table. The existing full method/plan equality assertion remains intact.
Legacy ledger-only decisions and retention-removed metadata remain counted as
unavailable; verdicts or provenance are never fabricated for them.

Resume verification: the unchanged method/plan equality assertion first failed
with 47 documented methods versus 49 typed methods, then passed after the
single plan-row addition. Both Rust read-contract tests and all six core read
tests pass. Contract and verifier-web each pass their individual typecheck and
lint; their test suites pass 149 and 17 tests respectively. The contract
generator's deterministic-output, drift, invalid-inventory and parity tests
also pass. `cargo fmt --all --check` and full workspace/all-target Clippy with
`-D warnings` pass, as does `cargo test --workspace`, including the preserved
contract/plan equality test and the 1,000-generated-draw property test.
Fresh Rust schema and registry exports pass the real
contract drift and method/event parity gates (49 declared methods, 35 registered,
and all 16 event kinds mirrored). Recursive `pnpm -r typecheck` fails before package checks
with the documented sandbox `spawn EPERM`; the Director must run the full
`pnpm gate` before push. No install or node_modules change was attempted.
