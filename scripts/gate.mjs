import { run } from './run.mjs';

run('node', ['scripts/workspaces.mjs']);
run('node', ['packages/contract/scripts/check.mjs']);
run('node', ['packages/contract/scripts/parity.mjs']);
for (const mode of ['fmt', 'clippy', 'test']) {
  run('node', ['scripts/rust-gate.mjs', mode]);
}
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);
run('pnpm', ['test']);
