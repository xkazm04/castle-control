import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const port = 5175;
const origin = `http://127.0.0.1:${port}`;

// Build the site first. This separate lane never starts the desktop app.
export default defineConfig({
  testDir: '.', testMatch: 'site.spec.ts', tsconfig: './tsconfig.json',
  outputDir: '../apps/site/dist/browser-results',
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true, reporter: 'list',
  use: { channel: 'chrome', headless: true, baseURL: origin, reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' },
  webServer: {
    command: `pnpm --config.verify-deps-before-run=false --filter @castle-control/site exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: fileURLToPath(new URL('../', import.meta.url)), url: origin,
    reuseExistingServer: false, timeout: 30_000,
  },
});
