import { run } from './run.mjs';

run('node', ['scripts/tooling-test.mjs']);
run('node', ['scripts/workspaces.mjs']);
// Fetch every platform in the lockfile before any Cargo-backed checks.
// Offline all-target dependency inventories must never depend on a warm cache.
run('node', ['scripts/rust-gate.mjs', 'fetch']);
run('node', ['packages/contract/scripts/check.mjs']);
run('node', ['packages/contract/scripts/parity.mjs']);
for (const mode of ['fmt', 'clippy', 'test']) {
  run('node', ['scripts/rust-gate.mjs', mode]);
}
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);
run('pnpm', ['test']);
