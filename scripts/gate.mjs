import { run } from './run.mjs';
import { counted, walk } from './files.mjs';

const toolingTests = walk('scripts', (path) => path.endsWith('.test.mjs'));
counted('tooling tests', toolingTests);
// These fixtures need no subprocess isolation; avoid nested Windows IPC pipes.
run('node', ['--test', '--test-isolation=none', ...toolingTests]);
run('node', ['scripts/workspaces.mjs']);
run('node', ['packages/contract/scripts/check.mjs']);
run('node', ['packages/contract/scripts/parity.mjs']);
for (const mode of ['fmt', 'clippy', 'test']) {
  run('node', ['scripts/rust-gate.mjs', mode]);
}
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);
run('pnpm', ['test']);
