import { counted, walk } from './files.mjs';
import { run } from './run.mjs';

const tests = walk('e2e', (path) => path.endsWith('.test.ts'));
counted('e2e harness tests', tests);
// Browser specs use .spec.ts; these Node tests need no subprocess isolation.
run('node', ['--test', '--test-isolation=none', ...tests]);
