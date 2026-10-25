# Castle Control implementation entry point

The authoritative package scopes, acceptance criteria and contract identifiers
are in [03-implementation-plan.md](plan/03-implementation-plan.md). Read
[the plan index](plan/README.md), [analysis](plan/01-analysis.md) and
[UI contract](plan/02-ui.md). The winning prototype is now at
[`../prototype/`](../prototype/); historical links in the snapshot plan remain
unchanged by WP 0.1. Its 18 files were SHA-256 checked byte for byte before the
old directory was removed with filesystem operations.

M0 proves a real Twitch connection before M1. M0–M2 and the floor demo are due
October 30. All phases target the November 2 deadline; the submission package
is due November 2 at 12:00 PT. Public release checks remain separate.

## WP 0.1 foundation

`Cargo.toml` admits `crates/*` with resolver 3. Standalone `cc-twitch` and
`cc-store` can join without root edits. The only initial member is an empty
`cc-types` library; the contract TS package exports no identifiers. Workspace
dependency declarations and pnpm catalogs pin the plan's stack. Lockfiles pin
resolved dependencies. Apache-2.0 and NOTICE establish provenance requirements.

Install with `pnpm install --frozen-lockfile`. Run **`pnpm gate`** locally and in
Windows CI. It runs Rust format, Clippy and tests; recursive package typecheck,
lint and tests; tooling ESLint; import boundaries/cycles; hygiene; code-file
size; and secret scanning. Cargo downloads are explicitly permitted even when
`CARGO_NET_OFFLINE` is set. Each wrapper counts the relevant source inventory
before execution and refuses zero files. Vitest also refuses missing tests.
Vitest uses its threads pool: the headless Windows sandbox denies the default
fork pool's IPC pipe creation. Test isolation and assertions remain enabled.

Each JS/TS package defines the three scripts using `scripts/package-gate.mjs`.
The TypeScript runner checks effective inherited compiler flags before `tsc`.
Boundary checks resolve relative static/dynamic imports and re-exports, reject
cross-package relative imports, private deep workspace imports, undeclared
workspace dependencies and imports of apps, and detect file/package graph cycles.
Workspace subpaths are public only when declared by an exact or wildcard key in
the target package's exports map; conditional targets are accepted, and null
exclusions remain private. Public subpaths still require a declared dependency
and retain package cycle checks. The root gate runs the boundary fixture tests
with Node's test runner in-process before the workspace checks; each fixture
owns a temporary workspace.
The product hygiene gate uses the TypeScript AST; ESLint also rejects unused
variables and empty blocks. Import boundaries currently cover JS/TS; Rust crate
dependency checks remain owned by the packages that introduce those boundaries.

Code checks cover Rust, JS/TS, CSS and HTML outside prototype/docs/metadata.
The secrets scan includes the prototype, docs, manifests and lockfiles; it
reports paths without leaking matched values. Both inventories skip dependency
stores, build output, `.git` and symbolic links/junctions. No gate scans or
modifies the main checkout. Secrets scanning recognizes provider tokens,
private keys and literal credential assignments; it is a heuristic gate.

## Gate proofs

Recorded by `pnpm gate:proofs`: each deliberate violation is restored in a
`finally` block. The following section contains actual non-zero command output,
not expected output. All seeded changes must be absent in the finished tree.

Validation on Windows, 2026-10-25: frozen-lockfile install and `pnpm gate` both
exited 0. Rust format/Clippy/tests walked one source file; recursive TypeScript
checks walked two source files and Vitest passed its one skeleton test. Custom
code gates walked 15 files and secrets scanning walked 62 files. All 35 seeded
failure proofs below passed their diagnostic checks. The old prototype directory
is absent; all 18 moved files also match the original HEAD blobs after normal
Git text normalization (in addition to the pre-delete byte-for-byte hash check).

Export-subpath validation, 2026-10-26: all 14 temporary-workspace boundary tests
passed, as did tooling ESLint and the boundaries, hygiene, file-cap and secrets
checks. The new private workspace import proof reported exit 1 and its source
was restored. The proof suite then stopped at the existing "Workspace scripts"
seed: removing only the test command prefix leaves the appended codegen test
command, so no missing-script defect is introduced. The generated foundation
evidence below was therefore not rewritten. The root gate passed the fixture
tests but stopped at the unchanged contract exporter (`spawnSync cargo EPERM`);
recursive pnpm typecheck and lint also encountered subprocess `EPERM`.

<!-- generated gate proofs -->

### Rust format

Seed: Unformatted temporary function.

Command: `node scripts/rust-gate.mjs fmt` (cwd: `.`)

Exit: 1

```text
[cargo fmt] walked 1 files
Diff in //?/<worktree>/crates/cc-types/src/lib.rs:1:
 //! Contract types and method table will be supplied by WP 0.2.
 
-pub fn proof( ){ }
+pub fn proof() {}
 
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: cargo --config net.offline=false fmt --all -- --check exited 1

```

### Rust Clippy

Seed: Identity operation on a parameter.

Command: `node scripts/rust-gate.mjs clippy` (cwd: `.`)

