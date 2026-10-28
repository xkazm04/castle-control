# ADR 0001: Steward writs in allowlisted configuration stores

Date: 2026-10-26

Status: Accepted, step 1 (the cc-store contract) delivered; step 2 remains queued.

Decision authority: operator ruling at the 2026-10-26 standup, captured by the
`technical-decision-capture` brief. This ADR records the ruling; it does not
implement it or schedule either delivery.

## Context and constraint

[WP 5.1](../plan/03-implementation-plan.md#wp-51--writ-protocol-and-the-slow-lane)
defines a Steward writ as a typed configuration change for a chamber, shown as a
diff. Seal applies it; tear discards it; nothing changes without a seal. The
plan's **Steward writ contract (WP 5.1)** describes configuration snapshots,
status and timestamps, with no viewer-owner field. Steward writs are viewer-free
configuration records under this ruling, not chat records or Lot Chamber proof
bundles.

The current cc-store item contract assumes a viewer association for every
`StoredItem`. [StoredItem::validate](../../crates/cc-store/src/types.rs) rejects
empty `user_ids`; [Store::insert](../../crates/cc-store/src/store.rs) also requires
each associated ID to have a viewer mapping. This applies to all five
`DataStore` variants, including `Writs`. Viewer-free Steward writs cannot satisfy
that invariant without changing the store contract or fabricating an association.
This constraint concerns stored items; audit ledgers already have separate typed
records and policies.

[WP 0.3](../plan/03-implementation-plan.md#wp-03--store-ledgers-and-retention)
requires forgetting a viewer across an inventory of recordings, rollups, caches,
exports and writs, and full purge on revoked authorization. The
[cc-store inventory](../../crates/cc-store/src/inventory.rs) assigns each store
forget and full-purge policies. Its current writ policy deletes associated items
on forget and all rows on full purge. The
[store documentation](../../crates/cc-store/README.md#inventory-and-erasure)
requires every represented viewer in `user_ids`; forgetting any one deletes the
entire shared item. An unlisted table or persistent file fails inventory checks.

## Decision

cc-store may accept viewer-free records **only in explicitly named configuration
DataStores**. `DataStore::Writs` is the first allowlisted store for viewer-free
Steward configuration writs. This is not permission to make `user_ids` optional
or empty throughout cc-store, nor permission for arbitrary stores or callers to
declare records exempt from erasure.

Each allowlisted configuration store must have an explicit purge policy in the
store contract and authoritative inventory before it accepts viewer-free records.
For the initial Writs case:

- Viewer-free configuration writs have no viewer association and therefore no
  match for forget-viewer; they survive that operation.
- Full purge deletes all writ rows, including viewer-free writs, retaining the
  existing `DeleteRows` policy and revoked-authorization purge requirement.
- Viewer-bearing records still identify every represented viewer and are deleted
  when any associated viewer is forgotten. The config exception must not shelter
  viewer data merely because the record is stored in Writs.

Forget-viewer stays exact everywhere else: preserve the existing association
validation, ID-based matching, mapping deletion and inventory policies. Keep
dry-run counts and execution predicates aligned as WP 0.3 requires. This ruling
does not select a new timed-retention policy; any further config store needs its
own explicit policy rather than inheriting an unspecified exemption.

## Delivery order

1. Deliver the cc-store contract change first: define the explicit config-store
   allowlist, accepted viewer-free record shape and purge policies, with evidence
   that ordinary viewer associations and exact forget behavior remain enforced.
2. Deliver cc-steward separately, after that cc-store contract is available. Use
   it for viewer-free configuration writs while preserving WP 5.1 schema
   validation, seal/tear behavior and guardrail checks at seal.

Any new contract identifier must land in `cc-types` in its own delivery before
either consumer builds against it, per the plan's **Contract identifiers** law.
Existing Steward schemas do not themselves implement storage or authorize a
mutation. This ADR adds no identifier, code, crate, schema or generated contract.
Both implementation deliveries are queued, not scheduled for 2026-10-26.

## Alternatives rejected

### (b) A Steward-owned table outside cc-store

Rejected in favor of the shared inventory and purge contract. WP 0.3 explicitly
includes writs in the inventory of every store and requires revocation-triggered
full purge and dry-run previews. A separate table outside cc-store would need
additional integration to meet that same coverage. The current inventory also
refuses unlisted tables/files. **Support is thin beyond that:** the plan does not
explicitly forbid a separately owned table with equivalent integration, or
compare its cost. This ADR records the operator's choice, not a claim that the
alternative is technically impossible.

### (c) Treat the streamer as the owner of writs

Rejected because WP 5.1 describes chamber configuration changes, while WP 0.3's
viewer associations identify whose data must be forgotten. Assigning the
streamer's ID solely to satisfy nonempty `user_ids` would give a viewer-free
configuration record a viewer-erasure association. The existing Steward writ
contract has no owner field. **Support is thin beyond that:** the plan does not
explicitly discuss streamer ownership or its desired erasure semantics; this
rejection follows the operator's viewer-free ruling rather than an express plan
prohibition on ownership models.

## Consequences

The store remains the single inventoried persistence and purge boundary for
these records. The exception is explicit and limited to configuration stores;
ordinary viewer erasure is not relaxed. cc-steward waits for the cc-store
contract delivery. This capture leaves WP 5.1 implementation and scheduling to
later deliveries.
