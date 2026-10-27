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

<!-- current red-once proofs -->

| Gate / seed | Standalone command | Exit | Inventory | First relevant diagnostic |
| --- | --- | --- | --- | --- |
| Rust format: unformatted function | `node <repo>/scripts/.gate-proof/case-1/scripts/rust-gate.mjs fmt`<br>cwd: `<repo>/scripts/.gate-proof/case-1` | 1 | `[cargo fmt] walked 1 files` | `Diff in //?/<repo>/scripts/.gate-proof/case-1/crates/proof/src/lib.rs:1:` |
| Rust Clippy: identity operation | `node <repo>/scripts/.gate-proof/case-2/scripts/rust-gate.mjs clippy`<br>cwd: `<repo>/scripts/.gate-proof/case-2` | 1 | `[cargo clippy] walked 1 files` | `error: this operation has no effect` |
| Rust tests: false assertion | `node <repo>/scripts/.gate-proof/case-3/scripts/rust-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-3` | 1 | `[cargo test] walked 1 files` | `simulated seeded failure` |
| Cargo fetch: stale lockfile | `node <repo>/scripts/.gate-proof/case-4/scripts/rust-gate.mjs fetch`<br>cwd: `<repo>/scripts/.gate-proof/case-4` | 1 | `[cargo fetch] walked 1 files` | `error: cannot update the lock file <repo>/scripts/.gate-proof/case-4/Cargo.lock because --locked was passed to prevent this` |
| TypeScript: number assigned to string | `node <repo>/scripts/.gate-proof/case-5/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-5/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `src/index.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'.` |
| TypeScript strict: disabled | `node <repo>/scripts/.gate-proof/case-6/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-6/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: strict=true` |
| TypeScript noUncheckedIndexedAccess: disabled | `node <repo>/scripts/.gate-proof/case-7/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-7/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: noUncheckedIndexedAccess=true` |
| TypeScript exactOptionalPropertyTypes: disabled | `node <repo>/scripts/.gate-proof/case-8/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-8/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: exactOptionalPropertyTypes=true` |
| TypeScript verbatimModuleSyntax: disabled | `node <repo>/scripts/.gate-proof/case-9/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-9/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: verbatimModuleSyntax=true` |
| TypeScript erasableSyntaxOnly: disabled | `node <repo>/scripts/.gate-proof/case-10/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-10/packages/proof` | 1 | `[pnpm typecheck] walked 1 files` | `Error: Required TypeScript option: erasableSyntaxOnly=true` |
| Package ESLint: unused variable | `node <repo>/scripts/.gate-proof/case-11/scripts/package-gate.mjs lint`<br>cwd: `<repo>/scripts/.gate-proof/case-11/packages/proof` | 1 | `[pnpm lint] walked 1 files`<br>`[boundaries] walked 13 files`<br>`[hygiene] walked 13 files`<br>`[file-cap] walked 13 files`<br>`[secrets] walked 20 files` | `  1:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars` |
| Tooling ESLint: unused variable | `node <repo>/scripts/.gate-proof/case-12/scripts/tooling-lint.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-12` | 1 | `[tooling eslint] walked 11 files`<br>`[workspace manifests] walked 1 files`<br>`[workspace TypeScript] walked 1 files`<br>`[boundaries] walked 14 files`<br>`[hygiene] walked 14 files`<br>`[file-cap] walked 14 files`<br>`[secrets] walked 21 files` | `  1:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars` |
| Vitest: false expectation | `node <repo>/scripts/.gate-proof/case-13/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-13/packages/proof` | 1 | `[pnpm test] walked 2 files`<br>`[pnpm test cases] walked 1 files` | `AssertionError: expected false to be true // Object.is equality` |
| Import boundary: cross-package relative import | `node <repo>/scripts/.gate-proof/case-14/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-14` | 1 | `[boundaries] walked 13 files` | `<repo>/scripts/.gate-proof/case-14/packages/proof/src/index.ts: cross-package relative import ../../../scripts/files.mjs` |
| Import boundary: private workspace subpath | `node <repo>/scripts/.gate-proof/case-15/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-15` | 1 | `[boundaries] walked 13 files` | `<repo>/scripts/.gate-proof/case-15/packages/proof/src/index.ts: workspace deep import simulated-proof-package/private` |
| Import cycle: mutual imports | `node <repo>/scripts/.gate-proof/case-16/scripts/check.mjs boundaries`<br>cwd: `<repo>/scripts/.gate-proof/case-16` | 1 | `[boundaries] walked 14 files` | `import cycle: <repo>/scripts/.gate-proof/case-16/packages/proof/src/index.ts` |
| No any | `node <repo>/scripts/.gate-proof/case-17/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-17` | 1 | `[hygiene] walked 13 files` | `<repo>/scripts/.gate-proof/case-17/packages/proof/src/index.ts:1: no any` |
| No double assertion | `node <repo>/scripts/.gate-proof/case-18/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-18` | 1 | `[hygiene] walked 13 files` | `<repo>/scripts/.gate-proof/case-18/packages/proof/src/index.ts:1: no as unknown as` |
| No raw keydown | `node <repo>/scripts/.gate-proof/case-19/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-19` | 1 | `[hygiene] walked 13 files` | `<repo>/scripts/.gate-proof/case-19/packages/proof/src/index.ts:1: use the keymap registry` |
| No swallowed catch | `node <repo>/scripts/.gate-proof/case-20/scripts/check.mjs hygiene`<br>cwd: `<repo>/scripts/.gate-proof/case-20` | 1 | `[hygiene] walked 13 files` | `<repo>/scripts/.gate-proof/case-20/packages/proof/src/index.ts:1: no swallowed catch` |
| 400-line cap: 401 comment lines | `node <repo>/scripts/.gate-proof/case-21/scripts/check.mjs file-cap`<br>cwd: `<repo>/scripts/.gate-proof/case-21` | 1 | `[file-cap] walked 13 files` | `packages/proof/src/index.ts: 401 lines exceeds 400` |
| Secrets: synthetic provider-token shape (value omitted) | `node <repo>/scripts/.gate-proof/case-22/scripts/check.mjs secrets`<br>cwd: `<repo>/scripts/.gate-proof/case-22` | 1 | `[secrets] walked 21 files` | `simulated-secret.txt: potential secret (value redacted)` |
| Workspace scripts: blank test script | `node <repo>/scripts/.gate-proof/case-23/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-23` | 1 | `[workspace manifests] walked 1 files` | `Error: packages/proof/package.json: missing test script` |
| Contract codegen: stale schema | `node <repo>/packages/contract/scripts/check.mjs --schema <repo>/scripts/.gate-proof/case-24/schema.json`<br>cwd: `<repo>/scripts/.gate-proof/case-24` | 1 | `[contract generated] walked 7 files`<br>`[contract committed] walked 7 files` | `Error: Contract drift: stale contract.schema.json, stale schemas.ts. Run pnpm -C packages/contract generate` |
| Method parity: undeclared registration | `node <repo>/packages/contract/scripts/parity.mjs --schema <repo>/packages/contract/src/generated/contract.schema.json --registry <repo>/scripts/.gate-proof/case-25/registry.json`<br>cwd: `<repo>/scripts/.gate-proof/case-25` | 1 | `[contract usage] walked 288 files`<br>`[method parity] walked 288 files`<br>`[event parity] walked 288 files` | `Error: registered but undeclared: simulated.unregistered` |
| Event parity: missing mirror | `node <repo>/packages/contract/scripts/parity.mjs --schema <repo>/scripts/.gate-proof/case-26/schema.json --registry <repo>/scripts/.gate-proof/case-26/registry.json`<br>cwd: `<repo>/scripts/.gate-proof/case-26` | 1 | `[contract usage] walked 288 files`<br>`[method parity] walked 288 files`<br>`[event parity] walked 288 files` | `Error: missing mirrored event: simulated.event` |
| Tooling node tests: failing assertion | `node <repo>/scripts/.gate-proof/case-27/scripts/tooling-test.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-27` | 1 | `[tooling tests] walked 1 files` | `  Error: simulated node failure` |
| Generator node assertions: wrong artifact count | `node <repo>/scripts/.gate-proof/case-28/generator/test-codegen.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-28` | 1 | `[contract generator tests] walked 3 files` | `7 !== 8` |
| Empty boundaries | `node <repo>/scripts/check.mjs boundaries <repo>/scripts/.gate-proof/case-29`<br>cwd: `<repo>/scripts/.gate-proof/case-29` | 1 | `[boundaries] walked 0 files` | `Error: boundaries: refused empty inventory` |
| Empty hygiene | `node <repo>/scripts/check.mjs hygiene <repo>/scripts/.gate-proof/case-30`<br>cwd: `<repo>/scripts/.gate-proof/case-30` | 1 | `[hygiene] walked 0 files` | `Error: hygiene: refused empty inventory` |
| Empty file-cap | `node <repo>/scripts/check.mjs file-cap <repo>/scripts/.gate-proof/case-31`<br>cwd: `<repo>/scripts/.gate-proof/case-31` | 1 | `[file-cap] walked 0 files` | `Error: file-cap: refused empty inventory` |
| Empty secrets | `node <repo>/scripts/check.mjs secrets <repo>/scripts/.gate-proof/case-32`<br>cwd: `<repo>/scripts/.gate-proof/case-32` | 1 | `[secrets] walked 0 files` | `Error: secrets: refused empty inventory` |
| Empty Rust fetch | `node <repo>/scripts/rust-gate.mjs fetch`<br>cwd: `<repo>/scripts/.gate-proof/case-33` | 1 | `[cargo fetch] walked 0 files` | `Error: cargo fetch: refused empty inventory` |
| Empty Rust fmt | `node <repo>/scripts/rust-gate.mjs fmt`<br>cwd: `<repo>/scripts/.gate-proof/case-34` | 1 | `[cargo fmt] walked 0 files` | `Error: cargo fmt: refused empty inventory` |
| Empty Rust clippy | `node <repo>/scripts/rust-gate.mjs clippy`<br>cwd: `<repo>/scripts/.gate-proof/case-35` | 1 | `[cargo clippy] walked 0 files` | `Error: cargo clippy: refused empty inventory` |
| Empty Rust test | `node <repo>/scripts/rust-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-36` | 1 | `[cargo test] walked 0 files` | `Error: cargo test: refused empty inventory` |
| Empty package typecheck | `node <repo>/scripts/package-gate.mjs typecheck`<br>cwd: `<repo>/scripts/.gate-proof/case-37` | 1 | `[pnpm typecheck] walked 0 files` | `Error: pnpm typecheck: refused empty inventory` |
| Empty package lint | `node <repo>/scripts/package-gate.mjs lint`<br>cwd: `<repo>/scripts/.gate-proof/case-38` | 1 | `[pnpm lint] walked 0 files` | `Error: pnpm lint: refused empty inventory` |
| Empty package test | `node <repo>/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-39` | 1 | `[pnpm test] walked 0 files` | `Error: pnpm test: refused empty inventory` |
| Empty package test cases | `node <repo>/scripts/package-gate.mjs test`<br>cwd: `<repo>/scripts/.gate-proof/case-40` | 1 | `[pnpm test] walked 1 files`<br>`[pnpm test cases] walked 0 files` | `Error: pnpm test cases: refused empty inventory` |
| Empty tooling ESLint | `node <repo>/scripts/tooling-lint.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-41` | 1 | `[tooling eslint] walked 0 files` | `Error: tooling eslint: refused empty inventory` |
| Empty tooling node tests | `node <repo>/scripts/tooling-test.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-42` | 1 | `[tooling tests] walked 0 files` | `Error: tooling tests: refused empty inventory` |
| Empty workspace manifests | `node <repo>/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-43` | 1 | `[workspace manifests] walked 0 files` | `Error: workspace manifests: refused empty inventory` |
| Empty workspace TypeScript | `node <repo>/scripts/workspaces.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-44` | 1 | `[workspace manifests] walked 1 files`<br>`[workspace TypeScript] walked 0 files` | `Error: workspace TypeScript: refused empty inventory` |
| Empty contract artifacts | `node <repo>/scripts/.gate-proof/case-45/empty.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-45` | 1 | `[contract generated] walked 0 files` | `Error: Refused empty generated inventory` |
| Empty contract usage | `node <repo>/scripts/.gate-proof/case-46/empty.mjs`<br>cwd: `<repo>/scripts/.gate-proof/case-46` | 1 | `[contract usage] walked 0 files` | `Error: Refused empty usage inventory` |
