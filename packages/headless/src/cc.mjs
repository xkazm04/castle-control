#!/usr/bin/env node
// `cc` bin: the headless CLI on plain Node 24 (see ts-resolve.mjs for the hook).
import './ts-resolve.mjs';

const { runCli } = await import('./cli.ts');
await runCli(process.argv.slice(2));
