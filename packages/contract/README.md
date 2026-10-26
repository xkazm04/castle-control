# Shared contract

`cc-types` owns the method table, Rust request dispatch, schemas, branded IDs,
closed event names and ten error codes. Its `export-contract` binary drives
this package's generated TypeScript types, metadata and Ajv standalone validators.
The runtime uses these validators without compilation/eval in the desktop.
Only `src/door.mjs` parses JSON. Unknown keys and explicit null are refused;
absent optional keys are omitted. UTC timestamps are validated as calendar dates.
Numeric counters are safe JS integers; Twitch IDs, seeds and rounds stay strings.

## Steward writ boundary (WP 5.1 contract delivery)

The three existing Steward RPC entries remain `Pending`; this delivery exports
standalone types and parsers before handler/registration work. `parseWrit(text)`
validates the ID, chamber, typed proposal diff, status, UTC creation/update times
and optional error. `parseStewardAskParams/Result`, `parseWritSealParams/Result`,
`parseWritTearParams/Result` and `parseStewardEvent` use the same JSON door. All
records reject unknown fields and explicit null; absent optional keys stay absent.

`WritProposal` is tagged by the existing mutation method and reuses draw upsert,
rule upsert/setMode, visual upsert and curve-set parameters. `WritDiff<T>` carries
an optional before snapshot and required after snapshot. Chamber/method mismatches
fail in Rust and the generated validator. Map Room remains deferred: its methods
are Pending and rendering `DesignPackage` data does not define a studio mutation.
The shared `WritId` minting door and existing event name are reused. No state
transition, consent, guardrail application or executable action is supplied here.
Future handlers must validate authoritative state and apply only sealed proposals.

`crates/cc-types/tests/fixtures/steward.json` contains five simulated writs read by
Rust and TypeScript tests, covering every proposal variant and all four statuses.
Generator tests assert that identical parameter/result roots share validators.
Pure initializers and static imports keep unused validators removable. An
in-memory Vite build of the desktop with HEAD contract sources and then worktree
sources produced exactly 387,914 JS/CSS bytes in each case (four output assets,
below 393,216 bytes); both builds used this worktree and wrote no app files.
All output asset names and SHA-256 hashes also match between those builds.

Validation on 2026-10-26: the four new Rust tests and all workspace Rust tests
pass, as do workspace formatting/Clippy, contract typecheck/lint, tooling lint,
boundaries/hygiene/file-cap/secrets checks, 113 contract tests and generator
assertions. The new TypeScript suite first failed because its
parser exports did not exist. Drift/parity pass with fresh external schema and
registry exports through the documented harness below (seven generated files,
45 declared methods, seven registered methods, 16 mirrored event names).
The full `pnpm gate` with those inputs completes tooling fixtures and all Rust
checks, then stops at recursive typecheck with `spawn EPERM`. This is the same
base limitation recorded in `docs/PLAN.md`; recursive lint has the same spawn
failure, and recursive workspace pnpm tests were not reached. Full gate success
is not claimed.
The Director must run the ordinary merge gate after committing this delivery.

Run `pnpm -C packages/contract generate` after changing Rust types. Run
`pnpm -C packages/contract check` to regenerate in memory and compare the whole
generated tree, including missing and orphan files. The gate refuses empty
inventories. `pnpm gate` runs drift and method/event parity before other gates.
Generated artifacts are deterministic and carry their rebuild instruction.
Only Ajv's machine-emitted validator module disables ESLint; the global hygiene,
file cap and secrets gates still inspect it. All authored code remains linted.

When Node cannot spawn Cargo in the builder sandbox, the Director-authorized path is:

```powershell
cargo --config net.offline=false run --quiet -p cc-types --bin export-contract | Set-Content -Encoding utf8 $schemaPath
cargo --config net.offline=false run --quiet -p cc-core --bin export-registry | Set-Content -Encoding utf8 $registryPath
node packages/contract/scripts/generate.mjs --schema $schemaPath
node packages/contract/scripts/check.mjs --schema $schemaPath
node packages/contract/scripts/parity.mjs --schema $schemaPath --registry $registryPath
```

