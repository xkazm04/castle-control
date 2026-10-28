# Gatehouse history read contract

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
