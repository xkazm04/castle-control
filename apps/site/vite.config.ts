import type { UserConfig } from 'vite';

// A single entry needs no preload polyfill (and that polyfill would issue requests).
// Keep pnpm's workspace links intact without a Windows network-drive lookup.
export default {
  base: './', resolve: { preserveSymlinks: true }, build: { modulePreload: false },
} satisfies UserConfig;
