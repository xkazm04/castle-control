import { createRequire } from 'node:module';
import { run } from '../scripts/run.mjs';

const playwright = createRequire(import.meta.url).resolve('@playwright/test/cli');

// Forward extra arguments only to the desktop lane; failures stop the sequence.
run(process.execPath, [playwright, 'test', '-c', 'e2e/playwright.config.ts', ...process.argv.slice(2)]);
run('pnpm', ['--config.verify-deps-before-run=false', 'run', 'e2e:site']);
