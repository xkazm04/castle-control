import { extname } from 'node:path';
import { counted, walk } from './files.mjs';
import { run } from './run.mjs';

const mode = process.argv[2];
const commands = {
  fetch: ['fetch', '--locked'],
  fmt: ['fmt', '--all', '--', '--check'],
  clippy: ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'],
  test: ['test', '--workspace'],
};
if (!Object.hasOwn(commands, mode)) throw new Error(`Unknown Rust gate: ${mode}`);
counted(`cargo ${mode}`, walk('crates', (path) => extname(path) === '.rs'));
run('cargo', ['--config', 'net.offline=false', ...commands[mode]]);
