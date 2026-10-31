# Gate evidence

2026-10-27, Windows; base commit `fece7d840520aa353f1efdfc997fd958e5c31309`,
plus the uncommitted WP 0.1 gate changes in this delivery. Historical foundation
proofs already exist in `docs/PLAN.md`; the brief's claim that none existed was
incorrect. This table refreshes them against the current runners.

Run `node scripts/closure-proofs.mjs` (exit 0: 46 verified non-zero results).
`<repo>` means this worktree. Fixtures under `scripts/.gate-proof/case-N` contain
byte-for-byte copies of the runners and minimal simulated inputs; all seeds and
fixtures are removed in `finally`. Generator-test imports are rebased to the real
modules, and its artifact-count assertion is seeded from 7 to 8. Contract CLI
proofs use their supported schema/registry inputs without editing generated code.
Every table row records the actual standalone process exit, inventory and first
relevant diagnostic. The synthetic token's value is never logged.

`pnpm gate` enumerates tooling Node tests, workspace scripts/inventory, complete
Cargo fetch, contract drift and method/event parity, Rust fmt/Clippy/tests,
recursive typecheck, lint (tooling and packages, including boundaries, hygiene,
file cap and secrets) and tests (Vitest plus contract generator Node assertions).
The table covers every distinct runner/check, rather than every test case.
Empty-root proofs use the check CLI's path argument or the wrappers' working
directory. Contract artifacts/usage accept a directory only through exported
functions; those are tested directly. Contract drift/parity CLIs have no project
root override. Generator assertions have no directory override and share the
tested Node assertion and contract-inventory checks. An empty committed generated
directory is reported as missing artifacts, not an empty-inventory error.

Cold-cache proof: **blocked by this session's TLS environment, not passed**.
`P` below was a newly created absolute directory outside the worktree, under this
run's writable results directory; `P/cargo-home` initially contained no files.

| Command (PowerShell environment) | Observed outcome |
| --- | --- |
| `$env:CARGO_HOME="$P/cargo-home"; $env:CARGO_TARGET_DIR="$P/target"; cargo --config net.offline=false test --locked -p cc-beacons --test dependency_direction` | Repeated Schannel TLS errors while resolving the empty registry, before compilation; stopped this owned Cargo process rather than wait through more retries. No dependency-direction result obtained. |
| Same home/target; `$env:CARGO_NET_RETRY='0'; $env:CARGO_HTTP_TIMEOUT='10'; node scripts/rust-gate.mjs fetch` | Wrapper exit 1, Cargo exit 101; `[cargo fetch] walked 238 files`; registry `config.json` download failed: `SEC_E_NO_CREDENTIALS (0x8009030e)`. No fetch success or subsequent test pass claimed. |
| `gh run view 40492972896 --log-failed` | Confirmed existing CI failure: `dependency inventory failed: error: failed to download aes v0.8.4`. This is CI evidence, not a local cold-cache reproduction. |

The unchanged dependency test still uses `--offline --locked --all-features
--target all`. Director must repeat the two cold-cache test/fetch steps on a
network-capable runner: retain the no-fetch dependency failure, then run the
shared fetch step and the same test successfully. A subsequent `windows-latest`
run on main after Director verification/push remains the final CI proof.

Local validation (no install; the existing `node_modules` junction was untouched):

