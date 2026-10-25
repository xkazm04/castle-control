import { extname } from 'node:path';
import { counted, walk } from './files.mjs';
import { run } from './run.mjs';

counted('tooling eslint', walk('scripts', (path) => extname(path) === '.mjs'));
run('node', ['scripts/workspaces.mjs']);
run('node', ['scripts/check.mjs']);
run('pnpm', ['exec', 'eslint', 'scripts', 'eslint.config.js', '--max-warnings', '0']);
