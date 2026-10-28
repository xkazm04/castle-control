# Shared contract

`cc-types` owns the method table, Rust request dispatch, schemas, branded IDs,
closed event names and ten error codes. Its `export-contract` binary drives
this package's generated TypeScript types, metadata and Ajv standalone validators.
The runtime uses these validators without compilation/eval in the desktop.
Only `src/door.mjs` parses JSON. Unknown keys and explicit null are refused;
absent optional keys are omitted. UTC timestamps are validated as calendar dates.
Numeric counters are safe JS integers; Twitch IDs, seeds and rounds stay strings.

`./steward` lazily exports `stewardAsk`, `stewardWritSeal`, `stewardWritTear` (params/results) and `stewardEventPayload` (`steward.writ`), matching the root validators.

## Beacons render snapshot boundary (WP 3.2 contract delivery, 2026-10-27)

The overlay SSE event **`beacons.render.snapshot`** carries a
`BeaconsRenderSnapshot { visual, package?, intensity }`. Runtime exports live
only at **`@castle-control/contract/beacons-render`**:
`BEACONS_RENDER_SNAPSHOT_EVENT`, `parseBeaconsRenderSnapshot(text)` and
`validateBeaconsRenderSnapshot(value)`. The type is available there and as a
type-only root export. The subpath compiles its own standalone shape validator;
it imports neither the eager RPC registry nor the root parser module. No runtime
export is added to the root, and the desktop first-load budget stays 393216 bytes.

Rust deserialization uses a validated `TryFrom` wrapper and the generated TS
parse door applies the same three invariants after schema validation:

- `intensity.visual_id` equals `visual.visual_id`.
- `package` is present if and only if `visual.design_id` is present.
- When present, `package.design_id` equals `visual.design_id`.

All records reject unknown fields. Absent package stays omitted on round-trip;
present null is rejected, including when the visual has no design. Standard JSON
Schema captures shape and conditional presence; arbitrary sibling ID equality is
checked by the generated public validator/parser, not by the internal shape
validator alone. Consumers must use that public parse door.

Snapshots contain **accepted state only**: the last committed visual, last
hash-verified package and last computed intensity, never an unsaved edit or an
unverified package. Each is a **full replacement, not a patch**. A visual without
a design is legal and renders a neutral placeholder. When a visual names a design
but the host has no verified package, it sends nothing until verification. Parsing
checks digest syntax and consistency; verifying package bytes, confinement and
consent remains the host's duty.

The identifier is exported from cc-types and its schema export's
`overlay_push_events` map, separate from `EventKind` and `BeaconsEventPayload`.
It is an overlay-host SSE push on `/push/beacons`, not an RPC, a control
`/events` kind or an invalidation. This delivery implements no producer, consumer,
host route, OBS refresh or renderer behavior. See ADR 0002 and WP 3.2 for those.

Snapshot validation in the builder worktree, base `93885a0`:

| Check | Evidence |
| --- | --- |
| Red first | New Rust tests failed with missing snapshot imports; the TS suite failed because `/beacons-render` was not exported |
| Rust boundary | `cargo --config net.offline=false test --locked -p cc-types --test beacons_render --test contract` passed: five snapshot tests and six contract/plan tests. Both legal states, all three consistency rules, both directions of conditional presence, unknown fields and present-null package are covered |
| TS boundary | Contract package tests passed: 139 tests in 13 files plus generator assertions. Final narrowed `src/beacons-render.test.ts` passed all 11 cases; it mirrors the Rust cases and checks nested boundaries and malformed JSON |
| Drift and parity | Fresh external schema/registry exports passed via the supported harness below: 19 generated files, 47 declared methods, 31 registered methods, 16 mirrored control-event kinds. The SSE identifier is in the separate `overlay_push_events` map |
| Scoped gates | Contract typecheck/lint, tooling ESLint, boundaries/hygiene/file-cap/secrets and `git diff --check` passed |
| Workspace Rust | The full gate with fresh external schema/registry inputs passed workspace format, Clippy with warnings denied, all non-ignored workspace tests and doc tests, including the 1,000-roll independent-verification property test. Build jobs stayed at 6; owner-run live tests and fixture-generation tests remained ignored |
| Desktop budget | In-memory Vite production build using this worktree's packages: 382338 / 393216 first-load JS+CSS bytes across three files; no render snapshot module in first load and no app artifact written |
| Offline verifier | The official `node packages/verifier-web/src/generate.ts` pipeline changed only the source-fingerprint comment (the contract export map is an input). All 17 verifier tests passed |