| Command | Outcome |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false gate` | Exit 1: tooling tests passed 14/14, workspace inventories counted 6 manifests / 199 TypeScript files, full-lockfile fetch completed after walking 238 Rust files, then unchanged contract exporter failed with `spawnSync cargo EPERM`. No full gate pass claimed. |
| `pnpm --config.verify-deps-before-run=false typecheck` | Exit 1: recursive pnpm subprocess creation failed with `spawn EPERM`. |
| `pnpm --config.verify-deps-before-run=false lint` | Exit 1 at recursive pnpm `spawn EPERM`; preceding tooling ESLint and boundaries, hygiene, file-cap and secrets checks passed (504 code files, 630 scanned files). |
| `node scripts/rust-gate.mjs fmt` | Exit 0; walked 238 Rust files. |
| `node scripts/rust-gate.mjs clippy` | Exit 0; walked 238 Rust files; workspace/all-targets warnings denied. |
| `node scripts/rust-gate.mjs test` | Exit 0; walked 238 Rust files; full Rust workspace tests and doc tests passed. |
| Dependency-direction test within the independent Rust workspace run | `money_cannot_cross_into_draws_moderation_or_engine` passed, 1/1, using the normal registry cache after the shared fetch step. This does not substitute for the empty-cache proof. |

All three pnpm commands ran with `npm_config_verify_deps_before_run=false`.
The full gate and the independent Rust checks also used `CARGO_NET_RETRY=0` and
`CARGO_HTTP_TIMEOUT=10` to bound retry time without changing TLS validation.
The exporter and recursive pnpm failures occur in unchanged
code; earlier occurrences of the same `EPERM` restrictions are recorded in
`docs/PLAN.md`. No sandbox restriction was bypassed.

## WP 6.1 version drift and unsigned Windows configuration

2026-10-28, Windows, worktree `850be0fc`. Root `Cargo.toml`
`[workspace.package].version` is the authoritative product version. No protected
manifest was changed. This evidence is for the owner-free first slice, not the
remaining installer, signing, updater or cross-platform release exits.

The initial new test run exited 1: 8 tests passed and the NSIS configuration
assertion failed (`false !== true`). The initial real-tree version check exited
1 after walking 20 files, naming the missing version in
`apps/desktop/src-tauri/tauri.conf.json`. Adding its checked version mirror and
enabling only NSIS bundling resolved both failures.

Final narrowed command (exit 0):
`node --test --test-isolation=none scripts/version-drift.test.mjs`.
All 10 tests passed, including the actual standalone CLI exit check. Its logged
red/green sequence was:

```text
[version drift] walked 8 files
Version drift:
packages/proof/package.json: expected 0.1.0, found 0.2.0
[version proof] standalone RED exit 1
[version drift] walked 8 files
[version drift] all manifests match Cargo.toml [workspace.package] version 0.1.0
[version proof] standalone GREEN exit 0
```

`closure-proof-cases.mjs` registers the bumped-package proof and an empty-root
proof. Both new registrations were also run alone through a temporary-fixture
callback (without rerunning unrelated closure cases): the drift fixture walked
6 files and exited 1 naming `package.json` (`expected 0.1.0, found 0.2.0`); after
restoration it walked 6 files and exited 0. The empty fixture walked 0 files,
printed `version drift: refused empty inventory`, and exited 1. All fixtures were
removed in `finally`. The reusable full proof entry point remains
`node scripts/closure-proofs.mjs`; its historical table below was not regenerated.

Final real-tree command `node scripts/version-drift.mjs` exited 0:

```text
[version drift] walked 20 files
[version drift] all manifests match Cargo.toml [workspace.package] version 0.1.0
```

`pnpm --config.verify-deps-before-run=false gate` was attempted once with
`npm_config_verify_deps_before_run=false` and `CARGO_BUILD_JOBS=6`. It exited 1.
It ran the new version gate (20 files, green), tooling tests (2 test files,
23 tests green at that point), workspace checks (6 manifests, 221 TS files),
and Cargo fetch (256 Rust files). The existing contract exporter then failed:
`Error: spawnSync cargo EPERM`, while attempting
`cargo --config net.offline=false run --quiet -p cc-types --bin export-contract`.
The exporter and spawn runner are unchanged from the base (`git diff` for those
paths is empty). Rust fmt/Clippy/tests and the subsequent recursive checks were
not reached by this full-gate attempt. The final added standalone CLI test was
run by the final 10-test narrowed command above.

`pnpm --config.verify-deps-before-run=false typecheck` exited 1 with `spawn EPERM`
when recursive package lifecycles started. `pnpm
--config.verify-deps-before-run=false lint` likewise exited 1 at recursive package
lifecycles, after tooling ESLint (17 files), workspace inventory, boundaries,
hygiene and file-cap checks (558 files each), and secrets (693 files) passed.
Final scoped ESLint for the four touched tooling files exited 0; `git diff
--check` also passed. These sandbox failures are not passing typecheck/lint gates.

`cargo tauri --version` failed: `error: no such command: tauri`. The release
bundle was therefore not attempted; no CLI/dependency install, release artifact,
signing, updater, clean-machine install or update rehearsal is claimed. The
packaging procedure and intended per-platform artifact inventory are in
[release/packaging.md](release/packaging.md); its NSIS configuration supersedes
the historical M0 bundling-disabled note in the desktop README.

Director follow-up: rerun `pnpm --config.verify-deps-before-run=false gate` in the
authorized verification environment, including Rust and recursive package gates;
run `node scripts/closure-proofs.mjs` to refresh the full proof table if needed.
With an already-installed Tauri 2 CLI and sufficient build budget, follow
`release/packaging.md` to build and inspect the unsigned Windows NSIS installer.
Signing/updater keys and release publishing remain owner steps. `pnpm install`
was not run, and no junction, git metadata, protected manifest or other worktree
was modified.

<!-- current red-once proofs -->

| Gate / seed | Standalone command | Exit | Inventory | First relevant diagnostic |
| --- | --- | --- | --- | --- |
| Site check: built JS exceeds byte budget | `node <repo>/apps/site/check.mjs <repo>/scripts/.gate-proof/case-1/apps/site/dist`<br>cwd: `<repo>/scripts/.gate-proof/case-1` | 1 | `[site built] walked 2 files` | `Error: Site first-load bytes 184717 exceed 180 KiB budget (184320 bytes)` |
| Desktop budget: first load over budget | `node <repo>/apps/desktop/src/check-build.ts <repo>/scripts/.gate-proof/case-2/apps/desktop/dist`<br>cwd: `<repo>/scripts/.gate-proof/case-2` | 1 | `[desktop first-load budget, all four routes] walked 2 files; 406236/393216 uncompressed JS+CSS bytes` | `Error: Desktop first-load budget exceeded` |
| Kit budget: first load over budget | `node <repo>/packages/ui/src/check-build.ts <repo>/scripts/.gate-proof/case-3/packages/ui/dist`<br>cwd: `<repo>/scripts/.gate-proof/case-3` | 1 | `[kit first-load budget] walked 2 files; 275164/262144 uncompressed JS+CSS bytes` | `Error: Kit first-load budget exceeded` |
| Version drift: bumped package manifest | `node <repo>/scripts/version-drift.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-4` | 1 | `[version drift] walked 6 files` | `package.json: expected 0.1.0, found 0.2.0` |
| Empty version drift | `node <repo>/scripts/version-drift.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-5` | 1 | `[version drift] walked 0 files` | `version drift: refused empty inventory` |
| Rust format: unformatted function | `node <repo>/scripts/.gate-proof/case-6/scripts/rust-gate.mjs fmt`<br>cwd: `<repo>/scripts/.gate-proof/case-6` | 1 | `[cargo fmt] walked 1 files` | `Diff in //?/<repo>/scripts/.gate-proof/case-6/crates/proof/src/lib.rs:1:` |
| Rust Clippy: identity operation | `node <repo>/scripts/.gate-proof/case-7/scripts/rust-gate.mjs clippy`<br>cwd: `<repo>/scripts/.gate-proof/case-7` | 1 | `[cargo clippy] walked 1 files` | `error: this operation has no effect` |
| Rust tests: false assertion | `node <repo>/scripts/.gate-proof/case-8/scripts/rust-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-8` | 1 | `[cargo test] walked 1 files` | `simulated seeded failure` |
| Cargo fetch: stale lockfile | `node <repo>/scripts/.gate-proof/case-9/scripts/rust-gate.mjs fetch`<br>cwd: `<repo>/scripts/.gate-proof/case-9` | 1 | `[cargo fetch] walked 1 files` | `error: cannot update the lock file <repo>/scripts/.gate-proof/case-9/Cargo.lock because --locked was passed to prevent this` |
| TypeScript: number assigned to string | `node <repo>/scripts/.gate-proof/case-10/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-10/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `src/index.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'.` |
| TypeScript strict: disabled | `node <repo>/scripts/.gate-proof/case-11/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-11/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: strict=true` |
| TypeScript noUncheckedIndexedAccess: disabled | `node <repo>/scripts/.gate-proof/case-12/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-12/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: noUncheckedIndexedAccess=true` |
| TypeScript exactOptionalPropertyTypes: disabled | `node <repo>/scripts/.gate-proof/case-13/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-13/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: exactOptionalPropertyTypes=true` |
| TypeScript verbatimModuleSyntax: disabled | `node <repo>/scripts/.gate-proof/case-14/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-14/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: verbatimModuleSyntax=true` |
| TypeScript erasableSyntaxOnly: disabled | `node <repo>/scripts/.gate-proof/case-15/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-15/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: erasableSyntaxOnly=true` |
| Package ESLint: unused variable | `node <repo>/scripts/.gate-proof/case-16/scripts/package-gate.mjs lint`<br>cwd: `<repo>/scripts/.gate-proof/case-16/packages/proof` | 1 | `[pnpm lint] walked 1 files`<br>`[boundaries] walked 15 files`<br>`[hygiene] walked 15 files`<br>`[type-floor] walked 1 files`<br>`[file-cap] walked 15 files`<br>`[secrets] walked 22 files` | `  1:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars` |
| Tooling ESLint: unused variable | `node <repo>/scripts/.gate-proof/case-17/scripts/tooling-lint.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-17` | 1 | `[tooling eslint] walked 12 files`<br>`[workspace manifests] walked 1 files`<br>`[workspace TypeScript] walked 1 files`<br>`[boundaries] walked 16 files`<br>`[hygiene] walked 16 files`<br>`[type-floor] walked 1 files`<br>`[file-cap] walked 16 files`<br>`[secrets] walked 23 files` | `  1:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars` |
| Vitest: false expectation | `node <repo>/scripts/.gate-proof/case-18/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-18/packages/proof` | 1 | `[pnpm test] walked 2 files`<br>`[pnpm test cases] walked 1 files` | `AssertionError: expected false to be true // Object.is equality` |
| Import boundary: cross-package relative import | `node <repo>/scripts/.gate-proof/case-19/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-19` | 1 | `[boundaries] walked 15 files` | `<repo>/scripts/.gate-proof/case-19/packages/proof/src/index.ts: cross-package relative import ../../../scripts/files.mjs` |
| Import boundary: private workspace subpath | `node <repo>/scripts/.gate-proof/case-20/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-20` | 1 | `[boundaries] walked 15 files` | `<repo>/scripts/.gate-proof/case-20/packages/proof/src/index.ts: workspace deep import simulated-proof-package/private` |
| Import cycle: mutual imports | `node <repo>/scripts/.gate-proof/case-21/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-21` | 1 | `[boundaries] walked 16 files` | `import cycle: <repo>/scripts/.gate-proof/case-21/packages/proof/src/index.ts` |
| No any | `node <repo>/scripts/.gate-proof/case-22/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-22` | 1 | `[hygiene] walked 15 files` | `<repo>/scripts/.gate-proof/case-22/packages/proof/src/index.ts:1: no any` |
| No double assertion | `node <repo>/scripts/.gate-proof/case-23/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-23` | 1 | `[hygiene] walked 15 files` | `<repo>/scripts/.gate-proof/case-23/packages/proof/src/index.ts:1: no as unknown as` |
| No raw keydown | `node <repo>/scripts/.gate-proof/case-24/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-24` | 1 | `[hygiene] walked 15 files` | `<repo>/scripts/.gate-proof/case-24/packages/proof/src/index.ts:1: use the keymap registry` |
| No swallowed catch | `node <repo>/scripts/.gate-proof/case-25/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-25` | 1 | `[hygiene] walked 15 files` | `<repo>/scripts/.gate-proof/case-25/packages/proof/src/index.ts:1: no swallowed catch` |
| 400-line cap: 401 comment lines | `node <repo>/scripts/.gate-proof/case-26/scripts/check.mjs file-cap`<br>cwd: `<repo>/scripts/.gate-proof/case-26` | 1 | `[file-cap] walked 15 files` | `packages/proof/src/index.ts: 401 lines exceeds 400` |
| Secrets: synthetic provider-token shape (value omitted) | `node <repo>/scripts/.gate-proof/case-27/scripts/check.mjs secrets`<br>cwd: `<repo>/scripts/.gate-proof/case-27` | 1 | `[secrets] walked 23 files` | `simulated-secret.txt: potential secret (value redacted)` |
| Workspace scripts: blank test script | `node <repo>/scripts/.gate-proof/case-28/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-28` | 1 | `[workspace manifests] walked 1 files` | `Error: packages/proof/package.json: missing test script` |
| Type floor: raw px font size | `node <repo>/scripts/.gate-proof/case-29/scripts/check.mjs type-floor`<br>cwd: `<repo>/scripts/.gate-proof/case-29` | 1 | `[type-floor] walked 2 files` | `packages/ui/src/seed.css:1: font size must use a --text-* token` |
| Type floor: token below floor | `node <repo>/scripts/.gate-proof/case-30/scripts/check.mjs type-floor`<br>cwd: `<repo>/scripts/.gate-proof/case-30` | 1 | `[type-floor] walked 1 files` | `generated.css: --text-tiny is 12px, below the 13px floor` |
| Type floor: stage token below stage floor | `node <repo>/scripts/.gate-proof/case-31/scripts/check.mjs type-floor`<br>cwd: `<repo>/scripts/.gate-proof/case-31` | 1 | `[type-floor] walked 1 files` | `generated.css: --text-stage-x is 14px, below the 15px floor` |
| Type floor: TSX literal below floor | `node <repo>/scripts/.gate-proof/case-32/scripts/check.mjs type-floor`<br>cwd: `<repo>/scripts/.gate-proof/case-32` | 1 | `[type-floor] walked 2 files` | `packages/ui/src/seed.tsx:2: font size 12 is below the 13px floor` |
| Contract codegen: stale schema | `node <repo>/packages/contract/scripts/check.mjs --schema <repo>/scripts/.gate-proof/case-33/schema.json`<br>cwd: `<repo>/scripts/.gate-proof/case-33` | 1 | `[contract generated] walked 26 files`<br>`[contract committed] walked 26 files` | `Error: Contract drift: stale contract.schema.json, stale schemas.ts. Run pnpm -C packages/contract generate` |
| Method parity: undeclared registration | `node <repo>/packages/contract/scripts/parity.mjs --schema <repo>/packages/contract/src/generated/contract.schema.json --registry <repo>/scripts/.gate-proof/case-34/registry.json`<br>cwd: `<repo>/scripts/.gate-proof/case-34` | 1 | `[contract usage] walked 488 files`<br>`[method parity] walked 488 files`<br>`[event parity] walked 488 files` | `Error: registered but undeclared: simulated.unregistered` |
| Event parity: missing mirror | `node <repo>/packages/contract/scripts/parity.mjs --schema <repo>/scripts/.gate-proof/case-35/schema.json --registry <repo>/scripts/.gate-proof/case-35/registry.json`<br>cwd: `<repo>/scripts/.gate-proof/case-35` | 1 | `[contract usage] walked 488 files`<br>`[method parity] walked 488 files`<br>`[event parity] walked 488 files` | `Error: missing mirrored event: simulated.event` |
| Contract usage: source parse rejected and named build output excluded | `node <repo>/scripts/.gate-proof/case-36/usage.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-36` | 1 | `[contract usage] walked 3 files` | `[proof verified] source JSON.parse rejected; named build output excluded` |
| Contract usage: stale build output exclusion | `node <repo>/scripts/.gate-proof/case-37/usage.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-37` | 1 | `[contract usage] walked 2 files` | `Error: Missing listed build output: apps/overlay/vote-bar.js` |
| Tooling node tests: failing assertion | `node <repo>/scripts/.gate-proof/case-38/scripts/tooling-test.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-38` | 1 | `[tooling tests] walked 1 files` | `  Error: simulated node failure` |
| Generator node assertions: wrong artifact count | `node <repo>/scripts/.gate-proof/case-39/generator/test-codegen.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-39` | 1 | `[contract generator tests] walked 3 files` | `26 !== 27` |
| Empty boundaries | `node <repo>/scripts/check.mjs boundaries <repo>/scripts/.gate-proof/case-40`<br>cwd: `<repo>/scripts/.gate-proof/case-40` | 1 | `[boundaries] walked 0 files` | `Error: boundaries: refused empty inventory` |
| Empty hygiene | `node <repo>/scripts/check.mjs hygiene <repo>/scripts/.gate-proof/case-41`<br>cwd: `<repo>/scripts/.gate-proof/case-41` | 1 | `[hygiene] walked 0 files` | `Error: hygiene: refused empty inventory` |
| Empty file-cap | `node <repo>/scripts/check.mjs file-cap <repo>/scripts/.gate-proof/case-42`<br>cwd: `<repo>/scripts/.gate-proof/case-42` | 1 | `[file-cap] walked 0 files` | `Error: file-cap: refused empty inventory` |
| Empty secrets | `node <repo>/scripts/check.mjs secrets <repo>/scripts/.gate-proof/case-43`<br>cwd: `<repo>/scripts/.gate-proof/case-43` | 1 | `[secrets] walked 0 files` | `Error: secrets: refused empty inventory` |
| Empty type-floor | `node <repo>/scripts/check.mjs type-floor <repo>/scripts/.gate-proof/case-44`<br>cwd: `<repo>/scripts/.gate-proof/case-44` | 1 | `[type-floor] walked 0 files` | `Error: type-floor: refused empty inventory` |
| Empty Rust fetch | `node <repo>/scripts/rust-gate.mjs fetch`<br>cwd: `<repo>/scripts/.gate-proof/case-45` | 1 | `[cargo fetch] walked 0 files` | `Error: cargo fetch: refused empty inventory` |
| Empty Rust fmt | `node <repo>/scripts/rust-gate.mjs fmt`<br>cwd: `<repo>/scripts/.gate-proof/case-46` | 1 | `[cargo fmt] walked 0 files` | `Error: cargo fmt: refused empty inventory` |
| Empty Rust clippy | `node <repo>/scripts/rust-gate.mjs clippy`<br>cwd: `<repo>/scripts/.gate-proof/case-47` | 1 | `[cargo clippy] walked 0 files` | `Error: cargo clippy: refused empty inventory` |
| Empty Rust test | `node <repo>/scripts/rust-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-48` | 1 | `[cargo test] walked 0 files` | `Error: cargo test: refused empty inventory` |
| Empty package typecheck | `node <repo>/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-49` | 1 | `[pnpm typecheck] walked 0 files` | `Error: pnpm typecheck: refused empty inventory` |
| Empty package lint | `node <repo>/scripts/package-gate.mjs lint`<br>cwd: `<repo>/scripts/.gate-proof/case-50` | 1 | `[pnpm lint] walked 0 files` | `Error: pnpm lint: refused empty inventory` |
| Empty package test | `node <repo>/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-51` | 1 | `[pnpm test] walked 0 files` | `Error: pnpm test: refused empty inventory` |
| Empty package test cases | `node <repo>/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-52` | 1 | `[pnpm test] walked 1 files`<br>`[pnpm test cases] walked 0 files` | `Error: pnpm test cases: refused empty inventory` |
| Empty tooling ESLint | `node <repo>/scripts/tooling-lint.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-53` | 1 | `[tooling eslint] walked 0 files` | `Error: tooling eslint: refused empty inventory` |
| Empty tooling node tests | `node <repo>/scripts/tooling-test.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-54` | 1 | `[tooling tests] walked 0 files` | `Error: tooling tests: refused empty inventory` |
| Empty workspace manifests | `node <repo>/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-55` | 1 | `[workspace manifests] walked 0 files` | `Error: workspace manifests: refused empty inventory` |
| Empty workspace TypeScript | `node <repo>/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-56` | 1 | `[workspace manifests] walked 1 files`<br>`[workspace TypeScript] walked 0 files` | `Error: workspace TypeScript: refused empty inventory` |
| Empty contract artifacts | `node <repo>/scripts/.gate-proof/case-57/empty.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-57` | 1 | `[contract generated] walked 0 files` | `Error: Refused empty generated inventory` |
| Empty contract usage | `node <repo>/scripts/.gate-proof/case-58/empty.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-58` | 1 | `[contract usage] walked 0 files` | `Error: Refused empty usage inventory` |
| Duel engine: DOM reference without DOM lib | `node <repo>/scripts/.gate-proof/case-59/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-59/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `src/index.ts(1,22): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.` |

## T1 Cutaway Keep / T2 Tiltyard merge resolution

2026-10-31, Windows, T2 merge HEAD `9d4b734` on `origin/main` `1562c64`,
with the T1 merge in progress. Files were edited without changing the Git index.
The proof table retains T1's cases 1–58 and T2's unique DOM-free engine proof as
case 59, matching the merged `closureCases` registration order. Historical
proofs were preserved, not rerun or presented as new results.

- Map Room retains Table, Spyglass, Rehearse and the lazy Tiltyard view, T1's
  room styling, and `data-studio-view` for the compact hex-table height fix.
  The compact fixed height excludes Tiltyard, preserving its content height
  and keeping the inspector below the complete duel stage.
  The desktop tests cover the four-button switch, compact field geometry,
  core-mode studio routing and live `/events` ballot intake.
- The build checker retains T1's 393,216-byte first-load budget, token-definition
  check and optional build directory, plus T2's 98,304-byte duel chunk budget.
  Simulated temporary fixtures passed at 13,053 first-load / 55 duel bytes;
  separate oversized fixtures failed with `Desktop first-load budget exceeded`
  (406,236 bytes) and `Duel chunk budget exceeded` (98,334 bytes), respectively.
  Fixtures were removed. These are checker proofs, not production build sizes.
- UI exports include `./duel`, `./stamp` and `./stamp.css`; both sides' package
  scripts and dependencies remain. `src/index.ts` already retains T1's Stamp,
  RoomTitle, Kbd and entrance exports and every T2 root export. T2 introduced no
  root-index exports; its public duel entry remains the lazy `./duel` subpath.
  No T2 caller uses removed StatusChip props or `--text-width`.
- Duel CSS now uses T1 text tokens. Local responsive size inputs use shared
  text values and the floor gate's supported text-token fallbacks. Original
  responsive bounds remain 22–36, 24–40, 30–48, 34–52, 30–58 and 24–38 px.
  Existing 13, 13.5 and 15 px roles remain exact. The shared CSS test leaves
  duel's local palette and container breakpoints to its dedicated counted CSS
  checker; that checker recognizes T1's shared type-token group. The button
  cascade test now expects the migrated text token.

| Former duel role | Before | After |
| --- | ---: | ---: |
| `--ty-text-countdown` | 10 px | 13 px |
| `--ty-text-column` | 10.5 px | 13 px |
| `--ty-text-number-small` | 11 px | 13 px |
| `--ty-text-seed` | 11.5 px | 13 px |
| `--ty-text-small` | 12 px | 13 px |
| `--ty-text-detail` | 12.5 px | 13 px |

Validation used existing dependencies; no modules directory or junction was
replaced. `pnpm install --frozen-lockfile` and plain `pnpm gate` aborted with
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. The lockfile is the complete T2
side, byte-for-byte, with no hand merge. **The Director must run `pnpm install`
to regenerate it for both ports before the canonical gates.**

`pnpm --config.verify-deps-before-run=false gate` passed version drift, 35
tooling tests, workspace inventory (9 manifests / 598 TS files) and Cargo fetch
(342 Rust files), then failed at the unchanged contract exporter with
`spawnSync cargo EPERM`. Contract parity, Rust fmt/Clippy/tests, recursive gates
and production builds were not reached. Recursive `typecheck` and `test` with
the same pnpm option each failed at lifecycle creation with `spawn EPERM`.
Direct unaliased UI/duel checks also exposed the incomplete installation's
missing duel/contract links and local Node types. No canonical gate pass is
claimed; browser E2E and production builds were not run.

Supplemental checks ran via inline `node --input-type=module` scripts. The
TypeScript compiler API and Vitest `startVitest` received exact absolute aliases
from the workspace manifests' string exports; TypeScript also received the
existing `packages/ui/node_modules/@types` as its type root. All inherited
strict flags, `skipLibCheck: false`, package libraries and test assertions were
retained. No resolver configuration was written. Vitest used the threads pool.

| Package | Strict typecheck inventory / diagnostics | Unit test files / passed |
| --- | --- | --- |
| `packages/duel` | 33 / 0 | 13 / 381 |
| `packages/ui` | 116 / 0 | 37 / 486 |
| `apps/desktop` | 280 / 0 | 106 / 1,031 |
| `packages/tokens` | 12 / 0 | 4 / 20 |

All 1,918 supplemental unit tests passed without skips or unhandled errors.
The initial UI run exposed the shared CSS inventory collision and the old
button font-token expectation; the final UI rerun passed after those fixes.
`node scripts/check.mjs` passed boundaries, hygiene, type-floor, file-cap and
secrets checks; direct ESLint of all five edited TS/TSX files and
`git diff --check` passed. After excluding Tiltyard from the compact fixed
height, the board-view and Tiltyard-view suites passed again (16/16), followed
by the complete source checks. No conflict markers remain in files; the
Director still owns staging and the merge commit.
