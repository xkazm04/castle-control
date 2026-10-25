import { run } from './run.mjs';

run('node', ['scripts/workspaces.mjs']);
for (const mode of ['fmt', 'clippy', 'test']) {
  run('node', ['scripts/rust-gate.mjs', mode]);
}
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);
run('pnpm', ['test']);