Exit: 1

```text
[cargo clippy] walked 1 files
    Checking cc-types v0.1.0 (<worktree>/crates/cc-types)
error: this operation has no effect
 --> crates/cc-types/src/lib.rs:3:33
  |
3 | pub fn proof(value: u8) -> u8 { value + 0 }
  |                                 ^^^^^^^^^ help: consider reducing it to: `value`
  |
  = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.97.0/index.html#identity_op
  = note: `-D clippy::identity-op` implied by `-D warnings`
  = help: to override `-D warnings` add `#[allow(clippy::identity_op)]`

error: could not compile `cc-types` (lib) due to 1 previous error
warning: build failed, waiting for other jobs to finish...
error: could not compile `cc-types` (lib test) due to 1 previous error
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: cargo --config net.offline=false clippy --workspace --all-targets -- -D warnings exited 101

```

### Rust tests

Seed: A temporary test asserts false.

Command: `node scripts/rust-gate.mjs test` (cwd: `.`)

Exit: 1

```text
[cargo test] walked 1 files
   Compiling cc-types v0.1.0 (<worktree>/crates/cc-types)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.97s
     Running unittests src/lib.rs (target/debug/deps/cc_types-bd94fbb31fae4979.exe)

running 1 test
test proof::seeded_failure ... FAILED

failures:

---- proof::seeded_failure stdout ----

thread 'proof::seeded_failure' (23244) panicked at crates/cc-types/src/lib.rs:3:56:
seeded proof
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    proof::seeded_failure

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

error: test failed, to rerun pass `--lib`
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: cargo --config net.offline=false test --workspace exited 101

```

### TypeScript typecheck

Seed: Assign a number to a string.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
src/index.ts(4,14): error TS2322: Type 'number' is not assignable to type 'string'.
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: pnpm exec tsc --project tsconfig.json --noEmit exited 2

```

### TypeScript strict

Seed: Disable effective compiler option strict.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/package-gate.mjs:16
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);

Error: Required TypeScript option: strict=true

```

### TypeScript noUncheckedIndexedAccess

Seed: Disable effective compiler option noUncheckedIndexedAccess.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/package-gate.mjs:16
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);

Error: Required TypeScript option: noUncheckedIndexedAccess=true

```

### TypeScript exactOptionalPropertyTypes

Seed: Disable effective compiler option exactOptionalPropertyTypes.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/package-gate.mjs:16
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);

Error: Required TypeScript option: exactOptionalPropertyTypes=true

```

### TypeScript verbatimModuleSyntax

Seed: Disable effective compiler option verbatimModuleSyntax.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/package-gate.mjs:16
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);

Error: Required TypeScript option: verbatimModuleSyntax=true

```

### TypeScript erasableSyntaxOnly

Seed: Disable effective compiler option erasableSyntaxOnly.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm typecheck] walked 2 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/package-gate.mjs:16
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);

Error: Required TypeScript option: erasableSyntaxOnly=true

```

### Package ESLint

Seed: Unused local variable.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs lint` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm lint] walked 2 files
[boundaries] walked 15 files
[hygiene] walked 15 files
[file-cap] walked 15 files
[secrets] walked 63 files

<worktree>/packages/contract/src/index.ts
  4:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)

file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: pnpm exec eslint src --max-warnings 0 exited 1

```

### Tooling ESLint

Seed: Unused variable in the tooling tree.

Command: `node scripts/tooling-lint.mjs` (cwd: `.`)

Exit: 1

```text
[tooling eslint] walked 12 files
[workspace manifests] walked 1 files
[workspace TypeScript] walked 2 files
[boundaries] walked 16 files
[hygiene] walked 16 files
[file-cap] walked 16 files
[secrets] walked 64 files

<worktree>/scripts/proof-unused.mjs
  1:7  error  'unusedProof' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)

file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: pnpm exec eslint scripts eslint.config.js --max-warnings 0 exited 1

```

### Vitest

Seed: Temporary test expects false to equal true.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs test` (cwd: `packages\contract`)

Exit: 1

```text
[pnpm test] walked 3 files
[pnpm test cases] walked 2 files

 RUN  v5.0.5 C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/packages/contract

 ❯ src/proof.test.ts (1 test | 1 failed) 5ms
   × seeded proof 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/proof.test.ts > seeded proof
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/proof.test.ts:2:44
      1| import { test, expect } from 'vitest';
      2| test('seeded proof', () => { expect(false).toBe(true); });
       |                                            ^
      3|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 1 passed (2)
   Start at  19:19:16
   Duration  108ms (transform 47%, import 28%, tests 14%, worker 11%)

file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/run.mjs:10
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);

Error: pnpm exec vitest run --pool=threads exited 1

```

### Import boundary

Seed: A contract source imports root tooling by relative path.

Command: `node scripts/check.mjs boundaries` (cwd: `.`)

Exit: 1

```text
[boundaries] walked 15 files
<worktree>/packages/contract/src/index.ts: cross-package relative import ../../../scripts/files.mjs
```

### Import cycle

Seed: Two contract source files import one another.

