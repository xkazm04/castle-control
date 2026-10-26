# Beacons intake, intensity and offline image client (WP 3.1 / WP 3.4 part A)

This crate accepts parsed `cc-types::Contribution` values. It has no Twitch
subscription, RPC, renderer, OBS, moderation or draw implementation. The separate
`art` module is an optional image-provider client; intake and intensity do not
call it and keep their existing behaviour.

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
WP 3.1 itself needed no dependency or lockfile change. WP 3.4 adds dependency
edges only to versions already resolved in Cargo.lock.

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

The WP 3.1 base was `5073b63e19c1344230ce66f8159006440217b30c`. At that delivery,
gate scripts, packages, apps, cc-types, manifests and Cargo.lock had no diff
from that base. App Master needed to rerun the full gate in its verification
environment. No install was run over the node_modules junction.

## WP 3.4 part A: Leonardo image provider

`art::ImageProvider` exposes anchor generation, matching-set generation and
background removal. `LeonardoClient` takes an injectable `HttpTransport` and
`KeyStore`. `from_keychain(label)` selects the native OS keychain under service
`castlecontrol-leonardo`; the keyring version and Windows/macOS/Linux features
match cc-obs and cc-twitch. Account labels, never key values, configure clients.
`KeychainStore` supports save/delete for a future settings flow. Native keychain
custody is user-scoped: another process running as the same user may access it.

`available()` reports local key presence without networking. Missing keys return
`Ok(false)` and operations return `Unavailable` before sending a request. Keychain
failure is a distinct error, rather than an assertion that no key exists. Keys
are reloaded for each operation, so deletion disables subsequent calls. No
background task, transport call or keychain access starts at construction.

Generation submits one image for the anchor or 1–8 images for a matching set to
the [v1 generation endpoint](https://docs.leonardo.ai/v1.0/reference/creategeneration).
It returns a job id and cost receipt immediately. Call `generation_state(job_id)`
to obtain pending/complete/failed status and the generated image ids. Match with
an **image** id from the completed anchor, using `init_generation_image_id` and
`init_strength: 0.5`, rather than passing the job id. Choose a compatible model
in `ImageRequest`; this client does not silently pick or switch models.

Background removal uses the documented
[v2 synchronous remove-bg endpoint](https://docs.leonardo.ai/docs/remove-bg),
referencing the generated image id and requesting PNG without a background
colour. It returns URLs and provenance, without downloading or rendering them.
The image id is omitted when the sync API supplies only a URL. Every paid request
body explicitly sets `public: false`; polling is a GET with no body. Returned
assets carry `generated: true` and generated/background-removed provenance.

Each successful paid call returns `CostRecord { call_id, model, charge }`.
`call_id` is a local ULID. Credits remain exact decimal strings; dollar amounts
become integer micro-USD without floating point rounding. The parser accepts
the provider's cost object or legacy `apiCreditCost`, and rejects missing,
negative, unknown-unit or over-precision costs instead of inventing zero.
Read-only status polls do not create another charge. Empty moderated outputs
remain empty with their cost receipt; a failed generation status never discards
the original submission receipt. Malformed/failed HTTP calls cannot establish
a charge and return an error. There are no automatic paid retries.

The default transport binds credentials to Leonardo's fixed HTTPS origin,
disables redirects, uses sensitive Authorization headers, sets connection/total
timeouts, and caps response bodies at 2 MiB. SecretKey is zeroized on drop,
prints exactly `[redacted]` through Debug and Display, and cannot be serialized
(compile-fail doctest). Upstream/reqwest/keychain error strings and response
bodies never enter errors or diagnostic logs. Error responses expose only a
typed status code. Responses echoing the key are rejected before decoding.

### Deferred integration and owner checks

No ledger is written. `EngineProvider` lives in **cc-store**, which is frozen
pending the operator's ruling. Later integration must map these typed receipts
into the engine ledger at its approved write door. No cc-store/cc-engine change,
new contract identifier, RPC registration, UI or live wiring is included here.
The future UI can hide this optional feature when `available()` is false.
The owner's Leonardo API-terms/ownership check still gates generated art in a
public Extension; this delivery neither fabricates that check nor makes a paid
request. Live API interoperability and native-keychain integration remain
unverified; all protocol evidence below is deliberately offline.

### Offline acceptance evidence

`tests/fixtures/leonardo/flow.json` and `http-error.json` are **fabricated,
simulated recordings**, shaped from the official docs; none was captured from
a real account. Tests inject an in-memory KeyStore and a scripted HTTP transport
with no network fallback. No real key or real asset URL is present.

`tests/leonardo.rs` proves all paid bodies are private, anchor-image references
match, background removal requests PNG, missing/deleted keys send nothing,
costs stay typed, HTTP errors are typed, and the simulated sentinel never
appears in Debug/Display/errors/cost serialization/captured tracing. Additional
cases reject invalid input, unsafe paths/URLs, malformed schemas and unknown
costs, and preserve empty moderated results and failed job states. The existing
intensity and resolved dependency-direction tests still pass.

Red first: `cargo test --offline -p cc-beacons --test leonardo` failed with
`E0432: could not find art in cc_beacons` before implementation. Green:
`cargo test --offline --locked -p cc-beacons` passed 18 integration tests plus
the SecretKey non-serialization doctest. Crate Clippy with `--all-targets -- -D
warnings` and the repository boundaries/hygiene/file-cap/secrets checks passed.

Final verification on Windows, 2026-10-26, base
`b7f4e6e33a6157d3f9473a00192eac1eb877e5d9`:

- Reconciliation: main contained no Leonardo client in crates or other product
  paths; only the plan mentioned this work.
- `cargo fmt --all -- --check` passed.
- `cargo --config net.offline=false clippy --locked --workspace --all-targets --
  -D warnings` passed. `CARGO_BUILD_JOBS` stayed at 6.
- `cargo --config net.offline=false test --locked --workspace` exited 0,
  including the existing 1,000-roll verifier test and the new Beacons tests.
  Existing explicit live/fixture-generation tests stayed ignored.
- `node scripts/check.mjs` and `node scripts/tooling-lint.mjs` passed:
  377 code files; the final secrets inventory covered 490 files.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  build` passed, including its 389450/393216-byte first-load check.
- `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests
  and the workspace inventory, then **failed** with `spawnSync cargo EPERM`
  inside the unchanged contract exporter. Recursive `-r typecheck`, `-r lint`
  and `-r test` with the same option each **failed** with `spawn EPERM` before
  package checks ran. These checks are not claimed green. The exporter,
  scripts, pnpm files, packages and apps have no source diff from main.
  App Master must rerun those checks in its verification environment.
- No package installation, git write, ledger write or paid API call was run.
  Cargo.lock changes only cc-beacons dependency edges; no version changed.