Use external run-directory files and freshly export both from the current tree.
`CC_CONTRACT_SCHEMA` and `CC_CORE_REGISTRY` supply the same files to `pnpm gate`.
Outside the sandbox no flags are required: both scripts run Cargo themselves.
These overrides are a build-harness input, never a product or CI default.

`Registry::with_status()` reports the actual built-in registration. Parity
requires registered methods to be declared and literal TS `invoke` calls to be
registered. Declared names awaiting later WPs are reported with their count.
The event gate checks emitted Rust enum variants, literal TS event subscriptions
and publications, and the generated event-name mirror against the closed registry.
It also refuses JSON parsing outside the contract door in application/packages code.

Later WPs own the placeholder shapes named in the Rust method table. `Pending`
is uninhabited (`never` in TS), so a placeholder cannot accidentally accept live
data. Add a method shape in `cc-types`, regenerate, then implement/register its
module. Events invalidate authoritative reads; even after replay, consumers
refetch. A `resync` requires refetch of every subscribed read.

## Design package boundary (WP 3.2 contract delivery)

`parseDesignPackage(text)` validates local design data through the same JSON
door, using the generated standalone `designPackage` validator. Its generated
`DesignPackage` type reuses `DesignId` and `Intensity`. Layers retain their array
order; properties and binding endpoints have closed numeric domains. Asset and
script entry-point paths are package-relative, with no URL schemes or traversal.
Missing privileges mean data-only and remain omitted. To request scripts, a
package must declare `{ kind: 'scripts', scripts: ['scripts/local.js'] }` in its
privileges block; this is a request, not consent or permission to execute.

Only the contract lands here. Renderer bindings, preset support, local asset
resolution, canonical content hashing and verification, privilege-change consent,
overlay isolation/CSP and OBS cache busting remain separate WP 3.2 work. The
parser checks digest syntax only. No package resource is read or executed.
The plan's "Design package typed payloads" table defines every field and domain.
The generator continues to intern shared schemas and emit pure validator
initializers so unused design validation can be tree-shaken from the desktop.

Validation in the builder worktree, 2026-10-26:

| Check | Evidence |
| --- | --- |
| Reconciliation | Base/main tip `146728b` has no design-package/layer types; the renderer README explicitly defers them |
| Rust boundary | `cargo test -p cc-types --offline`: 43 tests pass, including four design tests; their initial run failed because the design types did not exist |
| Contract tests | `pnpm --config.verify-deps-before-run=false --filter @castle-control/contract test`: 109 tests in nine files pass, plus deterministic codegen/drift/parity assertions |
| Drift and parity | `check.mjs --schema` and `parity.mjs --schema --registry` pass with fresh offline exports: seven generated files, 45 declared methods, seven registered, 16 mirrored events |
| Scoped checks | Contract package typecheck/lint and tooling ESLint pass; global boundaries, hygiene, 400-line cap and secrets checks pass |
| Workspace Rust | `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --offline -- -D warnings` and `cargo test --workspace --offline` pass |
| Desktop budget | Vite production build with `build.write: false`, using the existing desktop entry: two first-load JS/CSS files, 354,323 / 393,216 bytes; no app files written |

The normal generator's Cargo spawn and recursive pnpm typecheck/lint encounter
the existing `EPERM` process-spawn limitation documented in `docs/PLAN.md` and
the renderer README. The supported external schema/registry inputs above were
used for generation and parity; no gate or sandbox policy was changed. The
full `pnpm gate` with those inputs passes tooling, drift/parity and all Rust
checks, then stops at recursive typecheck with the same `spawn EPERM`. Recursive
pnpm tests are not reached. The Director still runs the ordinary desktop build
and complete merge gates after committing; a full green gate is not claimed.
