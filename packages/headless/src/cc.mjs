#!/usr/bin/env node
// `cc` bin. Node 24 strips TypeScript types natively; the workspace sources
// (this package and @castle-control/contract) import siblings as `./x.js`
// while the file on disk is `./x.ts`. This in-process resolve hook retries a
// relative `.js` specifier as `.ts` only when the `.js` file does not exist.
// No third-party loader, no network, no file writes.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
      const target = new URL(specifier, context.parentURL);
      const typescript = new URL(`${target.href.slice(0, -3)}.ts`);
      if (!existsSync(fileURLToPath(target)) && existsSync(fileURLToPath(typescript))) {
        return nextResolve(typescript.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { runCli } = await import('./cli.ts');
await runCli(process.argv.slice(2));