The ordinary `pnpm --config.verify-deps-before-run=false gate` passed its 14
tooling tests and inventories, then failed at the unchanged exporter's
`spawnSync cargo EPERM`. Recursive `-r typecheck`, `-r lint` and `-r test` each
failed with `spawn EPERM` before package checks ran. These match the environment
limitation already recorded for base in `docs/PLAN.md` and the art delivery above;
they are failures, not passes. The supported external-export harness below permits
drift/parity verification without changing the exporter, gate runners or CI.
With both fresh inputs set, the full gate passed tooling, drift/parity and all
Rust checks, then stopped at recursive typecheck with the same `spawn EPERM`.
The Director must run the ordinary full gate, recursive workspace checks and
desktop production build in its verification environment before merging.
No install, git write, credential access, live service call or producer/consumer
change is part of this delivery.

## Beacons art boundary (WP 3.4 contract delivery, 2026-10-27)

The lazy `@castle-control/contract/beacons` subpath exports `beaconsArtStatus`
and `beaconsArtGenerate`. Use the existing `parseMethodParams`/`parseMethodResult`
door with these handles. They are independently compiled from the legacy runtime
registry; no new eager runtime export is added to the root. All corresponding
types remain available as type-only root exports. No dependency is added.

`beacons.art.status` takes Empty and returns only `{ available }`, reporting
key presence without returning a secret or a keychain account label. Keychain
failure is an error, not an assertion that no key exists. Generation takes a
DesignId, a prompt, an explicit model and dimensions, quantity, a background-removal
flag and an optional package-relative reference. Omit reference for one anchor;
include a local reference for 1–8 matching images. Present null is invalid.
No caller can set `public`: the existing client always sets it to false.

Results carry the design ID, imported local assets with required `generated:true`
and provenance labels, plus nonempty exact cost receipts matching the client's
`{ call_id, model, charge }` shape. Credit amounts remain decimal strings;
micro-USD amounts are safe integers, with unsafe values rejected in Rust and TS.
An empty moderated asset set still retains its submission cost. No provider URL
or provider job/image identifier is exposed. Host-side anchor resolution,
downloads, filesystem confinement, metadata persistence, ledger writes, handlers,
registration and UI remain separate integration work. The client's README
explicitly defers its ledger writer; this contract does not claim one exists.

The plan's dated Beacons art table specifies every field and domain. The
simulated fixtures in `crates/cc-types/tests/beacons_art.rs` and
`src/beacons-art.test.ts` exercise round trips, omitted/null references, unknown
fields, private-only input, generated labels, local paths and exact costs.

Verification in the builder worktree on 2026-10-27, base `1c9d85a`:

| Check | Evidence |
| --- | --- |
| Red first | The new Rust test failed with missing art types (`E0425`); the new TS suite failed because the lazy art handles did not exist |
| Rust | `cargo --config net.offline=false test --locked --workspace` passed, including four art boundary tests and the existing 1,000-roll independent-verification property test. Explicit live and fixture-generation tests stayed ignored |
| Formatting and Clippy | Workspace formatting and `cargo --config net.offline=false clippy --locked --workspace --all-targets -- -D warnings` passed. A final scoped `cc-types` Clippy pass also covered the Unicode-whitespace schema refinement; build jobs stayed at 6 |
| Contract package | `pnpm --config.verify-deps-before-run=false --filter @castle-control/contract typecheck`, `lint` and `test` passed: 128 tests in 12 files, plus deterministic generator/drift assertions and independent eager/lazy validator parity |
| Export and registry | Fresh external schema/registry exports passed `check.mjs --schema` and `parity.mjs --schema --registry`: 16 generated files, 47 declared methods, 31 registered methods, 16 mirrored event kinds. New art methods remain unregistered |
| Repository checks | `node scripts/check.mjs`, `node scripts/tooling-lint.mjs` and `git diff --check` passed; boundaries/hygiene/file-cap walked 546 code files, final secrets inventory 681 files |
| Desktop budget | Production Vite build with `build.write:false` used this worktree's contract and passed at 382338 / 393216 first-load JS+CSS bytes across three files; no lazy Beacons validator module entered first load and no app artifact was written |
| Offline verifier | The official `node packages/verifier-web/src/generate.ts` pipeline regenerated the single HTML byte-for-byte unchanged. Its current fingerprint covers the shared JSON door rather than unused generated validators. All 17 verifier tests passed, including source-fingerprint and offline HTML checks |

