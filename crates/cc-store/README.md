# cc-store

Standalone Rust library for Castle Control's local viewer data, audit ledgers and
retention. No network or bridge dependency; an internal `cc-types` path dependency
reuses the validated art credit and call-ID types. SQLite uses bundled
rusqlite 0.38. `Store::open(directory)` migrates the database (`user_version = 3`),
checks the inventory and ledgers, and holds an exclusive OS file lock until drop.
Share one `Store` through a mutex; a second writer to the directory is refused.

## Inventory and erasure

`STORE_INVENTORY` in `src/inventory.rs` is the authoritative policy table.
`verify_inventory()` compares it with SQLite's actual tables and every file in
the store directory. A new unlisted table, file or directory fails the check;
tests deliberately introduce both an extra table and an extra file.

| Store | Representation | `forget_user(login, as_of)` | `purge_all(as_of)` |
| --- | --- | --- | --- |
| recordings | SQLite items | Delete associated items | Delete all rows |
| rollups | SQLite items | Delete associated items | Delete all rows |
| caches | SQLite items | Delete associated items | Delete all rows |
| exports | SQLite items | Delete associated items | Delete all rows |
| writs | SQLite viewer items and allowlisted configuration | Delete associated items; preserve viewer-free configuration | Delete all rows of both kinds |
| viewer_mappings | SQLite login → Twitch ID | Delete every alias for the ID | Delete all rows |
| settings | SQLite retention setting | Preserve | Delete; default applies again |
| engine_settings | SQLite allowlisted engine overrides, JSON values | Preserve (no viewer data) | Delete all overrides; defaults apply again |
| image_assets | SQLite content-addressed image blobs | Preserve viewer-free streamer assets | Delete all blobs |
| decisions.jsonl, draws.jsonl, engine.jsonl | Typed audit records | Preserve byte for byte | Truncate and sync |
| purge_state | SQLite recovery marker | Preserve | Clear after successful erasure |
| store.sqlite3, store.sqlite3-journal, writer.lock | Database container, transient rollback journal, empty lock | Keep containers | Keep containers |

All five viewer-data stores accept `StoredItem`: ULID `id`, UTC `at`, nonempty
`user_ids`, `content`, and an explicit `simulated` flag. Register logins with
`map_user` first; unmapped IDs and empty associations are refused. Pass **every**
viewer represented by a shared item in `user_ids`: forgetting any one of them
deletes the entire item, including its content. Login lookup is case insensitive.
Renames retain old aliases; reassignment of a login replaces that alias's ID.
An unknown login has zero matches. `items(DataStore)` reads validated viewer
items only, preserving existing Lot Chamber proof readers.

`CONFIGURATION_STORES` in the authoritative `inventory.rs` is the explicit
viewer-free configuration-store allowlist: **only `DataStore::Writs`**. Use the
separate `ConfigurationItem::new(id, at, content, simulated)` shape with
`insert_configuration` and `configuration_items`. Its serialized `kind` is
`configuration` and it has no `user_ids` field; the SQLite association column is
`[]`. Configuration content must be viewer-free, never a way to exempt viewer
data from erasure. `StoredItem` still requires nonempty, fully mapped viewer IDs,
even in Writs. Other stores reject configuration access with typed
`Error::ConfigurationStoreNotAllowed`. Both readers validate every row before
returning their respective shape; an ordinary empty-association item is invalid.

Viewer-free writs do not match the inventory's `DeleteAssociatedItem` forget
predicate, so they survive forgetting any viewer. Viewer-bearing writs still
disappear when **any** associated viewer is forgotten. Writs retain `DeleteRows`
for full purge and revoked-authorization purge: both shapes are deleted. No timed
retention exemption is inferred for future stores; adding an allowlist entry
requires an explicit inventory/purge policy. Existing rows and schema version 1
are unchanged; no migration is needed. `tests/configuration.rs` proves both
shapes coexist across reopen, exact dry-run/execution counts, refusal in every
other store, and the unchanged inventory check for unlisted tables.