Command: `node scripts/check.mjs boundaries` (cwd: `.`)

Exit: 1

```text
[boundaries] walked 17 files
import cycle: <worktree>/packages/contract/src/proof-a.ts
```

### No any

Seed: export const proof: any = 1;

Command: `node scripts/check.mjs hygiene` (cwd: `.`)

Exit: 1

```text
[hygiene] walked 15 files
<worktree>/packages/contract/src/index.ts:4: no any
```

### No double assertion

Seed: export const proof = 1 as unknown as string;

Command: `node scripts/check.mjs hygiene` (cwd: `.`)

Exit: 1

```text
[hygiene] walked 15 files
<worktree>/packages/contract/src/index.ts:4: no as unknown as
```

### Keymap registry

Seed: document.addEventListener('keydown', () => {});

Command: `node scripts/check.mjs hygiene` (cwd: `.`)

Exit: 1

```text
[hygiene] walked 15 files
<worktree>/packages/contract/src/index.ts:4: use the keymap registry
```

### No swallowed catch

Seed: try { throw new Error(); } catch { /* swallowed */ }

Command: `node scripts/check.mjs hygiene` (cwd: `.`)

Exit: 1

```text
[hygiene] walked 15 files
<worktree>/packages/contract/src/index.ts:4: no swallowed catch
```

### 400-line cap

Seed: 401 lines of comments in a temporary source file.

Command: `node scripts/check.mjs file-cap` (cwd: `.`)

Exit: 1

```text
[file-cap] walked 16 files
packages/contract/src/proof-long.ts: 401 lines exceeds 400
```

### Secret scan

Seed: Synthetic provider-token-shaped string in the reference prototype; value is redacted.

Command: `node scripts/check.mjs secrets` (cwd: `.`)

Exit: 1

```text
[secrets] walked 64 files
prototype/proof-secret.txt: potential secret (value redacted)
```

### Workspace scripts

Seed: Remove the contract test script value.

Command: `node scripts/workspaces.mjs` (cwd: `.`)

Exit: 1

```text
[workspace manifests] walked 1 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/workspaces.mjs:20
      throw new Error(`${manifest}: missing ${script} script`);

Error: packages/contract/package.json: missing test script

```

### Empty boundaries

Seed: An empty isolated directory.

Command: `node scripts/check.mjs boundaries C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\.gate-proof\empty` (cwd: `.`)

Exit: 1

```text
[boundaries] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: boundaries: refused empty inventory

```

### Empty hygiene

Seed: An empty isolated directory.

Command: `node scripts/check.mjs hygiene C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\.gate-proof\empty` (cwd: `.`)

Exit: 1

```text
[hygiene] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: hygiene: refused empty inventory

```

### Empty file-cap

Seed: An empty isolated directory.

Command: `node scripts/check.mjs file-cap C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\.gate-proof\empty` (cwd: `.`)

Exit: 1

```text
[file-cap] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: file-cap: refused empty inventory

```

### Empty secrets

Seed: An empty isolated directory.

Command: `node scripts/check.mjs secrets C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\.gate-proof\empty` (cwd: `.`)

Exit: 1

```text
[secrets] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: secrets: refused empty inventory

```

### Empty Rust fmt

Seed: No crates or Rust sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\rust-gate.mjs fmt` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[cargo fmt] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: cargo fmt: refused empty inventory

```

### Empty Rust clippy

Seed: No crates or Rust sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\rust-gate.mjs clippy` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[cargo clippy] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: cargo clippy: refused empty inventory

```

### Empty Rust test

Seed: No crates or Rust sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\rust-gate.mjs test` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[cargo test] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: cargo test: refused empty inventory

```

### Empty package typecheck

Seed: No TS sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs typecheck` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[pnpm typecheck] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: pnpm typecheck: refused empty inventory

```

### Empty package lint

Seed: No TS sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs lint` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[pnpm lint] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: pnpm lint: refused empty inventory

```

### Empty package test

Seed: No TS sources in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs test` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[pnpm test] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: pnpm test: refused empty inventory

```

### Empty test cases

Seed: A source file with no matching tests.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\package-gate.mjs test` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[pnpm test] walked 1 files
[pnpm test cases] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: pnpm test cases: refused empty inventory

```

### Empty tooling lint

Seed: No tooling files in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\tooling-lint.mjs` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[tooling eslint] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: tooling eslint: refused empty inventory

```

### Empty workspace manifests

Seed: No workspace manifests in isolated directory.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\workspaces.mjs` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[workspace manifests] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: workspace manifests: refused empty inventory

```

### Empty workspace TypeScript

Seed: A manifest with scripts but no TS sources.

Command: `node C:\Users\kazda\.personas\headless-masters\worktrees\castlecontrol\7470efae\scripts\workspaces.mjs` (cwd: `scripts\.gate-proof\empty`)

Exit: 1

```text
[workspace manifests] walked 1 files
[workspace TypeScript] walked 0 files
file:///C:/Users/kazda/.personas/headless-masters/worktrees/castlecontrol/7470efae/scripts/files.mjs:37
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);

Error: workspace TypeScript: refused empty inventory

```