The ordinary `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling
tests and workspace inventories, then failed at the contract exporter's existing
`spawnSync cargo EPERM`. Recursive `-r typecheck`, `-r lint` and `-r test` each
failed with `spawn EPERM` before package checks ran. These are failures, not
passes; they match the base environment limitation recorded in `docs/PLAN.md`.
The exporter spawn code, gate runners, dependency files, cc-beacons, core, apps
and verifier sources have no diff from base. No install, git write, paid API
call, keychain access or live test was performed. App Master must commit this
delivery and the Director must run the ordinary **`pnpm gate`**, recursive
workspace checks and desktop production build in its verification environment.

## Steward writ boundary (WP 5.1 contract delivery)

### Lazy Steward validator subpath (2026-10-28)

Re-delivered the held `0b6a16b` change onto base `6db28db`, which did not
expose `@castle-control/contract/steward`. The public subpath compiles the three
existing method handles and `stewardEventPayload` independently of the eager
root registry. It adds no wire identifier or schema change. The root also
exports the same handles for compatibility; generated validators stay pure
and tree-shakeable.

Validation in the builder worktree:

| Check | Evidence |
| --- | --- |
| Red/green | `steward-subpath.test.ts` first failed on its missing generated module, then all five tests passed; they compare independent eager/lazy validators against simulated fixtures |
| Schema/codegen | Generated from `src/generated/contract.schema.json` using the supported `--schema` input; all 19 existing generated artifacts remain unchanged, including wire schemas, types and method metadata; deterministic generation/drift/parity assertions pass for all 22 artifacts |
| Offline verifier | The fingerprint test failed after adding the package export; `pnpm --config.verify-deps-before-run=false --filter @castle-control/verifier-web generate` regenerated `index.html`; only its fingerprint comment changed, and all 17 tests pass, including no remote resources |
| Full workspace tests | `pnpm --config.verify-deps-before-run=false --workspace-concurrency=1 -r test` passed all six packages: 764 tests in 74 files, plus contract codegen assertions |
| Scoped checks | Individual `pnpm --config.verify-deps-before-run=false --filter <package> typecheck` and `lint` passed for contract and verifier-web; lint also passed global boundaries, hygiene, file-cap and secrets checks |
| Bundle budget | In-memory desktop production builds with HEAD root exports and worktree root exports both produced 382,467 / 393,216 first-load JS/CSS bytes across three files; all 49 output artifact names and SHA-256 hashes match; no app files were written |

The default concurrent recursive pnpm invocation failed before running checks
with the sandbox's existing `spawn EPERM` pipe limitation. Running the same
complete recursive test command with workspace concurrency one uses inherited
stdio and passes. No gate, sandbox policy, dependency install or bundle budget
was changed. No Rust source changed; the Director owns the final merge gate.

Owner ruling, 2026-10-28 (option 1): bind the three existing Steward RPC methods to their existing typed structs before AI-11 or createSteward integration; SIMULATED remains internal storage metadata, absent from the wire.

`steward.ask`, `steward.writ.seal` and `steward.writ.tear` are now typed in the
method table instead of `Pending`, using `AskParams/Result`, `WritSealParams/Result`
and `WritTearParams/Result` respectively; handler/registration work is separate.
`parseWrit(text)`
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

Binding validation, 2026-10-28: six Rust Steward tests, all `cc-types` tests and
the full Rust workspace suite pass (live tests remain disabled); all 140 contract
tests, generator assertions, contract typecheck/lint and workspace Rust
formatting/Clippy pass. New Rust/TS RPC tests first failed against
`Pending` and now pass, including rejection of internal simulation metadata.
Fresh generation through the documented harness passes drift; a seeded stale
`types.ts` fails the drift command and passes again after byte-for-byte restoration.
Workspace parity fails on the unchanged tracked `apps/overlay/bundle.js` JSON
parse, reproduced using the base schema as well. Recursive pnpm checks encounter
the already documented `spawn EPERM`; the Director must verify the full gate.

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