Exports and writs are managed SQLite documents, not unmanaged copies on disk.
Callers must not keep additional viewer-bearing files or mirrors outside this
inventory and expect this library to erase them. User-downloaded copies are not
controlled by the store. Neither names nor message text are fields in the audit
schemas; audit viewer references accept only nonzero decimal Twitch IDs as
strings (including IDs larger than JavaScript's safe integer range).

`forget_user` removes data and mappings in one SQLite transaction. `purge_all`
also removes the ledgers, explicit retention setting and engine overrides. It durably records
an erasure intent before touching the ledger files. An error leaves that intent
in place and normal operations refuse to serve data; retry `purge_all` or reopen
to complete it. On reopen recovery runs before any data or ledger is returned.
SQLite uses FULL synchronous writes, DELETE journaling and `secure_delete`;
this does not promise forensic erasure from filesystem snapshots or backups.

cc-core must wire the Twitch bridge's authorization-revoked signal to
`store.purge_all(Timestamp::now())`. That integration belongs to cc-core;
`revocation_callback_purge_all_empties_every_inventory_store` proves the callback
shape against every store here.

## Ledger format

Each append writes one compact UTF-8 JSON object and one LF, then `sync_all()`.
The public append API accepts a `LedgerEvent`, never arbitrary JSON or free text:

- `decision`: ULID decision ID, optional Twitch user ID, typed decision action;
- `draw`: ULID draw-run ID and winner Twitch IDs;
- `draw_sealed`: ULID draw-run ID, configured draw slug, typed SHA-256 seal,
  integer entry count and winner count;
- `draw_risk_acknowledged`: configured draw slug and typed blocked setting;
- `engine`: ULID call ID, integer cost in micro-US dollars, role class, provider,
  selected model and optional served model;
- `image_provider_cost`: typed image provider, one exact credit or dollar amount,
  optional historical dollar-cost metadata and `ArtCallId`.

These are store-internal audit events, not wire contract identifiers. The schema
remains version 1: the amount alternative is additive, with all previous
representations and digest inputs unchanged. No SQLite tables or inventory
entries change, so neither a database migration nor a ledger rewrite is needed.
`LedgerEvent::DrawSealed` goes to `draws.jsonl`. Its `seal_digest: SealDigest`
accepts exactly 64 lowercase hexadecimal characters at construction and serde
deserialization; `draw_id` uses `DrawSlug` and both counts are `u32`. All fields
are required, with no viewer handles or free-form text. Unknown fields, missing
fields and explicit nulls are rejected. The event records the digest computed
by `cc-verify`, without implementing a second hash or changing the writ format.
`tests/seal_audit.rs` covers append/read/reopen round-trips, routing, schema
rejection and digest validation. This adds no store or purge policy.

`LedgerEvent::DrawRiskAcknowledged { draw_id: DrawSlug, setting: DrawRiskSetting }`
goes to `draws.jsonl`; the enclosing `event_at` records acknowledgement time.
It refers to the configured draw before any run exists, not a draw-run ULID.
`DrawSlug::parse(&str)` (also `TryFrom<String>`) copies `cc_types::DrawId`'s
nonempty lowercase ASCII letter/digit segments separated by single hyphens,
without a length cap. `DrawRiskSetting` is `PaidEntry` (`paid_entry`), `PaidWeight`
(`paid_weight`) or `PrizeValueOverCap` (`prize_value_over_cap`). No reason text is
accepted. These cover the blocked rows in Part 1's giveaway table.

`LedgerEvent::Engine` keeps `call_id: Ulid` and `cost_microusd: u64`, and adds
`class: EngineClass`, `provider: EngineProvider`, `model_selected: ModelName` and
`model_served: Option<ModelName>`. It goes to `engine.jsonl`.
`EngineClass` is `Live`, `NearLive`, `Batch` or `Offline` (serialized as `live`,
`near_live`, `batch`, `offline`). `EngineProvider` is `LocalEndpoint`, `OpenaiApi`,
`ClaudeCli` or `CodexCli` (`local_endpoint`, `openai_api`, `claude_cli`, `codex_cli`).
`ModelName::parse(&str)` (also `TryFrom<String>`) accepts 1–128 ASCII characters
from `[A-Za-z0-9._:/@+-]`; construction and deserialization reject other text.
Both newtypes provide `as_str()` and conversion into `String`. A rules-only
fallback or refusal has no `model_served` key; explicit null is rejected.
No new store, inventory entry or purge policy is introduced.

`LedgerEvent::ImageProviderCost { provider: ImageProvider, amount: ImageProviderAmount,
cost_microusd: Option<u64>, call_id: ArtCallId }` goes to `engine.jsonl` through
the existing append-only writer. `ImageProvider::Leonardo` serializes as
`leonardo`. The exported store-internal `ImageProviderAmount` is exactly one of
`Credits(ArtCredits)` or `MicroUsd(u64)`. It is flattened into the event as either
`"credits":"12.340000"` or `"micro_usd":104700` (0.1047 USD); both primary amount
keys together, or neither key, are rejected. No credits are invented for a dollar
receipt and no dollars are invented for a credit receipt.

`ArtCredits` and `ArtCallId` are reused from `cc-types` unchanged:
credits have 1–12 whole digits and optionally 1–6 fractional digits, and the
call ID is a canonical uppercase ULID. Credits are never parsed as a float,
normalized or converted to dollars: leading and trailing zeroes survive exactly.
Existing credit rows may also carry an independently known `cost_microusd`.
That optional metadata is retained unchanged, distinct from the primary
`micro_usd` charge key, so legacy rows with and without it retain their meaning,
canonical bytes and digests. New credit producers continue to omit it. A
dollar-only receipt uses `MicroUsd`, with no legacy cost metadata or credits.
Both dollar fields accept the full `u64` range, including zero; absent metadata
is omitted. Explicit nulls, unknown fields/providers and invalid values are refused.

Owner ruling 1 (2026-10-28, option A): this adds dollar-only storage support;
cc-core still writes credit receipts only and still refuses remove-bg. Enabling
remove-bg is a separate follow-up; no contract generation or dependency change
is needed for this store-internal type.

Owner ruling A (2026-10-28): approve this store-only art-cost ledger prerequisite; Leonardo wiring and the unchanged 30/day spend cap remain a later delivery.
Director clarification (2026-10-28 07:46Z): allow the internal cc-types path edge and its already-locked transitives; no new direct external dependency or lockfile package/version, only cc-store's dependency list may gain cc-types.

Every line contains `schema_version: 1`, `event`, `event_at`, `recorded_at`, and
`digest`. Both times are RFC 3339 UTC, normalized to nine fractional digits and
`Z`. Keys and enum values are snake_case. Absent `user_id`, `model_served` and
`cost_microusd` are omitted; explicit nulls, unknown fields and invalid IDs/times
are rejected by the typed boundary.

Canonical serialization sorts object keys recursively in ascending ASCII order,
retains array order, and emits compact JSON with no whitespace or trailing LF in
the hashed bytes. This schema contains only ASCII keys, IDs, enums, timestamps,
exact decimal strings and integers; no floats or arbitrary Unicode content.
SHA-256 covers the object with **only `digest` omitted**. The digest is 64
lowercase hexadecimal characters.
The final object including `digest` is serialized by the same canonical function,
then the LF is appended. This is a defined integer-only canonical profile, not a
general-purpose JSON canonicalization protocol.

Readers and startup check the schema version, ledger kind, exact canonical bytes,
digest and complete newline termination. A malformed or partial record fails
closed and is never silently repaired. Failed writes or detected corruption
block normal operations; full purge remains available on an already-open store.
Dry-run/full-purge ledger counts count frames, including an incomplete tail, so
corruption cannot prevent erasure. Corrupt ledgers without a pending purge cause
open to fail and require operator recovery of the directory. The digest detects
accidental changes; it is not a signature or protection against an attacker who
can rewrite both data and digest. There is no API for editing or deleting an
individual audit line; explicit full purge is the sole truncation operation.

`tests/art_cost.rs` checks exact decimal bytes, dollar-only amounts, optional
full-range legacy cost, exclusive primary amounts, append/read/reopen routing
and type-door rejection. Frozen version-1 credit rows (with and without cost)
and a pre-art engine row use independently computed digests. Appending preserves
the old bytes; forgetting preserves art receipts and full purge erases them.

## Retention and dry runs

Migration v2 adds only `engine_settings`; v1's `settings` table, INTEGER
`retention_s`, constraints and existing values remain unchanged. Fresh databases
land at v2 in one transaction; existing v1 data and ledgers are preserved.
`engine_settings()` reads explicit overrides as `cc_types::Settings`, and
`set_engine_settings(&Settings)` atomically replaces the whole engine subset.
Omitted keys are reset to the sole parser's defaults; an empty map removes all
overrides. Both APIs use `cc_types::parse_engine_settings` for value validation;
`ENGINE_SETTING_KEYS` is the closed nine-key inventory from WP 1.4. Unknown keys
(including `retention_s`), malformed values and failed writes change nothing.
Paths and endpoints are never logged. These APIs neither spawn nor contact engines.

Core `settings.get/set` expose only this subset, under the existing per-launch
RPC token. Native registration shares `NativeServices.store`; fixture registration
uses its own `settings/` store. Retention remains on its existing store API: the
plan's core-method row does not specify it in the RPC settings map. Full/revoked
purge clears engine overrides like the existing retention setting, despite their
being viewer-free, so configuration resets consistently. Forget preserves them.
`tests/engine_settings.rs` covers fresh v2, v1 migration, all nine keys, reopen,
invalid/unknown keys, transaction rollback and forget/full-purge behavior.

- `MIN_RETENTION_S`: 86,400 seconds (24 hours).
- `DEFAULT_RETENTION_S`: 2,592,000 seconds (30 days).
- `set_retention_s` persists a setting. A value below the floor returns typed
  `Error::RetentionBelowFloor` and changes nothing; it is never clamped.
- Retention deletes recordings with `at < as_of - retention_s`. A recording at
  the exact cutoff survives. Other stores and audit ledgers are not time-purged.

`preview(Purge::ForgetUser(login), as_of)`, `preview(Purge::ExpiredRecordings,
as_of)` and `preview(Purge::All, as_of)` offer dry runs for every purge. Each
returns the normalized request, `as_of`, an omitted-or-present `cutoff`, and
per-inventory-store affected counts (zero for unaffected stores/containers).
Preview does not mutate data. Counts and execution use the same SQL predicates;
execution recomputes counts within its write transaction, so a separate preview
can become stale after intervening writes. Pass the same `as_of` to compare a
preview and an execution against the same time boundary.

`run_retention_job(&mut store, &clock)` performs one scheduled sweep with an
injected `Clock`. `spawn_retention_task(Arc<Mutex<Store>>, Arc<dyn Clock>, period,
shutdown_receiver)` starts a tokio interval with its first tick one period later.
Use `SystemClock` in the app. The caller owns the returned join handle and must
observe its `Result`; errors stop the task rather than disappearing. SQLite work
runs on a blocking worker. Missed ticks are skipped. Setting the shutdown watch
value to true or dropping its sender ends the task. A zero period is refused.
The paused-time test advances tokio time and injects the erasure clock; no sleeps
or real chat fixtures are used. Every test uses generated, labelled simulated
data in a temporary directory.

## Verification

### Local draw images (owner rulings 2 and 5)

`store_image(&LocalImageContent)` hashes the exact PNG/JPEG/WebP bytes and returns
a `LocalImageRef`. `load_image(reference)` validates the digest reference, verifies
the stored bytes against it, and rechecks format and the 2 MiB cap. Unknown digests
return None; URLs and traversal paths fail before any lookup. No input ever names
a file. Blobs live in the app-data database, deduplicate across draws, and follow
the inventory's full-purge policy. Migration v3 preserves existing v1/v2 data;
`tests/images.rs` covers reopen, deduplication, migration, traversal, corruption,
byte caps and purge. ADR 0003 documents the storage and wire encoding choice.

### Commands

Run inside `crates/cc-store`:

```text
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

If network access is unavailable and dependencies are cached, use Cargo's
`--offline` flag. The crate-local lockfile and target directory are ignored;
the root workspace and its lockfile belong to WP 0.1.

`tests/audit_events.rs` checks every engine class/provider, answered and unanswered
calls, and all risk settings through append/read and reopening. Exact expected
canonical bytes and independent SHA-256 digests prove the two file routes and
schema version. It also rejects altered digests, noncanonical bytes, unknown
fields/enums, explicit nulls and invalid model names; it copies DrawId's accept
and reject cases from `cc-types/tests/contract.rs:108-114`. The final test verifies
forget preserves both new events byte for byte and full purge erases them using
the unchanged inventory. Existing append-only, retention and erasure tests remain.
