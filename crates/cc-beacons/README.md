# Beacons intake and intensity (WP 3.1)

This crate accepts parsed `cc-types::Contribution` values. It has no Twitch
subscription, RPC, renderer, OBS, model, moderation or draw implementation.

`Intake::accept` preserves integer amounts in the contract's native units:
Bits for cheer/bits_use; counts for subscribe/gift/resub/power_up; levels for
hype_train; points for channel_points; minor currency units for charity/goal.
The two Bits topics normalize to Cheer. Deduplication uses the exact tuple
`(broadcaster_id, dedupe_key)`, independent of source, user and event_id. The
upstream event adapter must provide a shared underlying identity for overlapping
topics. Keys are retained throughout the intake's in-memory accounting session;
there is no persistence or automatic eviction in this delivery.

`InputSelection::new` explicitly chooses sources and positive integer weights.
Empty selections, duplicate sources (including cheer/bits_use aliases), zero
weights and mixed native units are rejected. Monetary routing must already be
partitioned by currency: the contract carries no currency identity and this
crate performs no currency conversion. Source routing is internal configuration,
not a new wire identifier or an extension to Visual.

`IntensityEngine::new` binds one immutable Visual and input selection to one
broadcaster and an injected monotonic `Clock` returning Duration. Each accepted
contribution adds its weighted amount to the running total. Exponential decay
halves that total every `half_life_s`; None retains it. Decay is applied before
interpolation, including when reading a snapshot. A backwards clock is an error
and changes no state. Totals above the last control point are retained, allowing
a saturated beacon to decay naturally. This layer never reads system time.

Curves must have nonempty, strictly increasing, distinct totals. Interpolation
is linear between adjacent control points and clamps to the first/last point
outside their totals. A single point defines constant intensity. Intensities
may decrease between points; each value remains in the contract's finite 0..1
domain. An empty total uses the first point when its total is positive.

`simulate(&visual, &inputs, &burst)` is a pure preview from an empty total,
immediately after a synthetic burst. It returns BeaconsSimulateResult with
`SimulationLabel::Simulated`, creates no Twitch identity, and cannot consume live
dedupe keys or change live totals. With the test curve (0 -> 0, 100 -> 1),
`{ source: gift, amount: 50 }` produces 0.5 at unit weight, or 1.0 at weight 2.

Acceptance evidence is in `tests/engine.rs` (generated, simulated inputs only)
and `tests/dependency_direction.rs`. The latter checks resolved transitive
dependency trees in both directions, including build/dev/target dependencies,
so money cannot flow through Beacons to lots, Gatehouse or the engine.

Run focused verification with `cargo test --offline --locked -p cc-beacons`.
No dependency or lockfile change is needed.

Verification on Windows, 2026-10-26:

- Red first: the engine integration test failed on the scaffold's missing APIs.
- `cargo test --offline --locked -p cc-beacons`: 10 engine tests and the resolved
  dependency-direction test passed.
- `cargo fmt --all -- --check` and
  `cargo clippy --offline --locked --workspace --all-targets -- -D warnings` passed.
- `node scripts/check.mjs`, `node scripts/tooling-lint.mjs` and
  `git diff --check` passed. The code inventory was 267 files, secrets 361 files.
- `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests and
  workspace inventories, then failed in the unchanged contract exporter with
  `spawnSync cargo EPERM`. Its attempted Cargo invocation forces
  `net.offline=false`; no Cargo child started. Direct Cargo verification above
  was offline and locked throughout.
- Recursive pnpm typecheck and lint with the same dependency-verification option
  each failed with `spawn EPERM` before running package checks. These failures
  remain unresolved environmental gate failures, not passes.

The base is `5073b63e19c1344230ce66f8159006440217b30c`. Gate scripts, packages,
apps, cc-types, manifests and Cargo.lock have no diff from that base. App Master
must rerun the full gate in its verification environment. No install was run
over the node_modules junction.
