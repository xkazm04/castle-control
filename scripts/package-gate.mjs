import { resolve, extname } from 'node:path';
import ts from 'typescript';
import { counted, walk } from './files.mjs';
import { run } from './run.mjs';

const mode = process.argv[2];
const files = walk(process.cwd(), (path) => ['.ts', '.tsx'].includes(extname(path)));
counted(`pnpm ${mode}`, files);
if (mode === 'typecheck') {
  const config = ts.getParsedCommandLineOfConfigFile(resolve('tsconfig.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); },
  });
  if (!config || config.errors.length) throw new Error('Invalid tsconfig');
  for (const option of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'verbatimModuleSyntax', 'erasableSyntaxOnly']) {
    if (config.options[option] !== true) throw new Error(`Required TypeScript option: ${option}=true`);
  }
  run('pnpm', ['exec', 'tsc', '--project', 'tsconfig.json', '--noEmit']);
} else if (mode === 'lint') {
  run('node', [resolve(import.meta.dirname, 'check.mjs')], { cwd: resolve(import.meta.dirname, '..') });
  run('pnpm', ['exec', 'eslint', 'src', '--max-warnings', '0']);
} else if (mode === 'test') {
  const tests = files.filter((path) => /\.(test|spec)\.[cm]?tsx?$/.test(path));
  counted('pnpm test cases', tests);
  run('pnpm', ['exec', 'vitest', 'run', '--pool=threads']);
} else {
  throw new Error(`Unknown package gate: ${mode}`);
}
