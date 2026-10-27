import { run } from './run.mjs';
import { counted, walk } from './files.mjs';

const tests = walk('scripts', (path) => path.endsWith('.test.mjs'));
counted('tooling tests', tests);
// These fixtures need no subprocess isolation; avoid nested Windows IPC pipes.
run('node', ['--test', '--test-isolation=none', ...tests]);
